const Order = require("../models/Order");
const Product = require("../models/Product");

exports.createOrder = async (req, res) => {
  try {
    const { items, pickupSlot, paymentMethod, paymentProofUrl, notes } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: "Basket cannot be empty" });
    }

    let calculatedTotal = 0;
    const verifiedOrderItems = [];

    const userRole = req.user.role; 

    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(404).json({ success: false, message: `Product ${item.product} not found` });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({ 
          success: false, 
          message: `Insufficient stock for ${product.name}. Remaining: ${product.stock}` 
        });
      }

      let finalUnitPrice = product.retailPrice;

      if (userRole === "verified_wholesale" && product.tierPrices && product.tierPrices.length > 0) {
        const sortedTiers = [...product.tierPrices].sort((a, b) => b.minQuantity - a.minQuantity);
        const matchingTier = sortedTiers.find(tier => item.quantity >= tier.minQuantity);
        
        if (matchingTier) {
          finalUnitPrice = matchingTier.price;
        }
      }

      product.stock -= item.quantity;
      await product.save();

      verifiedOrderItems.push({
        product: product._id,
        quantity: item.quantity,
        priceAtPurchase: finalUnitPrice 
      });

      calculatedTotal += finalUnitPrice * item.quantity;
    }

    const targetPaymentStatus = paymentMethod === "Digital QR Transfer" ? "Verifying" : "Unpaid";

    const order = await Order.create({
      user: req.user.id,
      items: verifiedOrderItems,
      totalAmount: calculatedTotal,
      pickupSlot,
      paymentMethod,
      paymentStatus: targetPaymentStatus,
      paymentProofUrl: paymentMethod === "Digital QR Transfer" ? paymentProofUrl : "",
      notes
    });

    res.status(201).json({
      success: true,
      message: "Order checked out and secured successfully",
      order
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate("items.product", "name unit imageUrl")
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

    res.status(200).json({
      success: true,
      message: "Fulfillment indicators updated successfully",
      order,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
