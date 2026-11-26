const GamificationAccount = require("../../models/kokohor/GamificationAccount");
const Family = require("../../models/kokohor/Family");
const { userRoom } = require("../../config/kokohor/socketRooms");

const MAX_HISTORY = 200;

/**
 * Stars & Credits award table. `credits` is the spendable currency,
 * `stars` is the prestige/leaderboard score — most actions award both,
 * a few (comments) are stars-only to keep credit inflation in check.
 */
const AWARD_TABLE = {
  CREATE_POST: { stars: 5, credits: 5 },
  CREATE_NOTE: { stars: 3, credits: 3 },
  COMMENT: { stars: 2, credits: 0 },
  RECEIVE_REACTION: { stars: 1, credits: 0 },
  TASK_COMPLETED: { stars: 10, credits: 10 },
  POLL_VOTE: { stars: 2, credits: 0 },
  POLL_CREATED: { stars: 3, credits: 2 },
  DONATION_MADE: { stars: 8, credits: 0 },
  REPORT_SUBMITTED: { stars: 4, credits: 2 },
  REPOST: { stars: 1, credits: 0 },
};

/**
 * Awards stars/credits for `action` to `userId`, persists an activity-log
 * entry, and (if an `io` instance is supplied) pushes the user's updated
 * balance to their personal socket room in real time.
 *
 * @param {string} userId
 * @param {keyof AWARD_TABLE} action
 * @param {{ relatedId?: string, familyId?: string, io?: import('socket.io').Server }} [opts]
 */
async function award(userId, action, opts = {}) {
  const rule = AWARD_TABLE[action];
  if (!rule) {
    console.warn(`[gamificationService] Unknown action "${action}", skipping award.`);
    return null;
  }

  const entry = {
    action,
    stars: rule.stars,
    credits: rule.credits,
    relatedId: opts.relatedId || undefined,
    familyId: opts.familyId || undefined,
    createdAt: new Date(),
  };

  const account = await GamificationAccount.findOneAndUpdate(
    { user: userId },
    {
      $inc: { stars: rule.stars, credits: rule.credits },
      $push: { history: { $each: [entry], $slice: -MAX_HISTORY } },
      $setOnInsert: { user: userId },
    },
    { upsert: true, new: true }
  );

  if (opts.io) {
    opts.io.to(userRoom(userId)).emit("kokohor:gamification:update", {
      userId: String(userId),
      stars: account.stars,
      credits: account.credits,
      lastAction: action,
    });
  }

  return account;
}

async function getBalance(userId) {
  const account = await GamificationAccount.findOne({ user: userId }).lean();
  return account || { user: userId, stars: 0, credits: 0, history: [] };
}

/**
 * @param {{ scope: "global"|"family", familyId?: string, limit?: number }} params
 */
async function leaderboard({ scope = "global", familyId, limit = 20 } = {}) {
  const query = {};

  if (scope === "family") {
    if (!familyId) throw new Error("familyId is required for scope=family");
    const family = await Family.findById(familyId).select("owner members").lean();
    if (!family) return [];
    // `owner` is schema'd as an array, but some older Family documents were
    // written back when it was a single ObjectId — normalize either shape.
    const toIdArray = (v) => (v === null || v === undefined ? [] : Array.isArray(v) ? v : [v]);
    const userIds = [
      ...toIdArray(family.owner),
      ...toIdArray(family.members),
    ];
    query.user = { $in: userIds };
  }

  const accounts = await GamificationAccount.find(query)
    .sort({ stars: -1 })
    .limit(Math.min(limit, 100))
    .populate("user", "firstName lastName profilePicture")
    .lean();

  return accounts.map((a, idx) => ({
    rank: idx + 1,
    user: a.user,
    stars: a.stars,
    credits: a.credits,
  }));
}

module.exports = { AWARD_TABLE, award, getBalance, leaderboard };
