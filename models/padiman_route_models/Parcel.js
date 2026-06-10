const mongoose = require("mongoose");

const parcelSchema = new mongoose.Schema(
  {
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PadimanRouteUser",
      required: true,
    },
    route: {
      pickupAddress: String,
      deliveryAddress: String,
    },
    parties: {
      sender: { name: String, contact: String },
      recipient: { name: String, contact: String },
    },
    item: {
      name: String,
      properties: {
        isFragile: Boolean,
        isPerishable: Boolean,
        isInsured: Boolean,
      },
    },
    schedule: {
      type: String,
      date: String,
    },
    status: { type: String, default: "pending" },
    notes: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Parcel", parcelSchema);
