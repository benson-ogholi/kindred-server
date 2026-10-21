const mongoose = require("mongoose");

const cooperativeNotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CooperativeUser",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        "payment",
        "withdrawal",
        "savings",
        "loan",
        "dividend",
        "system",
        "alert",
      ],
      default: "payment",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "CooperativeNotification",
  cooperativeNotificationSchema
);
