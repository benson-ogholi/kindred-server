const mongoose = require("mongoose");

/**
 * UnifiedContent / "KokohorFeed"
 * -------------------------------------------------------------------------
 * Consolidates the previously-fragmented content modules (features, news,
 * task, report, suggestion, poll, donationCampaign, familyContent) plus a
 * brand-new "note" type into a single polymorphic model, distinguished by
 * `type` and carrying type-specific fields inside `meta`.
 *
 * Deliberately excluded from this consolidation: SafetyNet (its own
 * trigger-date/release/cron workflow) — it was not part of the fragmented
 * feed modules the brief asked to unify, so it keeps its own model/route.
 *
 * `Contribution` (payment-proof uploads against a donation) also stays a
 * separate collection for auditability, but now points its `campaign` ref at
 * a UnifiedContent document of type "donation" instead of the old
 * standalone DonationCampaign collection.
 */

const TYPES = [
  "news",
  "task",
  "report",
  "suggestion",
  "poll",
  "donation",
  "feature",
  "note",
  "feature_note",
  "family_post",
  "message",
  // System-generated (never created directly by clients — see
  // SYSTEM_TYPES below and controllers/kokohor/unifiedContentController.js):
  // "activity": a pointer card to an item living in a legacy collection
  //   (FamilyContent, DonationCampaign, Contribution, SafetyNet) so it shows
  //   in the Family Chat — see utils/kokohor/familyActivity.js.
  // "group_call": a group call log entry (completed or missed) posted when
  //   a group call ends — see sockets/kokohor/groupCallSocket.js.
  "activity",
  "group_call",
];

const SYSTEM_TYPES = ["activity", "group_call"];

const VISIBILITIES = ["public", "family", "family_group"];

/**
 * Valid `meta.contentType` values for `type: "family_post"` — copied
 * verbatim from the legacy FamilyContent model's `contentType` enum
 * (models/kokohor/FamilyContent.js), which `family_post` was always meant
 * to subsume (see the field-shape comment on `meta` below). Kept as its
 * own list rather than a top-level `TYPES` entry each, since these are
 * FamilyContent *categories*, not distinct UnifiedContent shapes — they all
 * share the same rich metadata bag FamilyContent already defined.
 */
const FAMILY_POST_CONTENT_TYPES = [
  "Family Tree",
  "Family History",
  "Village Story",
  "Village Tradition",
  "Language Lesson",
  "King",
  "Patriarch",
  "Resolution",
  "Suggestion Box",
  "My Village",
  "Key Date",
  "Task",
  "History",
];

const REACTION_TYPES = ["like", "haha", "love", "support", "sad", "wow"];

const ReactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: REACTION_TYPES, required: true },
  },
  { timestamps: true, _id: false }
);

const CommentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true },
    // Self-reference for one level (or more, if the client wants) of threaded replies.
    parent: { type: mongoose.Schema.Types.ObjectId, default: null },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const UnifiedContentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: TYPES, required: true, index: true },

    // "Home" family — where the item was created / originally posted.
    family: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      required: true,
      index: true,
    },

    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    visibility: {
      type: String,
      enum: VISIBILITIES,
      default: "family",
      index: true,
    },

    // Only meaningful when visibility === "family_group". Must contain 2+
    // family ids (including `family` itself) — enforced in the controller,
    // not here, since Mongoose path validators can't easily see sibling
    // array length requirements cleanly alongside conditional-required.
    familyGroupIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Family" }],

    // ---- Common display fields (not every type uses every field) ----
    title: { type: String, trim: true },
    body: { type: String, trim: true },
    images: [{ url: String, publicId: String }],
    videoUrl: String,
    voiceNote: { url: String, duration: Number },

    // ---- Type-specific payload ----
    // note/feature_note: title, body, tags, pinned, color/category, checklist, reminders
    // poll: options[{text, votes}], endDate, status
    // task: assignedTo, deadline, status
    // donation: purpose, targetAmount, minimumDonation, deadline, accountDetails, totalRaised, status
    // report: expectations, workDone, status, completionPercentage, proofLinks, sharedWith
    // suggestion: isAnonymous, status
    // family_post: contentType (legacy FamilyContent.contentType), plus its rich metadata bag
    // message: plain free-text chat message within a family (or to self, see `meta.toSelf`);
    //   body carries the text; meta: { toSelf?: boolean } — no other fields used
    // activity: meta: { sourceType, sourceId, action, contentType?, toSelf?, audience?: [userId] }
    // group_call: meta: { callId, callType, status: "ended"|"missed", duration, familyIds,
    //   initiatorId, invitedIds, joinedIds }
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ---- Social layer (shared by every type) ----
    reactions: [ReactionSchema],
    comments: [CommentSchema],

    // ---- Repost / share-to-new-audience ----
    repostOf: { type: mongoose.Schema.Types.ObjectId, ref: "UnifiedContent", default: null },
    originalAuthor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    originFamily: { type: mongoose.Schema.Types.ObjectId, ref: "Family", default: null },

    isRead: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

UnifiedContentSchema.index({ family: 1, createdAt: -1 });
UnifiedContentSchema.index({ visibility: 1, createdAt: -1 });
UnifiedContentSchema.index({ type: 1, family: 1 });
UnifiedContentSchema.index({ familyGroupIds: 1 });
UnifiedContentSchema.index({ repostOf: 1 });

UnifiedContentSchema.pre("save", function () {
  if (!this.isRead) this.isRead = [];
  if (this.isNew && this.author && !this.isRead.some((id) => id.toString() === this.author.toString())) {
    this.isRead.push(this.author);
  }
});

UnifiedContentSchema.index({ type: 1, "meta.sourceId": 1 });

UnifiedContentSchema.statics.TYPES = TYPES;
UnifiedContentSchema.statics.SYSTEM_TYPES = SYSTEM_TYPES;
UnifiedContentSchema.statics.VISIBILITIES = VISIBILITIES;
UnifiedContentSchema.statics.REACTION_TYPES = REACTION_TYPES;
UnifiedContentSchema.statics.FAMILY_POST_CONTENT_TYPES = FAMILY_POST_CONTENT_TYPES;

module.exports = mongoose.model("UnifiedContent", UnifiedContentSchema);
