const Order = require("../models/Order");
const Product = require("../models/Product");
const Basket = require("../models/Basket");
const Complaint = require("../models/Complaint");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { broadcast } = require("../utils/realtime");
const notificationService = require("../services/notificationService");
const templates = require("../services/messageTemplates");

const priceFor = (product, quantity, role) => {
  if (role !== "verified_wholesale") return product.retailPrice;
  const tier = [...(product.tierPrices || [])]
    .sort((a, b) => b.minQuantity - a.minQuantity)
    .find((item) => quantity >= item.minQuantity);
  return tier?.price ?? product.retailPrice;
};

const nextTierFor = (product, quantity, role) => {
  if (role !== "verified_wholesale") return null;
  const tier = [...(product.tierPrices || [])]
    .sort((a, b) => a.minQuantity - b.minQuantity)
    .find((item) => quantity < item.minQuantity);
  return tier ? { minQuantity: tier.minQuantity, price: tier.price } : null;
};

const dispatchOrderEvent = async (
  order,
  copy,
  { phone, sms = false, whatsapp = false, type = "order" } = {},
) => {
  if (copy.inApp) {
    await Notification.create({ user: order.user, ...copy.inApp, type });
  }

  broadcast(
    "order-updated",
    {
      orderId: order._id,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      push: copy.push,
    },
    { userId: order.user },
  );

  if (phone && (sms || whatsapp)) {
    await notificationService.notify(
      phone,
      {
        sms: sms ? copy.sms : undefined,
        whatsapp: whatsapp ? copy.whatsapp : undefined,
      },
      copy.ref || "",
    );
  }
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
    const retailSubtotal = product.retailPrice * quantity;
    return {
      product,
      quantity,
      unitPrice,
      retailSubtotal,
      discount: Math.max(0, retailSubtotal - unitPrice * quantity),
      nextTier: nextTierFor(product, quantity, role),
    };
  });
  return quotedItems;
};

exports.quoteOrder = async (req, res) => {
  try {
    const quotedItems = await quoteItems(req.body.items, req.user.role);
    const items = quotedItems.map(
      ({
        product,
        quantity,
        unitPrice,
        retailSubtotal,
        discount,
        nextTier,
      }) => ({
        productId: product._id,
        quantity,
        unitPrice,
        retailSubtotal,
        discount,
        nextTier,
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

    const expectedPrices = new Map(
      items
        .filter((item) => item.expectedUnitPrice != null)
        .map((item) => [String(item.product), Number(item.expectedUnitPrice)]),
    );
    const repriced = quotedItems.filter((item) => {
      const expected = expectedPrices.get(String(item.product._id));
      return expected != null && expected !== item.unitPrice;
    });
    if (repriced.length) {
      return res.status(409).json({
        success: false,
        message: `Price changed for ${repriced
          .map((item) => item.product.name)
          .join(", ")}. Review your cart and confirm again.`,
        items: quotedItems.map(({ product, quantity, unitPrice }) => ({
          productId: product._id,
          quantity,
          unitPrice,
        })),
      });
    }

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

    await dispatchOrderEvent(order, templates.orderPlaced(order), {
      phone: req.user.phone,
      sms: true,
      whatsapp: true,
    });

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

exports.getBaskets = async (req, res, next) => {
  try {
    const baskets = await Basket.find({ user: req.user.id })
      .populate("items.product", "name unit retailPrice stock imageUrl")
      .sort({ updatedAt: -1 });
    res.status(200).json({ success: true, baskets });
  } catch (error) {
    next(error);
  }
};

exports.saveBasket = async (req, res) => {
  try {
    const { name, items } = req.body;
    if (!name?.trim())
      return res
        .status(400)
        .json({ success: false, message: "Basket name is required" });
    const quotedItems = await quoteItems(items, req.user.role);
    const basket = await Basket.create({
      user: req.user.id,
      name: name.trim(),
      items: quotedItems.map(({ product, quantity, unitPrice }) => ({
        product: product._id,
        quantity,
        priceAtSave: unitPrice,
      })),
    });
    res.status(201).json({ success: true, basket });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.reviewBasket = async (req, res, next) => {
  try {
    const basket = await Basket.findOne({
      _id: req.params.id,
      user: req.user.id,
    });
    if (!basket)
      return res
        .status(404)
        .json({ success: false, message: "Basket not found" });

    const products = await Product.find({
      _id: { $in: basket.items.map((item) => item.product) },
      isActive: { $ne: false },
    });
    const byId = new Map(
      products.map((product) => [String(product._id), product]),
    );

    const items = basket.items.map((entry) => {
      const product = byId.get(String(entry.product));
      const priceAtSave = entry.priceAtSave ?? null;

      if (!product) {
        return {
          productId: entry.product,
          name: "No longer available",
          quantity: entry.quantity,
          unitPrice: 0,
          priceAtSave,
          priceDelta: 0,
          available: false,
          stockStatus: "Out of Stock",
          lineTotal: 0,
        };
      }

      const unitPrice = priceFor(product, entry.quantity, req.user.role);
      return {
        productId: product._id,
        product,
        name: product.name,
        unit: product.unit,
        quantity: entry.quantity,
        unitPrice,
        priceAtSave,
        priceDelta: priceAtSave == null ? 0 : unitPrice - priceAtSave,
        available: product.stock >= entry.quantity,
        stock: product.stock,
        stockStatus: product.stockStatus,
        lineTotal: unitPrice * entry.quantity,
      };
    });

    const availableItems = items.filter((item) => item.available);
    res.status(200).json({
      success: true,
      basket,
      items,
      summary: {
        availableCount: availableItems.length,
        priceChangedCount: items.filter((item) => item.priceDelta !== 0).length,
        outOfStockCount: items.length - availableItems.length,
        estimatedTotal: availableItems.reduce(
          (total, item) => total + item.lineTotal,
          0,
        ),
      },
    });
  } catch (error) {
    next(error);
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

    const copyFor = {
      Placed: templates.orderPlaced,
      Acknowledged: templates.orderAcknowledged,
      Ready: templates.orderReady,
      Collected: templates.orderCollected,
    }[order.orderStatus];

    const buyer = await User.findById(order.user);
    await dispatchOrderEvent(order, copyFor(order), {
      phone: buyer?.phone,
      sms: ["Acknowledged", "Ready"].includes(order.orderStatus),
    });

    res.status(200).json({
      success: true,
      message: "Fulfillment indicators updated successfully",
      order,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAdminOrders = async (_req, res, next) => {
  try {
    const orders = await Order.find()
      .populate("user", "fullName phone")
      .populate("items.product", "name unit retailPrice")
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, orders });
  } catch (error) {
    next(error);
  }
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
    await dispatchOrderEvent(order, templates.paymentDecision(paymentStatus), {
      type: "payment",
    });
    res.status(200).json({ success: true, order });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20);
    res.status(200).json({
      success: true,
      notifications,
      unreadCount: notifications.filter((item) => !item.read).length,
    });
  } catch (error) {
    next(error);
  }
};

exports.markNotificationRead = async (req, res, next) => {
  try {
    await Notification.updateOne(
      { _id: req.params.id, user: req.user.id },
      { read: true },
    );
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

exports.markNotificationsRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { user: req.user.id, read: false },
      { read: true },
    );
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};
