const Order = require("../models/Order");
const Product = require("../models/Product");
const Basket = require("../models/Basket");
const Complaint = require("../models/Complaint");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { broadcast } = require("../utils/realtime");
const notificationService = require("../services/notificationService");

const priceFor = (product, quantity, role) => {
  if (role !== "verified_wholesale") return product.retailPrice;
  const tier = [...(product.tierPrices || [])]
    .sort((a, b) => b.minQuantity - a.minQuantity)
    .find((item) => quantity >= item.minQuantity);
  return tier?.price ?? product.retailPrice;
};

const quoteItems = async (items, role) => {
  if (!Array.isArray(items) || items.length === 0)
    throw new Error("Basket cannot be empty");
  const grouped = items.reduce((result, item) => {
    const quantity = Number(item.quantity);
    if (!item.product || !Number.isInteger(quantity) || quantity < 1)
      throw new Error("Each item needs a valid product and quantity");
    result[item.product] = (result[item.product] || 0) + quantity;
    return result;
  }, {});

  const products = await Product.find({
    _id: { $in: Object.keys(grouped) },
    isActive: { $ne: false },
  });
  if (products.length !== Object.keys(grouped).length)
    throw new Error("One or more products are no longer available");

  const quotedItems = products.map((product) => {
    const quantity = grouped[product._id.toString()];
    if (product.stock < quantity)
      throw new Error(
        `Insufficient stock for ${product.name}. Remaining: ${product.stock}`,
      );
    const unitPrice = priceFor(product, quantity, role);
    return {
      product,
      quantity,
      unitPrice,
      retailSubtotal: product.retailPrice * quantity,
    };
  });
  return quotedItems;
};

