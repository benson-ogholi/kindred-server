const mongoose = require("mongoose");

/**
 * Persistent record of a Kokohor group call (sockets/kokohor/groupCallSocket.js
 * keeps live calls in memory only). Written once, when the call ends.
 *
 * Used for:
 *   - the Calls tab in the inbox (`get_calls` merges these with 1-1 calls),
 *     where an invited user who never joined sees it as "missed";
 *   - the matching `type: "group_call"` card posted into each family's chat.
 */
const GroupCallLogSchema = new mongoose.Schema(
  {
    callId: { type: String, required: true, unique: true },
    familyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Family", index: true }],
    callType: { type: String, enum: ["audio", "video"], default: "audio" },
    initiator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Everyone who was rung (excludes the initiator).
    invited: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
    // Everyone who actually joined (includes the initiator).
    joined: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
    // "ended": at least one invitee joined; "missed": nobody picked up.
    status: { type: String, enum: ["ended", "missed"], required: true },
    startedAt: { type: Date, required: true },
    connectedAt: { type: Date, default: null },
    endedAt: { type: Date, required: true },
    duration: { type: Number, default: 0 }, // seconds, from first answer to end
  },
  { timestamps: true }
);

GroupCallLogSchema.index({ endedAt: -1 });

module.exports = mongoose.model("GroupCallLog", GroupCallLogSchema);
