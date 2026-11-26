const UnifiedContent = require("../../models/kokohor/UnifiedContent");
const { familyRoom, userRoom } = require("../../config/kokohor/socketRooms");

/**
 * Family Chat "activity" bridge.
 *
 * The Family Chat timeline is built on the unified feed (UnifiedContent).
 * News, tasks, polls and reports are already created there directly, but
 * several family modules still live in their own legacy collections:
 *   - FamilyContent (Resolutions, Village Traditions, History, My Village,
 *     Language Lessons, Family Tree, Key Dates, ...)
 *   - DonationCampaign / Contribution
 *   - SafetyNet
 *
 * Whenever one of those is created we drop a lightweight `type: "activity"`
 * card into the family's feed that points back at the source document
 * (`meta.sourceType` + `meta.sourceId`), so the chat shows it and can open
 * the right page. The source collection stays the source of truth.
 *
 * Audience:
 *   - default: the whole family (visibility "family").
 *   - `toSelf: true`: only the author sees it (used for private items).
 *   - `audience: [userIds]`: only those users (+ the author) see it — used
 *     for Safety Net vaults so their existence is only shown to the people
 *     they are assigned to.
 *
 * Every function here is best-effort: a failure is logged and swallowed so
 * it can never break the request that triggered it.
 */

const AUTHOR_FIELDS = "firstName lastName profilePicture";

function emitToRooms(io, content, event) {
  if (!io) return;
  const meta = content.meta || {};
  const authorId = String(content.author?._id || content.author);
  let rooms;
  if (meta.toSelf === true) {
    rooms = [userRoom(authorId)];
  } else if (Array.isArray(meta.audience) && meta.audience.length) {
    rooms = [...new Set([...meta.audience.map(String), authorId])].map(userRoom);
  } else if (content.visibility === "family_group") {
    const ids = new Set((content.familyGroupIds || []).map(String));
    ids.add(String(content.family));
    rooms = [...ids].map(familyRoom);
  } else {
    rooms = [familyRoom(content.family)];
  }
  for (const room of rooms) io.to(room).emit(event, content);
}

/**
 * @param {import("socket.io").Server|undefined} io
 * @param {{
 *   familyId: string,
 *   authorId: string,
 *   sourceType: "family_content"|"donation"|"contribution"|"safety_net",
 *   sourceId: string,
 *   title?: string,
 *   body?: string,
 *   action?: string,            // "created" | "contributed" | "released" ...
 *   contentType?: string,       // FamilyContent.contentType when sourceType === "family_content"
 *   images?: {url: string}[],
 *   toSelf?: boolean,
 *   audience?: string[],
 *   extra?: object,             // any additional display-only fields
 * }} opts
 */
async function postFamilyActivity(io, opts) {
  try {
    const {
      familyId,
      authorId,
      sourceType,
      sourceId,
      title,
      body,
      action = "created",
      contentType,
      images,
      toSelf = false,
      audience,
      extra = {},
    } = opts;
    if (!familyId || !authorId || !sourceType || !sourceId) return null;

    const meta = {
      ...extra,
      sourceType,
      sourceId: String(sourceId),
      action,
    };
    if (contentType) meta.contentType = contentType;
    if (toSelf) meta.toSelf = true;
    if (!toSelf && Array.isArray(audience) && audience.length) {
      meta.audience = [...new Set(audience.map(String))];
    }

    const content = await UnifiedContent.create({
      type: "activity",
      family: familyId,
      author: authorId,
      visibility: "family",
      title,
      body,
      images: Array.isArray(images) ? images.slice(0, 1).map((i) => ({ url: i.url })) : undefined,
      meta,
    });
    await content.populate("author", AUTHOR_FIELDS);
    emitToRooms(io, content, "kokohor:feed:created");
    return content;
  } catch (err) {
    console.error("[familyActivity] post failed:", err.message);
    return null;
  }
}

/** Keeps an activity card's text in sync after its source was edited. */
async function updateFamilyActivity(io, sourceId, patch = {}) {
  try {
    const items = await UnifiedContent.find({ type: "activity", "meta.sourceId": String(sourceId) });
    for (const item of items) {
      if (patch.title !== undefined) item.title = patch.title;
      if (patch.body !== undefined) item.body = patch.body;
      if (patch.meta) {
        item.meta = { ...(item.meta || {}), ...patch.meta };
        item.markModified("meta");
      }
      await item.save();
      await item.populate("author", AUTHOR_FIELDS);
      emitToRooms(io, item, "kokohor:feed:updated");
    }
  } catch (err) {
    console.error("[familyActivity] update failed:", err.message);
  }
}

/** Removes every activity card pointing at a deleted source document. */
async function removeFamilyActivity(io, sourceId) {
  try {
    const items = await UnifiedContent.find({ type: "activity", "meta.sourceId": String(sourceId) });
    for (const item of items) {
      await item.deleteOne();
      emitToRooms(
        io,
        {
          _id: item._id,
          family: item.family,
          author: item.author,
          visibility: item.visibility,
          familyGroupIds: item.familyGroupIds,
          meta: item.meta,
        },
        "kokohor:feed:deleted"
      );
    }
  } catch (err) {
    console.error("[familyActivity] remove failed:", err.message);
  }
}

module.exports = {
  postFamilyActivity,
  updateFamilyActivity,
  removeFamilyActivity,
  emitToRooms,
};
