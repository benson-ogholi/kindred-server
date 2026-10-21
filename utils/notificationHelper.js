const { Expo } = require("expo-server-sdk");
const User = require("../models/User");
const Notification = require("../models/Notification");
const Family = require("../models/Family");

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
    const { title, body, router } = messageData;

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
      console.log(
        `❌ Push skipped for ${userName}: Invalid Expo push token -> ${user.expoPushToken}`
      );
      return;
    }

    console.log(
      `📤 Sending push notification to ${userName} (Token: ${user.expoPushToken})...`
    );

    const message = {
      to: user.expoPushToken,
      sound: "default",
      title,
      body,
      data: { router },
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
    const notifications = recipientIds.map((userId) => ({
      recipient: userId,
      familyId,
      type: data.type,
      title: data.title,
      message: data.message,
      relatedId: data.relatedId,
    }));

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

    // 🔍 PRE-FETCH & LOG ALL EXPO PUSH TOKENS BEFORE SENDING
    const pushUsers = await User.find({
      _id: { $in: pushRecipients },
    }).select("firstName lastName expoPushToken notificationPreferences");

    console.log("\n📱 --- EXPO PUSH TOKENS TO BE NOTIFIED ---");
    pushUsers.forEach((u) => {
      console.log({
        userId: u._id.toString(),
        name: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
        expoPushToken: u.expoPushToken || "NO_TOKEN_REGISTERED",
        pushEnabled: u.notificationPreferences?.push?.enabled ?? true,
      });
    });
    console.log("-------------------------------------------\n");

    // 3. Send individual push notification to each recipient using sendPushNotificationToUser
    for (const userId of pushRecipients) {
      await sendPushNotificationToUser(userId, {
        title: data.title,
        body: data.message,
        router: data.router,
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
