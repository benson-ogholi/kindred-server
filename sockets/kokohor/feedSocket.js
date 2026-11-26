const { PUBLIC_FEED_ROOM, familyRoom } = require("../../config/kokohor/socketRooms");
const { isFamilyMember } = require("../../middlewares/kokohor/familyAccess");
const { authUserId } = require("../../middlewares/kokohor/socketAuth");

/**
 * Registers the unified-feed room join/leave handlers on a socket.
 *
 * Deliberately attached via a SECOND `io.on("connection", ...)` listener
 * (see index.js's integration snippet) rather than being spliced into the
 * existing ~1800-line connection handler already in index.js — Socket.IO
 * supports multiple "connection" listeners, each receiving the same socket,
 * so this is purely additive and can't regress the existing chat/1-1-call
 * logic.
 *
 * REST actions (create/comment/react/repost, in
 * controllers/kokohor/unifiedContentController.js) are what actually
 * broadcast `kokohor:feed:*` events to these rooms — this file is only
 * responsible for getting sockets into (and out of) the right rooms.
 */
function registerFeedSocketHandlers(io, socket) {
  socket.on("kokohor:feed:join-public", () => {
    socket.join(PUBLIC_FEED_ROOM);
  });

  socket.on("kokohor:feed:leave-public", () => {
    socket.leave(PUBLIC_FEED_ROOM);
  });

  socket.on("kokohor:feed:join-family", async ({ familyId, userId: claimedUserId } = {}) => {
    const userId = authUserId(socket, claimedUserId);
    try {
      if (!familyId || !userId) {
        return socket.emit("kokohor:feed:error", { message: "familyId and userId are required" });
      }
      const member = await isFamilyMember(userId, familyId);
      if (!member) {
        return socket.emit("kokohor:feed:error", { message: "Not a member of this family" });
      }
      socket.join(familyRoom(familyId));
    } catch (err) {
      console.error("[feedSocket] join-family error:", err.message);
      socket.emit("kokohor:feed:error", { message: "Failed to join family feed" });
    }
  });

  socket.on("kokohor:feed:leave-family", ({ familyId }) => {
    if (familyId) socket.leave(familyRoom(familyId));
  });

  socket.on("kokohor:feed:typing", ({ familyId, userId, contentId } = {}) => {
    if (!familyId || !socket.rooms.has(familyRoom(familyId))) return;
    socket.to(familyRoom(familyId)).emit("kokohor:feed:typing", { userId, contentId });
  });
}

module.exports = { registerFeedSocketHandlers };
