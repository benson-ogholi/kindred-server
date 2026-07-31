const mongoose = require("mongoose");

const RequestingMessageSchema = new mongoose.Schema(
  {
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Requesting",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PRUtility",
      required: true,
    },
    UUID: { type: String },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    attachments: [{ type: String, default: [] }],
    isRead: { type: Boolean, default: false },
    isPriceSet: { type: Boolean, default: false },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "PRUtility" }],
    price: { type: Number, default: 0 },

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

RequestingMessageSchema.index({ request: 1, createdAt: -1 });

module.exports = mongoose.model("RequestingMessage", RequestingMessageSchema);
