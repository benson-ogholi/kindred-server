const { Expo } = require("expo-server-sdk");
const User = require("../models/kokohor/User");
const Notification = require("../models/kokohor/Notification");
const Family = require("../models/kokohor/Family");
const { isMutedFor } = require("./kokohor/moderation");

// Initialize Expo SDK
const expo = new Expo();

/**
 * Send a push notification to a single user by their User ID
 * @param {String} userId
 * @param {Object} messageData - { title, body, router }
 */
async function sendPushNotificationToUser(userId, messageData) {
  try {
    if (!userId) throw new Error("User ID is required");
    const { title, body, router, data = {}, channelId = "kokohor_general" } = messageData;

    console.log(`📡 Fetching push token for User ID: ${userId}...`);
    const user = await User.findById(userId).select(
      "expoPushToken notificationPreferences firstName lastName"
    );

    if (!user) {
      return console.log(`❌ Push skipped: User ${userId} not found in DB`);
    }

    const userName =
      `${user.firstName || ""} ${user.lastName || ""}`.trim() || userId;

    if (user.notificationPreferences?.push?.enabled === false) {
      return console.log(
        `🚫 Push skipped for ${userName}: Push notifications disabled in preferences`
      );
    }

    if (!user.expoPushToken) {
      return console.log(
        `⚠️ Push skipped for ${userName}: No expoPushToken found`
      );
    }

    if (!Expo.isExpoPushToken(user.expoPushToken)) {
      console.log(`❌ Push skipped for ${userName}: invalid Expo push token`);
      return;
    }

    console.log(
      `📤 Sending push notification to ${userName}...`
    );

    const message = {
      to: user.expoPushToken,
      sound: "default",
      title,
      body,
      data: { router, ...data },
      // Android only shows a push on a channel the app has created — see
      // src/services/pushSetup.ts in the app ("kokohor_general").
      channelId,
      priority: "high",
    };

    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      try {
        const receipts = await expo.sendPushNotificationsAsync(chunk);
        console.log(
          `✅ Push notification successfully sent to ${userName}! Receipts:`,
          JSON.stringify(receipts, null, 2)
        );
      } catch (err) {
        console.error(
          `🔥 Error sending push notification chunk to ${userName}:`,
          err
        );
      }
    }
  } catch (err) {
    console.error(
      `🔥 Error in sendPushNotificationToUser for ${userId}:`,
      err.message
    );
  }
}

/**
 * Create notifications for all family members and send push notifications to each user
 * @param {String} familyId
 * @param {String} senderId
 * @param {Object} data - { type, title, message, relatedId, router }
 */
async function createFamilyNotifications(familyId, senderId, data) {
  try {
    console.log("--------------------------------------------------");
    console.log("🔔 Starting createFamilyNotifications process");
    console.log("➡️ Family ID:", familyId);
    console.log("➡️ Sender ID:", senderId);
    console.log("➡️ Notification Payload:", {
      title: data.title,
      message: data.message,
      type: data.type,
    });

    const family = await Family.findById(familyId).select("members owner");
    if (!family) {
      console.warn("⚠️ Family not found for notifications");
      return;
    }

    // Extract all member and owner IDs (Handling owner array properly according to Family schema)
    const owners = Array.isArray(family.owner)
      ? family.owner.map((id) => id.toString())
      : [family.owner.toString()];

    const members = (family.members || []).map((id) => id.toString());

    // Combine members + owner + sender for DB records
    const recipientIds = Array.from(
      new Set([...members, ...owners, senderId.toString()])
    );
    console.log(
      `👥 Total in-app notification recipients (${recipientIds.length}):`,
      recipientIds
    );

    if (recipientIds.length === 0) {
      console.log("ℹ️ No recipients found for this family");
      return;
    }

    // 1. Create in-app notification records in DB
    // The sender's own copy is stored already-read so it never counts as
    // unread for them; users who blocked the family/sender get none.
    const notifications = [];
    for (const userId of recipientIds) {
      const isSender = userId === senderId.toString();
      // eslint-disable-next-line no-await-in-loop
      if (!isSender && (await isMutedFor(userId, { familyId, senderId, blockOnly: true }))) continue;
      notifications.push({
        recipient: userId,
        familyId,
        type: data.type,
        title: data.title,
        message: data.message,
        relatedId: data.relatedId,
        isRead: isSender,
      });
    }

    await Notification.insertMany(notifications);
    console.log(
      `✅ Saved ${notifications.length} in-app notification(s) to Database`
    );

    // 2. Filter out senderId so users don't receive push notifications for their own actions
    const pushRecipients = recipientIds.filter(
      (id) => id !== senderId.toString()
    );

    console.log(
      `🚀 Dispatching push notifications to ${pushRecipients.length} target recipient(s) (excluding sender)...`
    );

    // (Removed: logging of every recipient's push token.)

    // 3. Send individual push notification to each recipient using sendPushNotificationToUser
    for (const userId of pushRecipients) {
      // Snoozed or blocked family/sender: keep the in-app record, skip the push.
      if (await isMutedFor(userId, { familyId, senderId })) continue;
      await sendPushNotificationToUser(userId, {
        title: data.title,
        body: data.message,
        router: data.router || "/family/chat",
        data: {
          type: data.type,
          familyId: String(familyId),
          relatedId: data.relatedId ? String(data.relatedId) : "",
          senderId: String(senderId),
        },
      });
    }

    console.log(
      "🎉 All family push notification dispatch operations completed!"
    );
    console.log("--------------------------------------------------");
  } catch (error) {
    console.error("🔥 createFamilyNotifications Error:", error);
  }
}

// Export ONLY createFamilyNotifications
module.exports = { createFamilyNotifications };
