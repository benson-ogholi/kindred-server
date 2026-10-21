const mongoose = require("mongoose");

const cooperativeRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CooperativeUser",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["loan", "savings", "dividends", "subscriptions"],
      required: true,
    },
    transactionType: {
      type: String,
      enum: ["credit", "withdrawal", "transfer", "repay"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    proofUrl: {
      type: String,
    },
    bankDetails: {
      accountName: { type: String },
      accountNumber: { type: String },
      bankName: { type: String },
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    description: {
      type: String,
      default: "",
    },
    meta: {
      principalAmount: { type: Number },
      interestRate: { type: Number, default: 20 },
      durationMonths: { type: Number, default: 12 },
      interest: { type: Number },
      payable: { type: Number },
      balance: { type: Number },
      dueDate: { type: Date },
      suretyForms: {
        form1: { type: String },
        form2: { type: String },
      },
      loanStatus: {
        type: String,
        enum: [
          "pending",
          "active",
          "completed",
          "defaulted",
          "rejected",
          "repaid",
        ],
      },
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.CooperativeRequest ||
  mongoose.model("CooperativeRequest", cooperativeRequestSchema);
