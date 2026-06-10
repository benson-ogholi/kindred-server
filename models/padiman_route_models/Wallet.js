const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PadimanRouteUser",
    required: true,
    unique: true,
  },
  balance: {
    type: Number,
    default: 0,
  },
  earnings: [
    {
      payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
      negotiationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Negotiation",
      },
      // --- NEW FIELDS ADDED HERE ---
      serviceId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "ParcelRequest" // Adjust ref based on your service model
      },
      payerName: String,
      payerEmail: String,
      // -----------------------------
      amount: Number,
      reference: String, // Paystack reference
      source: String, // e.g., "deliver_a_parcel"
      createdAt: { type: Date, default: Date.now },
    },
  ],
  withdrawals: [
    {
      amount: Number,
      reference: String, // Transfer reference from Paystack
      status: {
        type: String,
        enum: ["pending", "success", "failed"],
        default: "pending",
      },
      bankDetails: {
        accountName: String,
        accountNumber: String,
        bankName: String,
      },
      createdAt: { type: Date, default: Date.now },
    },
  ],
});

module.exports = mongoose.model("Wallet", walletSchema);
