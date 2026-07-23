const StoreSettings = require("../models/StoreSettings");

exports.getSettings = async (_req, res, next) => {
  try {
    const settings = await StoreSettings.current();
    res.status(200).json({
      success: true,
      settings: {
        paymentQrImage: settings.paymentQrImage,
        contactWhatsApp: settings.contactWhatsApp,
        pickupSlots: settings.pickupSlots.filter((slot) => slot.available),
        businessTypes: settings.businessTypes,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getAdminSettings = async (_req, res, next) => {
  try {
    const settings = await StoreSettings.current();
    res.status(200).json({ success: true, settings });
  } catch (error) {
    next(error);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const settings = await StoreSettings.current();
    const {
      paymentQrImage,
      paymentQrName,
      contactWhatsApp,
      pickupSlots,
      businessTypes,
      minMarginPercent,
      maxDiscountPercent,
    } = req.body || {};

    if (minMarginPercent !== undefined)
      settings.minMarginPercent = Number(minMarginPercent);
    if (maxDiscountPercent !== undefined)
      settings.maxDiscountPercent = Number(maxDiscountPercent);

    if (paymentQrImage !== undefined) settings.paymentQrImage = paymentQrImage;
    if (paymentQrName !== undefined) settings.paymentQrName = paymentQrName;
    if (contactWhatsApp !== undefined)
      settings.contactWhatsApp = String(contactWhatsApp).replace(/\D/g, "");

    if (Array.isArray(pickupSlots)) {
      settings.pickupSlots = pickupSlots
        .map((slot) => ({
          label: String(slot.label || "").trim(),
          available: slot.available !== false,
        }))
        .filter((slot) => slot.label);
    }

    if (Array.isArray(businessTypes)) {
      settings.businessTypes = businessTypes
        .map((type) => String(type).trim())
        .filter(Boolean);
    }

    await settings.save();
    res
      .status(200)
      .json({ success: true, message: "Store settings saved", settings });
  } catch (error) {
    next(error);
  }
};
