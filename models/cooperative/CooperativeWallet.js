const mongoose = require("mongoose");

const cooperativeWalletTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["deposit", "withdrawal", "dividend_earning"],
    required: true,
  },
  amount: { type: Number, required: true },
  reference: { type: String },
  description: { type: String, required: true },
  date: { type: Date, default: Date.now },
});

const cooperativeWalletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CooperativeUser",
      required: true,
      unique: true,
    },
    balance: { type: Number, default: 0, required: true },
    transactions: [cooperativeWalletTransactionSchema],
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.CooperativeWallet ||
  mongoose.model("CooperativeWallet", cooperativeWalletSchema);
