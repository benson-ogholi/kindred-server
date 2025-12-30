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
    title: {
      type: String,
      required: [true, "Campaign name is required"],
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
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
    totalRaised: {
      type: Number,
      default: 0,
      min: 0,
    },
    deadline: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED", "CANCELLED"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

/**
 * 🧠 AUTO COMPLETE WHEN TARGET IS MET
 * FIXED: Using async function without 'next' to prevent TypeError.
 */
donationCampaignSchema.pre("save", async function () {
  if (this.totalRaised >= this.targetAmount && this.status === "ACTIVE") {
    this.status = "COMPLETED";
  }
});

module.exports = mongoose.model("DonationCampaign", donationCampaignSchema);
