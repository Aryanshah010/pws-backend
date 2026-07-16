const mongoose = require("mongoose");

const basketSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, trim: true, required: true, maxlength: 80 },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: { type: Number, min: 1, required: true },
      },
    ],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Basket", basketSchema);
