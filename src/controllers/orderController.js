const Order = require("../models/Order");
const Product = require("../models/Product");
const Basket = require("../models/Basket");
const Complaint = require("../models/Complaint");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { broadcast } = require("../utils/realtime");
const notificationService = require("../services/notificationService");
const templates = require("../services/messageTemplates");
const { ensureWholesaleNotice } = require("../services/accountNotices");
const { notifyAdmins } = require("../services/adminNotices");
const {
  VAT_RATE,
  settleTotals,
  tierAt,
  nextTierAfter,
  tiersFor,
  unitPriceFor,
  lineDiscount,
} = require("../config/pricing");

const segmentsFor = (tiers, activeTier) => {
  if (!activeTier || !tiers.length) return 0;
  const reached = tiers.indexOf(activeTier) + 1;
  if (reached === tiers.length) return 3;
  return Math.max(1, Math.round((reached / tiers.length) * 3) || 1);
};

const ISSUE_LABELS = {
  missing: "missing item",
  damaged: "damaged item",
  wrong: "wrong item",
  other: "problem",
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
  }).select("+costPrice");
  if (products.length !== Object.keys(grouped).length)
    throw new Error("One or more products are no longer available");

  const quotedItems = products.map((product) => {
    const quantity = grouped[product._id.toString()];
    if (product.stock < quantity)
      throw new Error(
        `Insufficient stock for ${product.name}. Remaining: ${product.stock}`,
      );
    const unitPrice = unitPriceFor(product, role);
    const retailSubtotal = unitPrice * quantity;
    const tiers = tiersFor(product, role);
    return {
      product,
      quantity,
      unitPrice,
      retailSubtotal,
      discount: lineDiscount(tiers, quantity, unitPrice),
      tiers,
      nextTier: nextTierAfter(tiers, quantity),
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
        tiers,
        nextTier,
      }) => {
        const activeTier = tierAt(tiers, quantity);
        return {
          productId: product._id,
          quantity,
          unitPrice,
          retailUnitPrice: unitPrice,
          retailSubtotal,
          discount,
          tiers,
          nextTier,
          threshold: tiers[0]?.minQuantity ?? null,
          unlocked: Boolean(activeTier),
          segments: segmentsFor(tiers, activeTier),
          total: Math.max(0, retailSubtotal - discount),
          stockStatus: product.stockStatus,
          unit: product.unit,
          name: product.name,
        };
      },
    );
    const subtotalAmount = items.reduce(
      (total, item) => total + item.retailSubtotal,
      0,
    );
    const discountAmount = items.reduce(
      (total, item) => total + item.discount,
      0,
    );
    const { netAmount, taxAmount, totalAmount } = settleTotals({
      subtotalAmount,
      discountAmount,
    });
    res.status(200).json({
      success: true,
      items,
      subtotalAmount,
      discountAmount,
      netAmount,
      taxRate: VAT_RATE,
      taxAmount,
      totalAmount,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.createOrder = async (req, res) => {
  try {
    const {
      items,
      pickupSlot,
      paymentMethod,
      paymentProofUrl,
      notes,
      contactName,
      contactPhone,
    } = req.body;

    if (!items || items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Basket cannot be empty" });
    }

    const orderContactPhone = (contactPhone || "").trim();
    if (orderContactPhone && !/^\d{10}$/.test(orderContactPhone)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 10-digit contact number",
      });
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
          retailUnitPrice: unitPrice,
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
    const discountAmount = quotedItems.reduce(
      (total, item) => total + item.discount,
      0,
    );
    const costAmount = quotedItems.reduce(
      (total, item) => total + (item.product.costPrice || 0) * item.quantity,
      0,
    );
    const { taxAmount, totalAmount } = settleTotals({
      subtotalAmount,
      discountAmount,
    });

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
      totalAmount,
      subtotalAmount,
      discountAmount,
      taxAmount,
      costAmount,
      pickupSlot,
      paymentMethod,
      paymentStatus: targetPaymentStatus,
      paymentProofUrl:
        paymentMethod === "Digital QR Transfer" ? paymentProofUrl : "",
      notes,
      contactName: (contactName || "").trim(),
      contactPhone: orderContactPhone,
    });

    await dispatchOrderEvent(order, templates.orderPlaced(order), {
      phone: orderContactPhone || req.user.phone,
      sms: true,
      whatsapp: true,
    });

    await notifyAdmins({
      title: "New order placed",
      message: `${req.user.fullName || "A customer"} placed an order for Rs. ${totalAmount}.`,
      type: "order",
      link: "/admin/orders",
      key: `admin:order-placed:${order._id}`,
    });

    const buyerCopy = order.toObject();
    delete buyerCopy.costAmount;

    res.status(201).json({
      success: true,
      message: "Order checked out and secured successfully",
      order: buyerCopy,
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

    if (!imageDataUrl)
      return res.status(400).json({
        success: false,
        message: "Attach a screenshot of the completed payment",
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

    await notifyAdmins({
      title: "Payment proof to verify",
      message: `${req.user.fullName || "A customer"} uploaded proof for Rs. ${order.totalAmount}.`,
      type: "payment",
      link: "/admin/payments",
      key: `admin:payment-proof:${order._id}:${order.paymentProof.submittedAt.getTime()}`,
    });

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
      .populate(
        "items.product",
        "name unit retailPrice wholesalePrice stock imageUrl discountTiers wholesaleDiscountTiers discountable category",
      )
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

      const unitPrice = unitPriceFor(product, req.user.role);
      const discount = lineDiscount(
        tiersFor(product, req.user.role),
        entry.quantity,
        unitPrice,
      );
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
        lineTotal: Math.max(0, unitPrice * entry.quantity - discount),
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

    await notifyAdmins({
      title: "New complaint filed",
      message: `${req.user.fullName || "A customer"} reported a ${ISSUE_LABELS[complaint.issueType] || "problem"} on order ${templates.orderRef(order._id)}.`,
      type: "complaint",
      link: "/admin/complaints",
      key: `admin:complaint:${complaint._id}`,
    });

    res.status(201).json({ success: true, complaint });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getMyComplaints = async (req, res, next) => {
  try {
    const complaints = await Complaint.find({ user: req.user.id })
      .select("-imageDataUrl")
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, complaints });
  } catch (error) {
    next(error);
  }
};

exports.getAdminComplaints = async (req, res, next) => {
  try {
    const complaints = await Complaint.find()
      .populate("user", "fullName phone")
      .populate("handledBy", "fullName")
      .populate({
        path: "order",
        select: "totalAmount orderStatus paymentStatus createdAt items",
        populate: { path: "items.product", select: "name unit" },
      })
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, complaints });
  } catch (error) {
    next(error);
  }
};

exports.updateComplaintStatus = async (req, res, next) => {
  try {
    const { status, resolutionNote = "" } = req.body;
    if (!["Open", "In Review", "Resolved"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Unknown complaint status" });
    }
    if (status === "Resolved" && !resolutionNote.trim()) {
      return res.status(400).json({
        success: false,
        message: "Add a short note describing how this was resolved",
      });
    }

    const complaint = await Complaint.findById(req.params.complaintId);
    if (!complaint) {
      return res
        .status(404)
        .json({ success: false, message: "Complaint not found" });
    }

    complaint.status = status;
    complaint.resolutionNote = resolutionNote.trim();
    complaint.handledBy = req.user.id;
    complaint.resolvedAt = status === "Resolved" ? new Date() : null;
    await complaint.save();

    // Close the loop with the buyer — the form promises a reply within 24h.
    const copy = templates.complaintUpdated(
      complaint,
      templates.orderRef(complaint.order),
    );
    await Notification.create({
      user: complaint.user,
      ...copy.inApp,
      type: "complaint",
    });
    broadcast(
      "order-updated",
      { orderId: complaint.order, push: copy.push },
      { userId: complaint.user },
    );

    res.status(200).json({ success: true, complaint });
  } catch (error) {
    next(error);
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate(
        "items.product",
        "name unit retailPrice wholesalePrice imageUrl discountTiers wholesaleDiscountTiers discountable stock category",
      )
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
      phone: order.contactPhone || buyer?.phone,
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
      .select("+costAmount")
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
    await ensureWholesaleNotice(req.user);

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
