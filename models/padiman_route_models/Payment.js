const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    negotiationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Negotiation",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PadimanRouteUser",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    reference: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },
    paystackRawResponse: {
      type: Object,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", PaymentSchema);
