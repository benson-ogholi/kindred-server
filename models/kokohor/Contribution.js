const mongoose = require("mongoose");

const contributionSchema = new mongoose.Schema(
  {
    // Points at a UnifiedContent document of type "donation" now that donation
    // campaigns are part of the unified feed. Kept as its own collection
    // (rather than folded into UnifiedContent) for payment-proof auditability.
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UnifiedContent",
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

// NOTE: the totalRaised increment used to live in a post("save") hook here,
// firing on *every* save where verificationStatus === "VERIFIED" — which
// double-counts if a verified contribution is ever saved again (e.g. a
// rejectionReason edit). That increment now lives in
// controllers/kokohor/unifiedContentController.js#verifyContribution, which
// only fires it on the PENDING/REJECTED -> VERIFIED transition.

module.exports = mongoose.model("Contribution", contributionSchema);
