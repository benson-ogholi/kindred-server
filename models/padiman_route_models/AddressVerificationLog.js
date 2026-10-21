const { default: mongoose } = require("mongoose");
const Padiman_Route_User = require("./Padiman_Route_User");

// ==========================================
// ADDRESS VERIFICATION - LOG COLLECTION FOR PENDING / FAILED / REJECTED
// ==========================================
// This model will store a complete, immutable log of EVERY address verification
// submission (pending, failed/rejected, approved). It includes full user details
// so the frontend can display the exact data we saw in your React component
// (user profile, address, utilityBillUrl, status, rejectionReason, timestamps).
// 
// The "log" prefix + immutable: true prevents accidental edits.
// We can easily filter or query by status exactly like the driver-submissions endpoint.
// You can add .index({ status: 1, submittedAt: -1 }) later if you want.
// 
// Example usage in frontend: the same fetchAddressVerifications call (or a new one)
// can now return the full user + verificationMeta.details so the image view works.

const addressVerificationLogSchema = new mongoose.Schema(
  {
    submissionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Padiman_Route_User",
      required: true,
      index: true,
    },
    logType: {
      type: String,
      enum: ["pending", "failed", "rejected", "approved"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "failed", "rejected", "approved"],
      required: true,
      index: true,
    },
    address: {
      type: String,
      required: true,
    },
    utilityBillUrl: {
      type: String,
      required: true,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    userDetails: {
      type: Object,
      required: true,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "addressVerificationLogs",
  }
);

// Optional: index for fast status + date queries (uncomment if you query logs a lot)
// addressVerificationLogSchema.index({ status: 1, submittedAt: -1 });

// Create and export
const AddressVerificationLog = mongoose.model(
  "AddressVerificationLog",
  addressVerificationLogSchema
);

module.exports = AddressVerificationLog;