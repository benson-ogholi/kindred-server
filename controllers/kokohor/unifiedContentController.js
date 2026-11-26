const mongoose = require("mongoose");
const UnifiedContent = require("../../models/kokohor/UnifiedContent");
const Contribution = require("../../models/kokohor/Contribution");
const { createFamilyNotifications } = require("../../utils/notificationHelper");
const gamificationService = require("../../services/kokohor/gamificationService");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");
const {
  canViewContent,
  visibilityFilterForFamilies,
  getUserFamilyIds,
  isFamilyMember,
} = require("../../middlewares/kokohor/familyAccess");
const { PUBLIC_FEED_ROOM, familyRoom, userRoom } = require("../../config/kokohor/socketRooms");
const { getModeration } = require("../../utils/kokohor/moderation");
const Notification = require("../../models/kokohor/Notification");

const io = (req) => req.app.get("io");

/**
 * Uploads anything multer put on `req.files` (images[]/voiceNote, see
 * routes/kokohor/unifiedContent.routes.js's `uploadContentMedia`) to
 * Backblaze and returns the resulting `images`/`voiceNote` fields, same
 * shape the legacy per-type routes (news.routes.js etc.) already produce.
 * A pure-JSON request has no `req.files` at all, so this is a no-op then —
 * whatever `images`/`voiceNote` URLs the client already sent pass through
 * untouched via the `?? jsonImages` / `?? jsonVoiceNote` fallbacks.
 */
async function uploadedMediaFields(req, type, jsonImages, jsonVoiceNote) {
  if (!req.files) return { images: jsonImages, voiceNote: jsonVoiceNote };

  let images = jsonImages;
  if (req.files.images?.length) {
    images = [];
    for (const file of req.files.images) {
      const url = await uploadToBackblaze(file.buffer, file.originalname, `feed/${type}/images`);
      images.push({ url });
    }
  }

  let voiceNote = jsonVoiceNote;
  if (req.files.voiceNote?.[0]) {
    const file = req.files.voiceNote[0];
    const url = await uploadToBackblaze(file.buffer, file.originalname, `feed/${type}/voice-notes`);
    voiceNote = { url, duration: Number(req.body.voiceDuration) || undefined };
  }

  return { images, voiceNote };
}

/**
 * A multipart request carries every field as a string, so `meta` and
 * `familyGroupIds` arrive JSON-encoded rather than as real arrays/objects —
 * unlike a JSON request, where express.json() already parsed them. Parse
 * defensively so `create`/`update` can treat both the same way.
 */
