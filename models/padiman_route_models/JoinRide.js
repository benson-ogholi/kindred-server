const mongoose = require("mongoose");

const joinRideSchema = new mongoose.Schema(
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
    pickupCode: String,

    schedule: {
      type: { type: String }, // This stores 'immediate', 'scheduled', etc.
      date: Date, // This correctly casts the string ISO date to a Date object
    },
    status: { type: String, default: "pending" },
    notes: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("JoinRide", joinRideSchema);
