// models/padiman_route_models/Notification.js
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Padiman_Route_User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: [
        "ORDER",
        "RIDE",
        "PAYMENT",
        "SYSTEM",
        "CHAT",
        "GENERAL",
        "NEGOTIATION",
        "WITHDRAWAL",
        "MESSAGE",
        "REQUEST_CREATED",
        "REQUEST_STATUS_CHANGED",
        "NEGOTIATION_STARTED"
      ],
      default: "GENERAL",
    },
    data: {
      type: Object,
      default: {},
    },
    read: {
      type: Boolean,
      default: false,
    },
    sentViaPush: {
      type: Boolean,
      default: false,
    },

  },
  { timestamps: true }
);

// CHANGED: Registered under a unique name to eliminate registry collisions
module.exports =
  mongoose.models.PadimanRouteNotification ||
  mongoose.model("PadimanRouteNotification", notificationSchema);