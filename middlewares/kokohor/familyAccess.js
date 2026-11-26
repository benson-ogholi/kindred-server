const Family = require("../../models/kokohor/Family");
const FamilyMember = require("../../models/kokohor/FamilyMember");

/**
 * Family-membership / visibility authorization for the Unified Content
 * router. `protect` (authMiddleware.js) must already have run and set
 * req.user.
 */

// --- shared helpers -------------------------------------------------------

/**
 * `Family.owner`/`Family.members` are schema'd as arrays, but some older
 * documents in the database were written back when `owner` was a single
 * ObjectId, so `.lean()` can hand back either shape. Normalize to an array
 * so `.map()` never blows up on legacy data.
 */
function toIdArray(value) {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

async function isFamilyMember(userId, familyId) {
  const family = await Family.findById(familyId).select("owner members").lean();
  if (!family) return false;
  const owners = toIdArray(family.owner).map((id) => id.toString());
  const members = toIdArray(family.members).map((id) => id.toString());
  const uid = userId.toString();
  return owners.includes(uid) || members.includes(uid);
}

async function getMembership(userId, familyId) {
  return FamilyMember.findOne({ family: familyId, user: userId });
}

/**
 * Middleware factory: requires the authenticated user to belong to
 * req.params[familyIdParam] (defaults to "familyId").
 */
const requireFamilyMember = (familyIdParam = "familyId") => async (req, res, next) => {
  try {
    const familyId = req.params[familyIdParam];
    if (!familyId) {
      return res.status(400).json({ message: `Missing ${familyIdParam} param` });
    }
    const member = await isFamilyMember(req.user._id, familyId);
    if (!member) {
      return res.status(403).json({ message: "Not a member of this family" });
    }
    next();
  } catch (err) {
    console.error("[familyAccess] requireFamilyMember error:", err);
    res.status(500).json({ message: "Family membership check failed" });
  }
};

/**
 * Middleware factory: requires the specific FamilyMember.rights[rightKey]
 * (or ownership, which implicitly has every right) before continuing.
 * Reads familyId from req.params[familyIdParam] or, failing that, from
 * req.body.familyId.
 */
const requireFamilyRight = (rightKey, familyIdParam = "familyId") => async (req, res, next) => {
  try {
    const familyId = req.params[familyIdParam] || req.body.familyId;
    if (!familyId) {
      return res.status(400).json({ message: "familyId is required" });
    }

    const family = await Family.findById(familyId).select("owner").lean();
    if (!family) return res.status(404).json({ message: "Family not found" });

    const uid = req.user._id.toString();
    const isOwner = toIdArray(family.owner).map((id) => id.toString()).includes(uid);
    if (isOwner) return next(); // owners have every right implicitly

    const member = await getMembership(req.user._id, familyId);
    if (!member || member.status !== "active") {
      return res.status(403).json({ message: "Not an active member of this family" });
    }

    const hasRight = member.rights?.get?.(rightKey) ?? false;
    if (!hasRight) {
      return res.status(403).json({ message: `Missing required right: ${rightKey}` });
    }
    next();
  } catch (err) {
    console.error("[familyAccess] requireFamilyRight error:", err);
    res.status(500).json({ message: "Family rights check failed" });
  }
};

/**
 * Checks whether req.user may READ a given UnifiedContent item, given its
 * visibility / family / familyGroupIds. Returns a boolean (no response
 * side-effects) so controllers can use it both for single-doc checks and to
 * build Mongo query filters.
 */
async function canViewContent(userId, content) {
  // A "message yourself" item (type: "message", meta.toSelf: true) is only
  // ever viewable by its own author — checked first, ahead of the normal
  // visibility rules below, so a family member can't view another member's
  // private note just by guessing/requesting its id directly.
  if (content.meta?.toSelf === true) {
    const authorId = (content.author?._id || content.author || "").toString();
    return authorId === userId.toString();
  }

  // Restricted-audience system item (see utils/kokohor/familyActivity.js).
  if (Array.isArray(content.meta?.audience) && content.meta.audience.length) {
    const authorId = (content.author?._id || content.author || "").toString();
    const uid = userId.toString();
    if (authorId !== uid && !content.meta.audience.map(String).includes(uid)) return false;
  }

  if (content.visibility === "public") return true;

  if (content.visibility === "family") {
    return isFamilyMember(userId, content.family);
  }

  if (content.visibility === "family_group") {
    const ids = (content.familyGroupIds || []).map((id) => id.toString());
    if (!ids.includes(content.family.toString())) ids.push(content.family.toString());
    for (const fid of ids) {
      // eslint-disable-next-line no-await-in-loop
      if (await isFamilyMember(userId, fid)) return true;
    }
    return false;
  }

  return false;
}

/**
 * Builds the Mongo filter fragment for "everything this user is allowed to
 * see", given the list of family ids they belong to (owner or member).
 */
function visibilityFilterForFamilies(memberFamilyIds) {
  const ids = memberFamilyIds.map((id) => id.toString());
  return {
    $or: [
      { visibility: "public" },
      { visibility: "family", family: { $in: ids } },
      { visibility: "family_group", familyGroupIds: { $in: ids } },
    ],
  };
}

/** All family ids (as strings) a user owns or belongs to. */
async function getUserFamilyIds(userId) {
  const families = await Family.find({
    $or: [{ owner: userId }, { members: userId }],
  })
    .select("_id")
    .lean();
  return families.map((f) => f._id.toString());
}

module.exports = {
  isFamilyMember,
  getMembership,
  requireFamilyMember,
  requireFamilyRight,
  canViewContent,
  visibilityFilterForFamilies,
  getUserFamilyIds,
};
