const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    familyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
    },
    type: {
      type: String,
      required: true,
      enum: [
        "NEW_SUGGESTION",
        "NEW_TASK",
        "NEW_DONATION",
        "MEMBER_JOINED",
        "INVITATION_RECEIVED",
        "POLL_CREATED",
        "REPORT_SUBMITTED",
        "NEWS_UPDATE",
        "FAMILY_UPDATE",
        "FAMILY_JOIN_ACCEPTED",
        "DONATION_CREATED", // Updated from NEW_DONATION
        "DONATION_UPDATED", // Added for edits
        "DONATION_DELETED", // Added for removals
        "FAMILY_JOIN_REQUEST",
        "FAMILY_JOIN_DECLINED",
        "REPORT_COMMENT",
        "FAMILY_INVITE",

        "CONTRIBUTION_SUBMITTED", // When a user uploads a receipt
        "PAYMENT_APPROVED", // When admin accepts
        "PAYMENT_REJECTED", // When admin declines
        "SAFETY_NET_RELEASED",
      ],
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
