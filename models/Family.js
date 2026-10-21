const mongoose = require("mongoose");

const FamilySchema = new mongoose.Schema(
  {
    familyName: {
      type: String,
      required: true,
      trim: true,
    },
    familyType: {
      type: String,
      enum: [
        "Nuclear Family",
        "Extended Family",
        "Workplace Team",
        "Alumni Group",
        "Community",
        "Religious Group",
        "Others",
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
    description: {
      type: String,
      maxLength: 500,
    },
    owner: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    pendingInvites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    joinRequests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    suspendedMembers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    inviteCode: {
      type: String,
      unique: true,
    },
  },
  { timestamps: true }
);

// ✅ Correct indexes (no parallel arrays)
FamilySchema.index({ owner: 1 });
FamilySchema.index({ members: 1 });
FamilySchema.index({ inviteCode: 1 });

module.exports = mongoose.model("Family", FamilySchema);
