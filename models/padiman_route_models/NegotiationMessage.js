const mongoose = require("mongoose");

const NegotiationMessageSchema = new mongoose.Schema(
  {
    negotiation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Negotiation",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PadimanRouteUser",
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    // Optional: for future media support
    attachments: [
      {
        type: String, // URL or file path
        default: [],
      },
    ],
    isRead: {
      type: Boolean,
      default: false,
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PadimanRouteUser",
      },
    ],
  },
  { timestamps: true }
);

// Indexes for fast queries
NegotiationMessageSchema.index({ negotiation: 1, createdAt: -1 });

module.exports = mongoose.model("NegotiationMessage", NegotiationMessageSchema);
