const mongoose = require("mongoose");

const pruPaymentSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      index: true, // non-unique – same TX can exist for payer + receiver
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PRUtility",
      index: true,
    },
    role: {
      type: String,
      enum: ["payer", "receiver"],
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },
    requestingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Requesting",
      default: null,
    },
    counterpartUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PRUtility",
      default: null,
    },
    itemType: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      default: null,
    },
    paystackRawResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Unique per party on the same Paystack reference
pruPaymentSchema.index(
  { reference: 1, user: 1, role: 1 },
  { unique: true }
);

const PruPayment =
  mongoose.models.PruPayment || mongoose.model("PruPayment", pruPaymentSchema);

module.exports = PruPayment;
module.exports.PruPayment = PruPayment;