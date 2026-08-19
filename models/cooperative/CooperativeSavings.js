const mongoose = require("mongoose");

const cooperativeSavingsTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["deposit", "withdrawal"],
    required: true,
  },
  amount: { type: Number, required: true },
  reference: { type: String },
  description: { type: String, required: true },
  date: { type: Date, default: Date.now },
});

const cooperativeSavingsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CooperativeUser",
      required: true,
      unique: true,
    },
    balance: { type: Number, default: 0, required: true },
    transactions: [cooperativeSavingsTransactionSchema],
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.CooperativeSavings ||
  mongoose.model("CooperativeSavings", cooperativeSavingsSchema);
