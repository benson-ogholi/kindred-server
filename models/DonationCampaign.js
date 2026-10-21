const mongoose = require("mongoose");

const donationCampaignSchema = new mongoose.Schema(
  {
    family: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isRead: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    title: {
      type: String,
      required: [true, "Contribution name is required"],
      trim: true,
      maxlength: 100,
    },
    purpose: {
      // Renamed from description to match your UI
      type: String,
      required: [true, "Purpose is required"],
      trim: true,
      maxlength: 1000,
    },
    targetAmount: {
      type: Number,
      required: [true, "Target amount is required"],
      min: [1, "Target amount must be greater than 0"],
    },
    minimumDonation: {
      type: Number,
      default: 1,
      min: [1, "Minimum donation must be at least 1"],
    },
    deadline: {
      type: Date,
      required: [true, "Deadline is required"],
    },
    // --- NEW ACCOUNT DETAILS FIELDS ---
    accountDetails: {
      accountNumber: {
        type: String,
        required: [true, "Account number is required"],
      },
      bankName: {
        type: String,
        required: [true, "Bank name is required"],
      },
      accountName: {
        type: String,
        required: [true, "Account name is required"],
      },
      otherDetails: {
        type: String,
        trim: true,
      },
    },
    // --- VISIBILITY & STATUS ---
    visibility: {
      type: String,
      enum: ["PUBLIC", "PRIVATE", "HIDDEN"],
      default: "PUBLIC",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED", "CANCELLED"],
      default: "ACTIVE",
    },
    totalRaised: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

/**
 * 🧠 AUTO-COMPLETE LOGIC
 * Updates status to COMPLETED if target is reached.
 */

donationCampaignSchema.pre("save", async function () {
  // If you use 'async', Mongoose handles the completion automatically.
  // Do NOT include 'next' in the arguments.
  if (this.totalRaised >= this.targetAmount && this.status === "ACTIVE") {
    this.status = "COMPLETED";
  }
});

module.exports = mongoose.model("DonationCampaign", donationCampaignSchema);
