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
      sender: {
        fullName: String,
        contact: String,
        pickupCode: String
      },
      recipient: {
        fullName: String,
        contact: String,
        pickupCode: String
      },
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
      type: { type: String }, // This stores 'immediate', 'scheduled', etc.
      date: Date, // This correctly casts the string ISO date to a Date object
    },
    status: { type: String, default: "pending" },
    notes: { type: String },
  },
  { timestamps: true }
);


module.exports = mongoose.model("Parcel", parcelSchema);