exports.quoteOrder = async (req, res) => {
  try {
    const quotedItems = await quoteItems(req.body.items, req.user.role);
    const items = quotedItems.map(
      ({ product, quantity, unitPrice, retailSubtotal }) => ({
        productId: product._id,
        quantity,
        unitPrice,
        retailSubtotal,
        total: unitPrice * quantity,
        stockStatus: product.stockStatus,
      }),
    );
    const subtotalAmount = items.reduce(
      (total, item) => total + item.retailSubtotal,
      0,
    );
    const totalAmount = items.reduce((total, item) => total + item.total, 0);
    res.status(200).json({
      success: true,
      items,
      subtotalAmount,
      discountAmount: subtotalAmount - totalAmount,
      taxAmount: 0,
      totalAmount,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.createOrder = async (req, res) => {
  try {
    const { items, pickupSlot, paymentMethod, paymentProofUrl, notes } =
      req.body;

    if (!items || items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Basket cannot be empty" });
    }

    const quotedItems = await quoteItems(items, req.user.role);
    const verifiedOrderItems = quotedItems.map(
      ({ product, quantity, unitPrice }) => ({
        product: product._id,
        quantity,
        priceAtPurchase: unitPrice,
      }),
    );
    const subtotalAmount = quotedItems.reduce(
      (total, item) => total + item.retailSubtotal,
      0,
    );
    const calculatedTotal = quotedItems.reduce(
      (total, item) => total + item.unitPrice * item.quantity,
      0,
    );

    for (const item of quotedItems) {
      const updated = await Product.findOneAndUpdate(
        { _id: item.product._id, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } },
        { returnDocument: "after" },
      );
      if (!updated)
        return res.status(409).json({
          success: false,
          message: `${item.product.name} just changed stock. Review your cart and try again.`,
        });
      broadcast("catalog-updated", {
        productId: updated._id,
        action: "stock-updated",
        stockStatus: updated.stockStatus,
      });
    }

    const targetPaymentStatus =
      paymentMethod === "Digital QR Transfer" ? "Pending Proof" : "Unpaid";

    const order = await Order.create({
      user: req.user.id,
      items: verifiedOrderItems,
      totalAmount: calculatedTotal,
      subtotalAmount,
      discountAmount: subtotalAmount - calculatedTotal,
      taxAmount: 0,
      pickupSlot,
      paymentMethod,
      paymentStatus: targetPaymentStatus,
      paymentProofUrl:
        paymentMethod === "Digital QR Transfer" ? paymentProofUrl : "",
      notes,
    });

    // US #31 — in-app confirmation that Pathivara received the order
    const shortId = order._id.toString().slice(-4).toUpperCase();
    await Notification.create({
      user: req.user.id,
      title: `Order placed — PWS-${shortId}`,
      message: `We received your order. It will be ready for pickup at your chosen slot.`,
      type: "order",
    });
    broadcast("order-updated", {
      orderId: order._id,
      userId: order.user,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
    });

    // Send Twilio SMS and WhatsApp notifications asynchronously
    if (req.user && req.user.phone) {
      const smsMessage = `Pathivara Store: Your order PWS-${shortId} has been successfully placed. Slot: ${pickupSlot}. Status: Placed.`;
      const waMessage = `Pathivara Store: Hello! Your order *PWS-${shortId}* is received. Status: *Placed*. Pickup Slot: *${pickupSlot}*. We will notify you when it's processing.`;

      notificationService
        .sendSMS(req.user.phone, smsMessage)
        .catch((err) => console.error("Error sending SMS:", err));
      notificationService
        .sendWhatsApp(req.user.phone, waMessage)
        .catch((err) => console.error("Error sending WhatsApp:", err));
    }

    res.status(201).json({
      success: true,
      message: "Order checked out and secured successfully",
      order,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitPaymentProof = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user.id,
    });
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    if (order.paymentMethod !== "Digital QR Transfer")
      return res.status(400).json({
        success: false,
        message: "This order does not require digital payment proof",
      });
    const {
      transactionId = "",
      note = "",
      imageName = "",
      imageDataUrl = "",
    } = req.body;
    if (!transactionId && !imageDataUrl)
      return res.status(400).json({
        success: false,
        message: "Enter a transaction ID or attach a payment screenshot",
      });
    order.paymentProof = {
      transactionId,
      note,
      imageName,
      imageDataUrl,
      submittedAt: new Date(),
    };
    order.paymentStatus = "Verifying";
    await order.save();
    res
      .status(200)
      .json({ success: true, message: "Payment proof submitted", order });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getBaskets = async (req, res) => {
  const baskets = await Basket.find({ user: req.user.id })
    .populate("items.product", "name unit retailPrice stock imageUrl")
    .sort({ updatedAt: -1 });
  res.status(200).json({ success: true, baskets });
};

exports.saveBasket = async (req, res) => {
  try {
    const { name, items } = req.body;
    if (!name?.trim())
      return res
        .status(400)
        .json({ success: false, message: "Basket name is required" });
    await quoteItems(items, req.user.role);
    const basket = await Basket.create({
      user: req.user.id,
      name: name.trim(),
      items: items.map((item) => ({
        product: item.product,
        quantity: item.quantity,
      })),
    });
    res.status(201).json({ success: true, basket });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.reviewBasket = async (req, res) => {
  try {
    const basket = await Basket.findOne({
      _id: req.params.id,
      user: req.user.id,
    });
    if (!basket)
      return res
        .status(404)
        .json({ success: false, message: "Basket not found" });
    const quotedItems = await quoteItems(basket.items, req.user.role);
    res.status(200).json({
      success: true,
      basket,
      items: quotedItems.map(({ product, quantity, unitPrice }) => ({
        product,
        quantity,
        unitPrice,
        stockStatus: product.stockStatus,
      })),
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.createComplaint = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user.id,
    });
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    const {
      issueType,
      description,
      imageName = "",
      imageDataUrl = "",
    } = req.body;
    const complaint = await Complaint.create({
      order: order._id,
      user: req.user.id,
      issueType,
      description,
      imageName,
      imageDataUrl,
    });
    res.status(201).json({ success: true, complaint });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate("items.product", "name unit retailPrice imageUrl")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("user", "fullName phone")
      .populate("items.product", "name unit");

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order records not found" });
    }

    if (
      order.user._id.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Access denied to this layout" });
    }

    res.status(200).json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderStatus, paymentStatus } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order target not found" });
    }

    if (orderStatus) order.orderStatus = orderStatus;
    if (paymentStatus) order.paymentStatus = paymentStatus;

    await order.save();

    await Notification.create({
      user: order.user,
      title: `Order ${order.orderStatus}`,
      message: `Your pickup order is now ${order.orderStatus}.`,
      type: "order",
    });

    broadcast("order-updated", {
      orderId: order._id,
      userId: order.user,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
    });

    // Send external Twilio SMS notifications
    const shortId = order._id.toString().slice(-4).toUpperCase();
    const userDoc = await User.findById(order.user);
    if (userDoc && userDoc.phone) {
      if (orderStatus === "Acknowledged") {
        const smsMessage = `Pathivara Store: Your order PWS-${shortId} has been accepted by the vendor and is being processed.`;
        notificationService
          .sendSMS(userDoc.phone, smsMessage)
          .catch((err) => console.error("Error sending SMS:", err));
      } else if (orderStatus === "Ready") {
        const smsMessage = `Pathivara Store: Your order PWS-${shortId} is ready for pickup! Please arrive at your chosen slot: ${order.pickupSlot}.`;
        notificationService
          .sendSMS(userDoc.phone, smsMessage)
          .catch((err) => console.error("Error sending SMS:", err));
      }
    }

    res.status(200).json({
      success: true,
      message: "Fulfillment indicators updated successfully",
      order,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAdminOrders = async (_req, res) => {
  const orders = await Order.find()
    .populate("user", "fullName phone")
    .populate("items.product", "name unit")
    .sort({ createdAt: -1 });
  res.status(200).json({ success: true, orders });
};

exports.updatePaymentStatus = async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    if (!["Paid", "Rejected"].includes(paymentStatus))
      return res
        .status(400)
        .json({ success: false, message: "Choose Paid or Rejected" });
    const order = await Order.findById(req.params.id);
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    order.paymentStatus = paymentStatus;
    await order.save();
    await Notification.create({
      user: order.user,
      title: `Payment ${paymentStatus}`,
      message:
        paymentStatus === "Paid"
          ? "Your digital payment has been confirmed."
          : "Your payment proof was rejected. Please submit it again.",
      type: "payment",
    });
    broadcast("order-updated", {
      orderId: order._id,
      userId: order.user,
      orderStatus: order.orderStatus,
      paymentStatus,
    });
    res.status(200).json({ success: true, order });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getNotifications = async (req, res) => {
  const notifications = await Notification.find({ user: req.user.id })
    .sort({ createdAt: -1 })
    .limit(20);
  res.status(200).json({
    success: true,
    notifications,
    unreadCount: notifications.filter((item) => !item.read).length,
  });
};

exports.markNotificationsRead = async (req, res) => {
  await Notification.updateMany(
    { user: req.user.id, read: false },
    { read: true },
  );
  res.status(200).json({ success: true });
};
