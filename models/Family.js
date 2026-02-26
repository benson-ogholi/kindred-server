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
        "Others"
      ],
      required: true,
      
    },
    description: {
      type: String,
      maxLength: 500,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
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
    joinRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    inviteCode: {
      type: String,
      unique: true,
    },
  },
  { timestamps: true }
);


FamilySchema.index({ owner: 1, members: 1 });

module.exports = mongoose.model("Family", FamilySchema);