function parseJsonField(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** Rooms a given content item should be broadcast to. */
function roomsFor(content) {
  // A "message yourself" item never goes to the shared family room — only
  // back to the author's own per-user room (their other devices), matching
  // getFeed()'s $and filter above that excludes it from everyone else's fetch.
  if (content.meta?.toSelf === true) {
    // `content.author` may already be populated ({_id, firstName, ...}) by
    // the time this runs (create() populates before broadcasting) or still
    // a bare ObjectId (other call sites) — handle both.
    const authorId = content.author?._id || content.author;
    return [userRoom(authorId)];
  }
  // Restricted-audience system items (e.g. a Safety Net activity card, see
  // utils/kokohor/familyActivity.js) only go to the listed users + author.
  if (Array.isArray(content.meta?.audience) && content.meta.audience.length) {
    const authorId = String(content.author?._id || content.author);
    return [...new Set([...content.meta.audience.map(String), authorId])].map(userRoom);
  }
  if (content.visibility === "public") return [PUBLIC_FEED_ROOM];
  if (content.visibility === "family") return [familyRoom(content.family)];
  if (content.visibility === "family_group") {
    const ids = new Set((content.familyGroupIds || []).map(String));
    ids.add(String(content.family));
    return [...ids].map(familyRoom);
  }
  return [];
}

function broadcast(req, event, content) {
  const socketIo = io(req);
  if (!socketIo) return;
  for (const room of roomsFor(content)) socketIo.to(room).emit(event, content);
}

function normalizeFamilyGroupIds(body) {
  if (body.visibility !== "family_group") return [];
  const ids = Array.isArray(body.familyGroupIds) ? body.familyGroupIds : [];
  const set = new Set(ids.map(String));
  set.add(String(body.family));
  return [...set];
}

// --------------------------------------------------------------------------
// Create
// --------------------------------------------------------------------------

const GAMIFICATION_ACTION_BY_TYPE = {
  news: "CREATE_POST",
  note: "CREATE_NOTE",
  feature_note: "CREATE_NOTE",
  family_post: "CREATE_POST",
  task: "CREATE_POST",
  poll: "POLL_CREATED",
  report: "REPORT_SUBMITTED",
  suggestion: "CREATE_POST",
  donation: "CREATE_POST",
  feature: "CREATE_POST",
};

exports.create = async (req, res) => {
  try {
    const {
      type,
      family,
      visibility = "family",
      title,
      body,
      videoUrl,
    } = req.body;
    // JSON body: already real types. Multipart body (req.files present):
    // these two arrive JSON-encoded strings — see parseJsonField's comment.
    const meta = parseJsonField(req.body.meta, {});
    const familyGroupIdsInput = parseJsonField(req.body.familyGroupIds, []);

    if (!UnifiedContent.TYPES.includes(type) || UnifiedContent.SYSTEM_TYPES.includes(type)) {
      const allowed = UnifiedContent.TYPES.filter((t) => !UnifiedContent.SYSTEM_TYPES.includes(t));
      return res.status(400).json({ message: `Invalid type. Must be one of: ${allowed.join(", ")}` });
    }
    if (!family) return res.status(400).json({ message: "family is required" });

    if (type === "family_post" && !UnifiedContent.FAMILY_POST_CONTENT_TYPES.includes(meta.contentType)) {
      return res.status(400).json({
        message: `family_post requires meta.contentType to be one of: ${UnifiedContent.FAMILY_POST_CONTENT_TYPES.join(", ")}`,
      });
    }

    const member = await isFamilyMember(req.user._id, family);
    if (!member) return res.status(403).json({ message: "Not a member of this family" });

    const { images, voiceNote } = await uploadedMediaFields(req, type, req.body.images, req.body.voiceNote);

    const content = await UnifiedContent.create({
      type,
      family,
      author: req.user._id,
      visibility,
      familyGroupIds: normalizeFamilyGroupIds({ visibility, family, familyGroupIds: familyGroupIdsInput }),
      title,
      body,
      images,
      videoUrl,
      voiceNote,
      meta,
    });

    await content.populate("author", "firstName lastName profilePicture");

    broadcast(req, "kokohor:feed:created", content);

    const action = GAMIFICATION_ACTION_BY_TYPE[type];
    if (action) {
      gamificationService
        .award(req.user._id, action, { relatedId: content._id, familyId: family, io: io(req) })
        .catch((e) => console.error("[unifiedContent] gamification award failed:", e.message));
    }

    // Plain chat messages are delivered in real time via the socket broadcast
    // above; a push/in-app notification per message would spam every family
    // member on every keystroke-send, so "message" is deliberately excluded.
    if (type !== "message") {
      await createFamilyNotifications(family, req.user._id, {
        type: typeToNotificationType(type),
        title: `New ${type.replace("_", " ")}`,
        message: title || body || `A new ${type} was posted`,
        relatedId: content._id,
      }).catch((e) => console.error("[unifiedContent] notification failed:", e.message));
    }

    res.status(201).json({ content });
  } catch (err) {
    console.error("[unifiedContent.create]", err);
    res.status(500).json({ message: "Failed to create content" });
  }
};

function typeToNotificationType(type) {
  const map = {
    news: "NEWS_UPDATE",
    task: "NEW_TASK",
    poll: "POLL_CREATED",
    suggestion: "NEW_SUGGESTION",
    report: "REPORT_SUBMITTED",
    donation: "DONATION_CREATED",
  };
  return map[type] || "FAMILY_UPDATE";
}

// --------------------------------------------------------------------------
// Read
// --------------------------------------------------------------------------

exports.getFeed = async (req, res) => {
  try {
    const { familyId } = req.params;
    const { type, page = 1, limit = 20 } = req.query;

    const member = await isFamilyMember(req.user._id, familyId);
    if (!member) return res.status(403).json({ message: "Not a member of this family" });

    const filter = {
      $and: [
        { $or: [{ family: familyId }, { familyGroupIds: familyId }] },
        // A "message yourself" chat message (type: "message", meta.toSelf:
        // true) is only ever returned to its own author — everyone else's
        // feed fetch silently excludes it, same as a real private note
        // would. See also `roomsFor()` below, which stops it from ever
        // being socket-broadcast to the rest of the family in the first
        // place.
        { $or: [{ "meta.toSelf": { $ne: true } }, { author: req.user._id }] },
        // Restricted-audience system items (see roomsFor below).
        {
          $or: [
            { "meta.audience": { $exists: false } },
            { "meta.audience": { $size: 0 } },
            { "meta.audience": String(req.user._id) },
            { author: req.user._id },
          ],
        },
      ],
    };
    if (type) filter.type = type;

    // Hide content from users I've blocked.
    const mod = await getModeration(req.user._id);
    if (mod.blockedUsers.size) filter.author = { $nin: [...mod.blockedUsers] };

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      UnifiedContent.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("author", "firstName lastName profilePicture")
        .populate("originalAuthor", "firstName lastName profilePicture"),
      UnifiedContent.countDocuments(filter),
    ]);

    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[unifiedContent.getFeed]", err);
    res.status(500).json({ message: "Failed to fetch feed" });
  }
};

