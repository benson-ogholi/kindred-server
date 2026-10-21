// models/AiUsage.js
const mongoose = require("mongoose");

const aiUsageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    date: {
      type: String, // Format: YYYY-MM-DD
      required: true,
      index: true,
    },
    count: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Compound unique index so one document per user per day
aiUsageSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("AiUsage", aiUsageSchema);
