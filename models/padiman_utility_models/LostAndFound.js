const mongoose = require("mongoose");

const LostAndFoundSchema = new mongoose.Schema(
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
    locationFound: {
      type: String,
      trim: true,
    },
    images: [
      {
        type: String, // Multiple images
      },
    ],
    status: {
      type: String,
      enum: ["Unclaimed", "Under Verification", "Claimed", "Resolved"],
      default: "Unclaimed",
    },
    reporter: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

LostAndFoundSchema.index({ user: 1 });
LostAndFoundSchema.index({ title: "text" });

module.exports = mongoose.model("LostAndFound", LostAndFoundSchema);
