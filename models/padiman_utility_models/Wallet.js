import mongoose from "mongoose";

const walletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PRUtility",
      required: true,
      unique: true,
    },
    balance: {
      type: Number,
      default: 0,
    },
    withdrawableBalance: {
      type: Number,
      default: 0,
    },
    earnings: [
      {
        payment: { type: mongoose.Schema.Types.ObjectId, ref: "PruPayment" },
        negotiationId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Requesting",
        },
        serviceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Requesting",
        },
        payerName: String,
        payerEmail: String,
        amount: Number,
        reference: String, // Paystack reference
        source: String, // e.g., "deliver_a_parcel"
        createdAt: { type: Date, default: Date.now },
        status: {
          type: String,
          enum: ["pending", "success", "failed"],
          default: "pending",
        },
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
  },
  {
    timestamps: true,
  }
);

export const Wallet =
  mongoose.models.Wallet || mongoose.model("Wallet", walletSchema);
