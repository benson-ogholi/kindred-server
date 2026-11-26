const User = require("../../models/kokohor/User");

/**
 * Block & snooze helpers.
 *
 *  - block user:   their content is hidden from me, 1-1 messages/calls between
 *                  us are refused, and I get no notifications from them.
 *  - block family: hidden from my feeds / unread counts, no notifications or
 *                  group-call ringing from it.
 *  - snooze (user or family, until a time): notifications and ringing are
 *                  muted, content stays visible.
 *
 * Every helper fails open (returns "not muted") on errors so a lookup
 * problem can never break the request that called it.
 */

const toStr = (v) => (v && v._id ? String(v._id) : v ? String(v) : "");

function activeSnoozes(user, now = new Date()) {
  return (user?.snoozes || []).filter((s) => s && new Date(s.until) > now);
}

/** Moderation sets for one user (lean, cheap). */
async function getModeration(userId) {
  const empty = {
    blockedUsers: new Set(),
    blockedFamilies: new Set(),
    snoozedUsers: new Set(),
    snoozedFamilies: new Set(),
  };
  if (!userId) return empty;
  try {
    const u = await User.findById(userId).select("blockedUsers blockedFamilies snoozes").lean();
    if (!u) return empty;
    const snoozes = activeSnoozes(u);
    return {
      blockedUsers: new Set((u.blockedUsers || []).map(toStr)),
      blockedFamilies: new Set((u.blockedFamilies || []).map(toStr)),
      snoozedUsers: new Set(snoozes.filter((s) => s.targetType === "user").map((s) => toStr(s.target))),
      snoozedFamilies: new Set(snoozes.filter((s) => s.targetType === "family").map((s) => toStr(s.target))),
    };
  } catch (err) {
    console.error("[moderation] getModeration failed:", err.message);
    return empty;
  }
}

/**
 * Should a notification/ring to `recipientId` be suppressed?
 * `blockOnly`: only blocks count (snoozes still get the in-app record).
 * @param {{ senderId?: string, familyId?: string, blockOnly?: boolean }} ctx
 */
async function isMutedFor(recipientId, { senderId, familyId, blockOnly = false } = {}) {
  if (!recipientId) return false;
  const m = await getModeration(recipientId);
  const sid = toStr(senderId);
  const fid = toStr(familyId);
  if (sid && (m.blockedUsers.has(sid) || (!blockOnly && m.snoozedUsers.has(sid)))) return true;
  if (fid && (m.blockedFamilies.has(fid) || (!blockOnly && m.snoozedFamilies.has(fid)))) return true;
  return false;
}

/** Filters a recipient id list down to those not muting this sender/family. */
async function filterUnmuted(recipientIds, ctx) {
  const out = [];
  for (const id of recipientIds) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await isMutedFor(id, ctx))) out.push(id);
  }
  return out;
}

/** True if either user has blocked the other (1-1 messages & calls). */
async function isBlockedBetween(a, b) {
  if (!a || !b) return false;
  try {
    const hit = await User.exists({
      $or: [
        { _id: a, blockedUsers: b },
        { _id: b, blockedUsers: a },
      ],
    });
    return !!hit;
  } catch {
    return false;
  }
}

module.exports = { getModeration, isMutedFor, filterUnmuted, isBlockedBetween, activeSnoozes };