exports.getPublicFeed = async (req, res) => {
  try {
    const { type, page = 1, limit = 20 } = req.query;
    const filter = { visibility: "public" };
    if (type) filter.type = type;
    const mod = await getModeration(req.user._id);
    if (mod.blockedUsers.size) filter.author = { $nin: [...mod.blockedUsers] };
    if (mod.blockedFamilies.size) filter.family = { $nin: [...mod.blockedFamilies] };

    const skip = (Number(page) - 1) * Number(limit);
    const items = await UnifiedContent.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("author", "firstName lastName profilePicture");

    res.json({ items, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[unifiedContent.getPublicFeed]", err);
    res.status(500).json({ message: "Failed to fetch public feed" });
  }
};

exports.getOne = async (req, res) => {
  try {
    const content = await UnifiedContent.findById(req.params.id)
      .populate("author", "firstName lastName profilePicture")
      .populate("comments.author", "firstName lastName profilePicture");
    if (!content) return res.status(404).json({ message: "Not found" });

    const allowed = await canViewContent(req.user._id, content);
    if (!allowed) return res.status(403).json({ message: "Not authorized to view this content" });

    if (!content.isRead.some((id) => id.toString() === req.user._id.toString())) {
      content.isRead.push(req.user._id);
      await content.save();
    }

    res.json({ content });
  } catch (err) {
    console.error("[unifiedContent.getOne]", err);
    res.status(500).json({ message: "Failed to fetch content" });
  }
};

// --------------------------------------------------------------------------
// Update / delete
// --------------------------------------------------------------------------

exports.update = async (req, res) => {
  try {
    const content = await UnifiedContent.findById(req.params.id);
    if (!content) return res.status(404).json({ message: "Not found" });

    if (content.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to edit this content" });
    }

    // Same JSON-string-field handling as create() — see parseJsonField.
    const metaPatch = parseJsonField(req.body.meta, undefined);

    if (content.type === "family_post" && metaPatch?.contentType !== undefined
        && !UnifiedContent.FAMILY_POST_CONTENT_TYPES.includes(metaPatch.contentType)) {
      return res.status(400).json({
        message: `family_post requires meta.contentType to be one of: ${UnifiedContent.FAMILY_POST_CONTENT_TYPES.join(", ")}`,
      });
    }

    const { images: uploadedImages, voiceNote: uploadedVoiceNote } = await uploadedMediaFields(
      req,
      content.type,
      req.body.images,
      req.body.voiceNote
    );

    const patch = { ...req.body, images: uploadedImages, voiceNote: uploadedVoiceNote, meta: metaPatch };
    const editable = ["title", "body", "images", "videoUrl", "voiceNote", "meta"];
    for (const field of editable) {
      if (patch[field] !== undefined) {
        if (field === "meta") {
          content.meta = { ...(content.meta || {}), ...patch.meta };
          content.markModified("meta");
        } else {
          content[field] = patch[field];
        }
      }
    }

    await content.save();
    broadcast(req, "kokohor:feed:updated", content);
    res.json({ content });
  } catch (err) {
    console.error("[unifiedContent.update]", err);
    res.status(500).json({ message: "Failed to update content" });
  }
};

exports.remove = async (req, res) => {
  try {
    const content = await UnifiedContent.findById(req.params.id);
    if (!content) return res.status(404).json({ message: "Not found" });

    if (content.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to delete this content" });
    }

    await content.deleteOne();
    broadcast(req, "kokohor:feed:deleted", { _id: content._id, family: content.family, visibility: content.visibility, familyGroupIds: content.familyGroupIds });
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("[unifiedContent.remove]", err);
    res.status(500).json({ message: "Failed to delete content" });
  }
};

// --------------------------------------------------------------------------
// Social: comments, reactions, repost
// --------------------------------------------------------------------------

exports.addComment = async (req, res) => {
  try {
    const { text, parent = null } = req.body;
    if (!text) return res.status(400).json({ message: "text is required" });

    const content = await UnifiedContent.findById(req.params.id);
    if (!content) return res.status(404).json({ message: "Not found" });

    const allowed = await canViewContent(req.user._id, content);
    if (!allowed) return res.status(403).json({ message: "Not authorized" });

    content.comments.push({ author: req.user._id, text, parent });
    await content.save();
    await content.populate("comments.author", "firstName lastName profilePicture");

    const comment = content.comments[content.comments.length - 1];
    broadcast(req, "kokohor:feed:comment", { contentId: content._id, comment });

    gamificationService
      .award(req.user._id, "COMMENT", { relatedId: content._id, familyId: content.family, io: io(req) })
      .catch(() => {});

    res.status(201).json({ comment });
  } catch (err) {
    console.error("[unifiedContent.addComment]", err);
    res.status(500).json({ message: "Failed to add comment" });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const content = await UnifiedContent.findById(id);
    if (!content) return res.status(404).json({ message: "Not found" });

    const comment = content.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const isAuthor = comment.author.toString() === req.user._id.toString();
    const isContentOwner = content.author.toString() === req.user._id.toString();
    if (!isAuthor && !isContentOwner) {
      return res.status(403).json({ message: "Not authorized to delete this comment" });
    }

    comment.isDeleted = true;
    comment.text = "[deleted]";
    await content.save();

    broadcast(req, "kokohor:feed:comment-deleted", { contentId: content._id, commentId });
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("[unifiedContent.deleteComment]", err);
    res.status(500).json({ message: "Failed to delete comment" });
  }
};

/** Toggle behavior: same reaction again removes it; a different reaction replaces it. */
exports.toggleReaction = async (req, res) => {
  try {
    const { type } = req.body;
    if (!UnifiedContent.REACTION_TYPES.includes(type)) {
      return res.status(400).json({ message: `Invalid reaction type. Must be one of: ${UnifiedContent.REACTION_TYPES.join(", ")}` });
    }

    const content = await UnifiedContent.findById(req.params.id);
    if (!content) return res.status(404).json({ message: "Not found" });

    const allowed = await canViewContent(req.user._id, content);
    if (!allowed) return res.status(403).json({ message: "Not authorized" });

    const uid = req.user._id.toString();
    const existingIdx = content.reactions.findIndex((r) => r.user.toString() === uid);
    let action = "added";

    if (existingIdx === -1) {
      content.reactions.push({ user: req.user._id, type });
    } else if (content.reactions[existingIdx].type === type) {
      content.reactions.splice(existingIdx, 1);
      action = "removed";
    } else {
      content.reactions[existingIdx].type = type;
      action = "changed";
    }

    await content.save();
    broadcast(req, "kokohor:feed:reaction", {
      contentId: content._id,
      userId: uid,
      type,
      action,
      counts: reactionCounts(content.reactions),
    });

    if (action !== "removed" && content.author.toString() !== uid) {
      gamificationService
        .award(content.author, "RECEIVE_REACTION", { relatedId: content._id, familyId: content.family, io: io(req) })
        .catch(() => {});
    }

    res.json({ action, counts: reactionCounts(content.reactions) });
  } catch (err) {
    console.error("[unifiedContent.toggleReaction]", err);
    res.status(500).json({ message: "Failed to react" });
  }
};

function reactionCounts(reactions) {
  return reactions.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {});
}

/**
 * Repost to a new audience (e.g. from a family to public, or to another
 * family_group), explicitly preserving originalAuthor/originFamily.
 */
exports.repost = async (req, res) => {
  try {
    const original = await UnifiedContent.findById(req.params.id);
    if (!original) return res.status(404).json({ message: "Not found" });

    const allowed = await canViewContent(req.user._id, original);
    if (!allowed) return res.status(403).json({ message: "Not authorized to repost this content" });

    const { family, visibility = "family", familyGroupIds, note } = req.body;
    if (!family) return res.status(400).json({ message: "Target family is required" });

    const member = await isFamilyMember(req.user._id, family);
    if (!member) return res.status(403).json({ message: "Not a member of the target family" });

    const repost = await UnifiedContent.create({
      type: original.type,
      family,
      author: req.user._id,
      visibility,
      familyGroupIds: normalizeFamilyGroupIds({ visibility, family, familyGroupIds }),
      title: original.title,
      body: note ? `${note}\n\n${original.body || ""}`.trim() : original.body,
      images: original.images,
      videoUrl: original.videoUrl,
      voiceNote: original.voiceNote,
      meta: original.meta,
      repostOf: original._id,
      originalAuthor: original.originalAuthor || original.author,
      originFamily: original.originFamily || original.family,
    });

    await repost.populate("author", "firstName lastName profilePicture");
    broadcast(req, "kokohor:feed:created", repost);

    gamificationService
      .award(req.user._id, "REPOST", { relatedId: repost._id, familyId: family, io: io(req) })
      .catch(() => {});

    res.status(201).json({ content: repost });
  } catch (err) {
    console.error("[unifiedContent.repost]", err);
    res.status(500).json({ message: "Failed to repost" });
  }
};

// --------------------------------------------------------------------------
// Type-specific actions
// --------------------------------------------------------------------------

exports.votePoll = async (req, res) => {
  try {
    const { optionIndex } = req.body;
    const content = await UnifiedContent.findById(req.params.id);
    if (!content || content.type !== "poll") return res.status(404).json({ message: "Poll not found" });

    const allowed = await canViewContent(req.user._id, content);
    if (!allowed) return res.status(403).json({ message: "Not authorized" });

    const options = content.meta?.options || [];
    if (!options[optionIndex]) return res.status(400).json({ message: "Invalid option index" });

    const uid = req.user._id.toString();
    // Remove any previous vote by this user across all options, then vote fresh.
    for (const opt of options) {
      opt.votes = (opt.votes || []).filter((v) => v.toString() !== uid);
    }
    options[optionIndex].votes = [...(options[optionIndex].votes || []), req.user._id];
    content.meta.options = options;
    content.markModified("meta");
    await content.save();

    broadcast(req, "kokohor:feed:updated", content);
    gamificationService.award(req.user._id, "POLL_VOTE", { relatedId: content._id, familyId: content.family, io: io(req) }).catch(() => {});

    res.json({ content });
  } catch (err) {
    console.error("[unifiedContent.votePoll]", err);
    res.status(500).json({ message: "Failed to vote" });
  }
};

exports.updateTaskStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const content = await UnifiedContent.findById(req.params.id);
    if (!content || content.type !== "task") return res.status(404).json({ message: "Task not found" });

    const isAssignee = content.meta?.assignedTo && content.meta.assignedTo.toString() === req.user._id.toString();
    const isAuthor = content.author.toString() === req.user._id.toString();
    if (!isAssignee && !isAuthor) return res.status(403).json({ message: "Not authorized to update this task" });

    content.meta = { ...(content.meta || {}), status };
    content.markModified("meta");
    await content.save();

    broadcast(req, "kokohor:feed:updated", content);
    if (status === "Completed") {
      gamificationService.award(content.author, "TASK_COMPLETED", { relatedId: content._id, familyId: content.family, io: io(req) }).catch(() => {});
    }

    res.json({ content });
  } catch (err) {
    console.error("[unifiedContent.updateTaskStatus]", err);
    res.status(500).json({ message: "Failed to update task" });
  }
};

