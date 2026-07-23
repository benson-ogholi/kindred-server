const mongoose = require("mongoose");

const AssetSchema = new mongoose.Schema(
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
    sub: {
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

    // Changed to support MULTIPLE images
    images: [
      {
        type: String, // Array of Backblaze URLs
      },
    ],

    valuationEstimate: {
      type: String,
      trim: true,
    },
    registeredDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["active", "sold", "rented", "inactive"],
      default: "active",
    },

    // Array of hired/rented records
    hired: [
      {
        hiredBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "PRUtility",
        },
        startDate: Date,
        endDate: Date,
        amount: Number,
        status: {
          type: String,
          enum: ["pending", "active", "completed", "cancelled"],
          default: "pending",
        },
      },
    ],
  },
  { timestamps: true }
);

AssetSchema.index({ user: 1 });
AssetSchema.index({ serialNumber: 1 });

module.exports = mongoose.model("Asset", AssetSchema);
