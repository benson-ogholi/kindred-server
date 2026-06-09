const mongoose = require("mongoose");

const rideOfferSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PadimanRouteUser",
      required: true,
    },
    notes: { type: String },
    pickupPoint: { type: String, required: true },
    dropoffPoint: { type: String, required: true },
    departureTime: { type: String, required: true }, // Store as "08:30 AM"
    availableSeats: { type: Number, required: true },
    estimatedFare: { type: Number, required: true },
    status: {
      type: String,
      enum: ["active", "booked", "completed", "cancelled"],
      default: "active",
    },
    negotiations: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Negotiation",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("RideOffer", rideOfferSchema);
