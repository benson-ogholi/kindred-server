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
    UUID: { type: String },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    attachments: [{ type: String, default: [] }],
    isRead: { type: Boolean, default: false },
    isPriceSet: { type: Boolean, default: false },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "PadimanRouteUser" }],
    price: { type: Number, default: 0 },

    // NEW — lets a message represent a status/location update instead of plain text
    type: {
      type: String,
      enum: ["text", "status", "price", "system"],
      default: "text",
    },
    meta: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

NegotiationMessageSchema.index({ negotiation: 1, createdAt: -1 });

module.exports = mongoose.model("NegotiationMessage", NegotiationMessageSchema);
