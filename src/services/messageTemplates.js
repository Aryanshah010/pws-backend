const BRAND = "Pathivara Store";

const orderRef = (orderId) =>
  `PWS-${orderId.toString().slice(-4).toUpperCase()}`;

module.exports = {
  BRAND,
  orderRef,

  passwordResetOtp: (otp) => ({
    sms: `${BRAND}: ${otp} is your password reset code. It expires in 10 minutes. Do not share this code with anyone.`,
    whatsapp: `*${BRAND}*\n\nYour password reset code is *${otp}*.\nIt expires in 10 minutes.\n\nIf you did not request this, please ignore this message.`,
  }),

  orderPlaced: (order) => {
    const ref = orderRef(order._id);
    return {
      ref,
      sms: `${BRAND}: Order ${ref} received. Pickup slot: ${order.pickupSlot}. Status: Placed. We will text you when it is ready.`,
      whatsapp: `*${BRAND}*\n\nYour order *${ref}* has been received. ✅\n\nStatus: *Placed*\nPickup slot: *${order.pickupSlot}*\nTotal: *Rs. ${order.totalAmount}*\n\nWe will notify you as soon as the vendor accepts it.`,
      push: {
        title: `Order ${ref} placed`,
        body: `We received your order. Pickup slot: ${order.pickupSlot}.`,
      },
      inApp: {
        title: `Order placed — ${ref}`,
        message: `We received your order. It will be ready for pickup at your chosen slot.`,
      },
    };
  },

  orderAcknowledged: (order) => {
    const ref = orderRef(order._id);
    return {
      ref,
      sms: `${BRAND}: Good news! Order ${ref} has been accepted by the vendor and is being prepared for your ${order.pickupSlot} pickup.`,
      whatsapp: `*${BRAND}*\n\nOrder *${ref}* has been *accepted* by the vendor and is being prepared.\n\nPickup slot: *${order.pickupSlot}*`,
      push: {
        title: `Order ${ref} accepted`,
        body: `The vendor accepted your order and is preparing it for ${order.pickupSlot}.`,
      },
      inApp: {
        title: `Order accepted — ${ref}`,
        message: `The vendor accepted your order and is preparing it now.`,
      },
    };
  },

  orderReady: (order) => {
    const ref = orderRef(order._id);
    return {
      ref,
      sms: `${BRAND}: Order ${ref} is READY for pickup. Please collect it during your slot: ${order.pickupSlot}.`,
      whatsapp: `*${BRAND}*\n\nOrder *${ref}* is *ready for pickup*! 🛍️\n\nPlease collect it during your slot: *${order.pickupSlot}*`,
      push: {
        title: `Order ${ref} is ready`,
        body: `Collect your order during your slot: ${order.pickupSlot}.`,
      },
      inApp: {
        title: `Order ready — ${ref}`,
        message: `Your order is ready. Please collect it during your pickup slot.`,
      },
    };
  },

  orderCollected: (order) => {
    const ref = orderRef(order._id);
    return {
      ref,
      sms: `${BRAND}: Order ${ref} has been collected. Thank you for shopping with us!`,
      whatsapp: `*${BRAND}*\n\nOrder *${ref}* has been collected. Thank you for shopping with us!`,
      push: {
        title: `Order ${ref} collected`,
        body: `Thank you for shopping with ${BRAND}.`,
      },
      inApp: {
        title: `Order collected — ${ref}`,
        message: `Thank you for shopping with us.`,
      },
    };
  },

  productRestocked: (product) => ({
    sms: `${BRAND}: ${product.name} is back in stock. Order now for pickup before it runs out.`,
    whatsapp: `*${BRAND}*\n\n*${product.name}* is back in stock. 🎉\n\nOrder now for pickup before it runs out.`,
    push: {
      title: `${product.name} is back in stock`,
      body: "Order now for pickup before it runs out.",
    },
    inApp: {
      title: `Back in stock — ${product.name}`,
      message: `${product.name} is available again. Order now for pickup.`,
    },
  }),

  wholesaleSubmitted: (user) => ({
    sms: `${BRAND}: We received the wholesale request for ${user.wholesaleDetails?.shopName || "your shop"}. We will review it and let you know.`,
    whatsapp: `*${BRAND}*\n\nWe received your wholesale request for *${user.wholesaleDetails?.shopName || "your shop"}*.\n\nStatus: *Pending verification*\n\nYou can keep ordering at regular buyer price while we review it.`,
    push: {
      title: "Wholesale request submitted",
      body: "We are reviewing your request. You can keep ordering at regular price.",
    },
    inApp: {
      title: "Wholesale request pending",
      message:
        "We are reviewing your wholesale request. Tap to see the status of your application.",
      link: "/wholesale-pending",
    },
  }),

  wholesaleDecision: (approved) =>
    approved
      ? {
          sms: `${BRAND}: Your wholesale access has been approved. Wholesale prices are now active on your account.`,
          whatsapp: `*${BRAND}*\n\nYour wholesale access has been *approved*. ✅\n\nWholesale prices are now active on product cards and product detail pages.`,
          push: {
            title: "Wholesale access approved",
            body: "Wholesale prices are now active on your account.",
          },
          inApp: {
            title: "Wholesale access approved",
            message:
              "You are now a verified wholesale buyer. Tap to see your new pricing.",
            link: "/wholesale-approved",
          },
        }
      : {
          sms: `${BRAND}: Your wholesale request was not approved. You can keep ordering at regular buyer price.`,
          whatsapp: `*${BRAND}*\n\nYour wholesale request was *not approved* this time.\n\nYou can keep ordering at regular buyer price, and you are welcome to apply again.`,
          push: {
            title: "Wholesale request rejected",
            body: "You can keep ordering at regular buyer price.",
          },
          inApp: {
            title: "Wholesale request rejected",
            message:
              "Your wholesale request was not approved. Tap to see the details and reapply.",
            link: "/wholesale-rejected",
          },
        },

  paymentDecision: (paymentStatus) => ({
    push: {
      title: `Payment ${paymentStatus}`,
      body:
        paymentStatus === "Paid"
          ? "Your digital payment has been confirmed."
          : "Your payment proof was rejected. Please submit it again.",
    },
    inApp: {
      title: `Payment ${paymentStatus}`,
      message:
        paymentStatus === "Paid"
          ? "Your digital payment has been confirmed."
          : "Your payment proof was rejected. Please submit it again.",
    },
  }),

  complaintUpdated: (complaint, ref) => {
    const resolved = complaint.status === "Resolved";
    const body = resolved
      ? complaint.resolutionNote
      : "The store is looking into the issue you reported.";
    return {
      push: {
        title: resolved
          ? `Complaint resolved — ${ref}`
          : `Complaint updated — ${ref}`,
        body,
      },
      inApp: {
        title: resolved
          ? `Complaint resolved — ${ref}`
          : `Complaint in review — ${ref}`,
        message: body,
      },
    };
  },
};
