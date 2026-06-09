const mongoose = require("mongoose");

const parcelRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "PadimanRouteUser", required: true },
    pickupAddress: { type: String, required: true },
    destinationCity: { type: String, required: true },
    properties: {
      isPerishable: Boolean,
      isFragile: Boolean,
    },
    priceRange: {
      min: Number,
      max: Number,
    },
    dispatchDateStart: { type: Date },

    dispatchDateEnd: { type: Date },
    availabilityWindow: {
      from: String,
      to: String,
    },
    status: {
      type: String,
      enum: ["pending", "active", "completed", "cancelled"],
      default: "pending",
    },
    notes: { type: String },
    
    // Updated from String to an array of ObjectIds referencing the Negotiation model
    negotiations: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Negotiation",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("ParcelRequest", parcelRequestSchema);