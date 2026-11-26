const { verifyToken } = require("../../utils/jwtUtils");

/**
 * Socket.IO authentication for Kokohor.
 *
 * Clients pass their API JWT in the handshake: io(url, { auth: { token } }).
 * The main namespace is shared with other apps (PR / PRU / cooperative), so
 * connecting is never refused here — the token is verified if present and
 * the authenticated user id is stored on `socket.data.kokohorUserId`.
 *
 * Kokohor event handlers then call `authUserId(socket, claimedId)`:
 *   - authenticated socket: always use the token's user id; a payload
 *     claiming a different user is rejected (prevents impersonation —
 *     previously any client could send any userId/senderId).
 *   - unauthenticated socket:
 *       KOKOHOR_SOCKET_AUTH=enforce → rejected
 *       otherwise (default "warn", for the rollout window while older app
 *       versions without the handshake token are still in use) → the
 *       claimed id is accepted and a warning is logged.
 *
 * Set KOKOHOR_SOCKET_AUTH=enforce once every installed app is on this version.
 */
const MODE = (process.env.KOKOHOR_SOCKET_AUTH || "warn").toLowerCase();

function socketAuthMiddleware(socket, next) {
  try {
    const raw =
      socket.handshake?.auth?.token ||
      (socket.handshake?.headers?.authorization || "").replace(/^Bearer\s+/i, "");
    if (raw) {
      const decoded = verifyToken(raw);
      if (decoded?.id) socket.data.kokohorUserId = String(decoded.id);
    }
  } catch {
    // invalid/expired/other-app token: leave unauthenticated
  }
  next();
}

let warned = 0;
/** @returns {string|null} the user id to act as, or null to reject the event. */
function authUserId(socket, claimedId) {
  const authed = socket.data?.kokohorUserId;
  const claimed = claimedId ? String(claimedId) : "";
  if (authed) {
    if (claimed && claimed !== authed) return null; // impersonation attempt
    return authed;
  }
  if (MODE === "enforce") return null;
  if (claimed && warned < 50) {
    warned += 1;
    console.warn("[socketAuth] unauthenticated kokohor socket event (set KOKOHOR_SOCKET_AUTH=enforce after rollout)");
  }
  return claimed || null;
}

module.exports = { socketAuthMiddleware, authUserId, SOCKET_AUTH_MODE: MODE };