/** Contribute to a "donation"-type UnifiedContent item. Keeps the real Contribution collection for auditability/payment-proof. */
exports.contribute = async (req, res) => {
  try {
    const campaign = await UnifiedContent.findById(req.params.id);
    if (!campaign || campaign.type !== "donation") return res.status(404).json({ message: "Campaign not found" });

    const allowed = await canViewContent(req.user._id, campaign);
    if (!allowed) return res.status(403).json({ message: "Not authorized" });

    const { amountSent, paymentProof, displayPreference } = req.body;
    if (!amountSent || !paymentProof?.url) {
      return res.status(400).json({ message: "amountSent and paymentProof.url are required" });
    }

    const contribution = await Contribution.create({
      campaign: campaign._id,
      contributor: req.user._id,
      amountSent,
      paymentProof,
      displayPreference,
    });

    broadcast(req, "kokohor:feed:donation-contribution", { campaignId: campaign._id, contributionId: contribution._id });
    res.status(201).json({ contribution });
  } catch (err) {
    console.error("[unifiedContent.contribute]", err);
    res.status(500).json({ message: "Failed to record contribution" });
  }
};

exports.verifyContribution = async (req, res) => {
  try {
    const { contributionId } = req.params;
    const { verificationStatus, rejectionReason } = req.body;
    if (!["VERIFIED", "REJECTED"].includes(verificationStatus)) {
      return res.status(400).json({ message: "verificationStatus must be VERIFIED or REJECTED" });
    }

    const contribution = await Contribution.findById(contributionId);
    if (!contribution) return res.status(404).json({ message: "Contribution not found" });

    const wasAlreadyVerified = contribution.verificationStatus === "VERIFIED";
    contribution.verificationStatus = verificationStatus;
    if (rejectionReason) contribution.rejectionReason = rejectionReason;
    await contribution.save();

    if (verificationStatus === "VERIFIED" && !wasAlreadyVerified) {
      await UnifiedContent.findByIdAndUpdate(contribution.campaign, {
        $inc: { "meta.totalRaised": contribution.amountSent },
      });
      gamificationService.award(contribution.contributor, "DONATION_MADE", { relatedId: contribution._id, io: io(req) }).catch(() => {});
    }

    res.json({ contribution });
  } catch (err) {
    console.error("[unifiedContent.verifyContribution]", err);
    res.status(500).json({ message: "Failed to verify contribution" });
  }
};


