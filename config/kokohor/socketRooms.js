// Shared room-naming helpers for every kokohor Socket.IO handler
// (feed, gamification, group calls). Keeping these in one place means the
// feed socket, the gamification socket pushes, and index.js's existing
// 1-1 call/chat handlers can't drift into inconsistent room names.

/**
 * Personal room every connected user's socket joins on "register_user".
 * NOTE: this intentionally matches the `userRoom` helper already defined in
 * index.js (`user:${id}`, used by the existing 1-1 call/chat handlers) rather
 * than inventing a second naming scheme — a client that already called
 * "register_user" must receive feed/gamification events on the same room it
 * already joined, with no extra client-side join required.
 */
const userRoom = (userId) => `user:${userId}`;

/** Public feed room — anything with visibility: "public". */
const PUBLIC_FEED_ROOM = "kokohor:public";

/** Per-family feed room — visibility: "family" or "family_group" (joined once per family). */
const familyRoom = (familyId) => `kokohor:family:${familyId}`;

/** Room for a single active group call. */
const groupCallRoom = (callId) => `kokohor:group-call:${callId}`;

module.exports = {
  userRoom,
  PUBLIC_FEED_ROOM,
  familyRoom,
  groupCallRoom,
};
