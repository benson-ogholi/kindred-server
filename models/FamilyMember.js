const mongoose = require("mongoose");

const FamilyMemberSchema = new mongoose.Schema(
  {
    family: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["owner", "admin", "moderator", "member", "guest", null],
      default: "member",
    },
    rights: {
      type: Map,
      of: Boolean,
      default: () => ({
        canInvite: false,
        canManageMembers: false,
        canPostNews: false,
        canDeleteAnyContent: false,
        canCreatePolls: false,
        canPostSuggestions: false,
        canParticipateInPolls: false,
        canMakeDonations: false,
        canCommentInteract: false,
        isAdmin: false,
        isModerator: false,
      }),
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["active", "suspended", "left"],
      default: "active",
    },
    restrictionReason: {
      type: String,
    },
  },
  { timestamps: true }
);

// Optional: prevent duplicate user-family entries
FamilyMemberSchema.index({ family: 1, user: 1 }, { unique: true });

module.exports = mongoose.model("FamilyMember", FamilyMemberSchema);
