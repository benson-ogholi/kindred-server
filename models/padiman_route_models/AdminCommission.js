const mongoose = require("mongoose");

const adminCommissionSchema = new mongoose.Schema({
  withdrawalReference: {
    type: String,
    required: true,
    unique: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PadimanRouteUser",
    required: true,
  },
  totalWithdrawnAmount: {
    type: Number,
    required: true,
  },
  commissionPercentage: {
    type: Number,
    default: 15,
  },
  adminEarnings: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ["collected", "pending"],
    default: "collected",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// --- FIXED: Removed 'next' parameter since this is fully synchronous execution ---
adminCommissionSchema.pre("validate", function () {
  if (this.totalWithdrawnAmount) {
    this.adminEarnings =
      this.totalWithdrawnAmount * (this.commissionPercentage / 100);
  }
});

module.exports = mongoose.model("AdminCommission", adminCommissionSchema);
