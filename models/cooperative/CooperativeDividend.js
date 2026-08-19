const mongoose = require("mongoose");

const cooperativeDividendTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CooperativeUser",
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  type: {
    type: String,
    enum: ["credit", "withdrawal"],
    default: "credit",
  },
  status: {
    type: String,
    enum: ["pending", "approved", "completed", "rejected"],
    default: function () {
      return this.type === "withdrawal" ? "pending" : "approved";
    }, // Dividend credits default to "approved", withdrawals default to "pending"
  },
  description: {
    type: String,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

const cooperativeDividendSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CooperativeUser",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
    },
    distributionMethod: {
      type: String,
      enum: ["equal", "proportional", "pro_rata_savings"],
      default: "equal",
    },
    status: {
      type: String,
      enum: ["pending", "distributed"],
      default: "distributed",
    },
    distributedAt: {
      type: Date,
      default: Date.now,
    },
    // Track which members received how much or made withdrawals
    transactions: [cooperativeDividendTransactionSchema],
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.CooperativeDividend ||
  mongoose.model("CooperativeDividend", cooperativeDividendSchema);