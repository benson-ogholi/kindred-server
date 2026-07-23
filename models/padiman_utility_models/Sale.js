const mongoose = require("mongoose");

const SaleSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PRUtility",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    serialNumber: {
      type: String,
      trim: true,
    },
    images: [
      {
        type: String, // Multiple images
      },
    ],
    price: {
      type: Number,
      required: true,
    },
    oldPrice: {
      type: Number,
    },
    status: {
      type: String,
      enum: ["active", "sold", "inactive"],
      default: "active",
    },
  },
  { timestamps: true }
);

SaleSchema.index({ user: 1 });
SaleSchema.index({ title: "text" });

module.exports = mongoose.model("Sale", SaleSchema);
