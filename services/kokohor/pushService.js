const { Expo } = require("expo-server-sdk");
const User = require("../../models/kokohor/User");

const expo = new Expo();

/**
 * Consolidated Expo push sender for the kokohor module.
 *
 * Audit finding (objective #7): index.js's `sendCallPush` (used for
 * kookohor-* 1-1 call ringing) read `user.fcmToken` and sent through
 * firebase-admin's `admin.messaging()`. Neither works:
 *   - The User schema (models/kokohor/User.js) has no `fcmToken` field at
 *     all — only `expoPushToken` and `voipPushToken` — so that lookup was
 *     always undefined and the function returned early every time.
 *   - firebase-admin was only ever initialized for this one call site;
 *     nothing else in the module uses it.
 * Meanwhile `utils/notificationHelper.js` and `utils/notifyUser.js` both
 * already have working (and nearly identical) Expo-based senders using the
 * real `expoPushToken` field. This service is the single place that
 * replaces all three: index.js's integration snippet swaps its local
 * `sendCallPush` for `sendCallRingingPush` below instead of patching the
 * firebase-admin call in place.
 */

async function _deliver(message) {
  if (!Expo.isExpoPushToken(message.to)) return { status: "error", message: "invalid token" };
  const chunks = expo.chunkPushNotifications([message]);
  const tickets = [];
  for (const chunk of chunks) {
    try {
      tickets.push(...(await expo.sendPushNotificationsAsync(chunk)));
    } catch (err) {
      console.error("[pushService] chunk send failed:", err.message);
    }
  }
  for (const ticket of tickets) {
    if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
      // Token is dead — best-effort cleanup so we stop retrying it.
      await User.updateOne({ expoPushToken: message.to }, { $unset: { expoPushToken: "" } }).catch(() => {});
    }
  }
  return tickets[0] || { status: "error", message: "no ticket" };
}

/**
 * Generic single-user push, respecting notificationPreferences.push.enabled.
 */
async function sendToUser(userId, { title, body, data = {}, priority = "high", channelId = "kokohor_general" }) {
  const user = await User.findById(userId).select("expoPushToken notificationPreferences").lean();
  if (!user) return;
  if (user.notificationPreferences?.push?.enabled === false) return;
  if (!user.expoPushToken || !Expo.isExpoPushToken(user.expoPushToken)) return;

  return _deliver({
    to: user.expoPushToken,
    sound: "default",
    title,
    body,
    data,
    priority,
    channelId,
    ttl: 60 * 60,
  });
}

/**
 * High-priority, data-only ringing push for an incoming kokohor call
 * (1-1 or group). Replaces the broken firebase-admin `sendCallPush`.
 * Bypasses the user's general push toggle (ringing is latency-sensitive
 * and consent for calls is implicit in using the calling feature), but
 * still requires a real token and skips cleanly if there is none.
 */
async function sendCallRingingPush(userId, data = {}, ttlSeconds = 40) {
  const user = await User.findById(userId).select("expoPushToken").lean();
  if (!user?.expoPushToken || !Expo.isExpoPushToken(user.expoPushToken)) return;

  const strData = {};
  Object.entries(data).forEach(([k, v]) => (strData[k] = String(v ?? "")));

  return _deliver({
    to: user.expoPushToken,
    // Data-only so the client's background handler (not a visible banner)
    // decides how to render the incoming-call UI, mirroring the original
    // firebase "data-only" intent.
    data: strData,
    priority: "high",
    channelId: "kokohor_calls",
    ttl: ttlSeconds,
  });
}

/** Fan-out helper for group-call ringing / feed events to many recipients at once. */
async function sendToUsers(userIds, payload) {
  await Promise.all(userIds.map((id) => sendToUser(id, payload).catch((e) => console.error("[pushService] sendToUsers:", e.message))));
}

/**
 * Group-call ringing. Unlike 1-1 calls (which have a native incoming-call
 * handler), group calls are opened from a normal visible notification —
 * a data-only push is never displayed on Android when the app is closed,
 * so this one carries a title/body on the "incoming_calls" channel the app
 * creates (src/services/pushSetup.ts). Tapping it opens the group call.
 */
async function sendGroupCallRingingPush(userIds, callPayload) {
  const User = require("../../models/kokohor/User");
  const Family = require("../../models/kokohor/Family");
  let callerName = "Someone";
  let familyName = "your family";
  try {
    const [caller, family] = await Promise.all([
      User.findById(callPayload.callerId).select("firstName lastName").lean(),
      Family.findById((callPayload.familyIds || [])[0]).select("familyName").lean(),
    ]);
    callerName = `${caller?.firstName || ""} ${caller?.lastName || ""}`.trim() || callerName;
    familyName = family?.familyName || familyName;
  } catch {}

  const data = {};
  Object.entries(callPayload).forEach(([k, v]) => {
    data[k] = Array.isArray(v) ? JSON.stringify(v) : String(v ?? "");
  });

  await Promise.all(
    userIds.map(async (id) => {
      try {
        const user = await User.findById(id).select("expoPushToken").lean();
        if (!user?.expoPushToken || !Expo.isExpoPushToken(user.expoPushToken)) return;
        await _deliver({
          to: user.expoPushToken,
          title: `📞 ${callerName} is calling`,
          body: `Group call in ${familyName} — tap to join`,
          sound: "default",
          data,
          priority: "high",
          channelId: "incoming_calls",
          ttl: 45,
        });
      } catch (e) {
        console.error("[pushService] groupCallRinging:", e.message);
      }
    })
  );
}

module.exports = {
  sendToUser,
  sendToUsers,
  sendCallRingingPush,
  sendGroupCallRingingPush,
};
