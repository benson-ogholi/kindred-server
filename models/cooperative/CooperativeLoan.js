// ==========================================
// 1. UPDATED BACKEND MODEL (CooperativeLoan.js)
// Added "pending" and "rejected" to status enum
// ==========================================
const mongoose = require("mongoose");

const cooperativeLoanTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["disbursement", "repayment", "withdrawal"],
    required: true,
  },
  amount: { type: Number, required: true },
  reference: { type: String },
  description: { type: String, required: true },
  date: { type: Date, default: Date.now },
});

const cooperativeLoanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CooperativeUser",
      required: true,
    },
    principalAmount: { type: Number, required: true },
    interestRate: { type: Number, default: 20 }, // 20% per annum
    durationMonths: { type: Number, default: 12 },
    interest: { type: Number, required: true },
    payable: { type: Number, required: true },
    balance: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "active", "completed", "defaulted", "rejected"],
      default: "pending", // New loan requests start as pending
    },
    dueDate: { type: Date },
    suretyForms: {
      form1: { type: String },
      form2: { type: String },
    },
    transactions: [cooperativeLoanTransactionSchema],
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.CooperativeLoan || mongoose.model("CooperativeLoan", cooperativeLoanSchema);