// --------------------------------------------------------------------------
// Unread counts (Families list badges + Families tab badge)
// --------------------------------------------------------------------------

/** Mongo filter: items in `familyId` that `userId` hasn't seen yet. */
function unreadFilter(userId, familyId, mod) {
  const uid = String(userId);
  const and = [
    { $or: [{ family: familyId }, { familyGroupIds: familyId }] },
    { author: { $ne: userId } },
    { isRead: { $ne: userId } },
    { "meta.toSelf": { $ne: true } },
    {
      $or: [
        { "meta.audience": { $exists: false } },
        { "meta.audience": { $size: 0 } },
        { "meta.audience": uid },
      ],
    },
  ];
  if (mod?.blockedUsers?.size) and.push({ author: { $nin: [...mod.blockedUsers] } });
  return { $and: and };
}

// GET /api/v1/feed/unread-counts -> { counts: { [familyId]: n }, total }
exports.getUnreadCounts = async (req, res) => {
  try {
    const familyIds = await getUserFamilyIds(req.user._id);
    const mod = await getModeration(req.user._id);
    const counts = {};
    await Promise.all(
      familyIds.map(async (fid) => {
        if (mod.blockedFamilies.has(String(fid))) {
          counts[fid] = 0;
          return;
        }
        counts[fid] = await UnifiedContent.countDocuments(unreadFilter(req.user._id, fid, mod));
      })
    );
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    res.json({ counts, total });
  } catch (err) {
    console.error("[unifiedContent.getUnreadCounts]", err);
    res.status(500).json({ message: "Failed to load unread counts" });
  }
};

// POST /api/v1/feed/family/:familyId/read — mark everything in a family as seen
exports.markFamilyRead = async (req, res) => {
  try {
    const { familyId } = req.params;
    const member = await isFamilyMember(req.user._id, familyId);
    if (!member) return res.status(403).json({ message: "Not a member of this family" });

    await Promise.all([
      UnifiedContent.updateMany(
        { $or: [{ family: familyId }, { familyGroupIds: familyId }], isRead: { $ne: req.user._id } },
        { $addToSet: { isRead: req.user._id } }
      ),
      // In-app notifications for this family are cleared too.
      Notification.updateMany(
        { recipient: req.user._id, familyId, isRead: false },
        { $set: { isRead: true } }
      ),
    ]);
    res.json({ success: true, familyId });
  } catch (err) {
    console.error("[unifiedContent.markFamilyRead]", err);
    res.status(500).json({ message: "Failed to mark family as read" });
  }
};
