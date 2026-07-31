// models/padiman_route_models/Notification.js
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
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
    body: {
      type: String,
      required: true,
    },
    type: {
      type: String,

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
  mongoose.models.PRUNOTIFY || mongoose.model("PRUNOTIFY", notificationSchema);
