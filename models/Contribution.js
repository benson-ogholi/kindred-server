const mongoose = require("mongoose");

const contributionSchema = new mongoose.Schema(
  {
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DonationCampaign",
      required: true,
      index: true,
    },
    contributor: {
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
    amountSent: {
      type: Number,
      required: [true, "Amount sent is required"],
      min: [1, "Amount must be greater than 0"],
    },
    paymentProof: {
      url: { type: String, required: true }, // Cloudinary/S3 URL
      publicId: { type: String }, // For deleting/replacing files
      size: { type: Number, max: 5242880 }, // 5MB limit check
    },
    displayPreference: {
      type: String,
      enum: ["NAMED", "ANONYMOUS"],
      default: "NAMED",
    },
    verificationStatus: {
      type: String,
      enum: ["PENDING", "VERIFIED", "REJECTED"],
      default: "PENDING",
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

/**
 * ⚡️ UPDATE CAMPAIGN TOTALRaised
 * Updates the parent campaign total only when a payment is VERIFIED.
 */
contributionSchema.post("save", async function (doc) {
  if (doc.verificationStatus === "VERIFIED") {
    const Campaign = mongoose.model("DonationCampaign");
    await Campaign.findByIdAndUpdate(doc.campaign, {
      $inc: { totalRaised: doc.amountSent },
    });
  }
});

module.exports = mongoose.model("Contribution", contributionSchema);
