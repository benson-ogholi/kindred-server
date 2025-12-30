const { Expo } = require("expo-server-sdk");
const User = require("../models/User");
const Notification = require("../models/Notification");
const Family = require("../models/Family");

// Initialize Expo SDK
const expo = new Expo();

/**
 * Send a push notification to a user by their ID
 * @param {String} userId
 * @param {Object} messageData - { title, body, router }
 */
async function sendPushNotificationToUser(userId, messageData) {
  try {
    if (!userId) throw new Error("User ID is required");
    const { title, body, router } = messageData;

    const user = await User.findById(userId);
    if (!user) return console.log(`User ${userId} not found`);

    if (!user.expoPushToken)
      return console.log(`User ${userId} has no Expo push token`);

    if (!Expo.isExpoPushToken(user.expoPushToken)) {
      console.log(`Invalid Expo push token for user ${userId}`);
      return;
    }

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
        console.log("Push notification receipts:", receipts);
      } catch (err) {
        console.error("Error sending push notification chunk:", err);
      }
    }
  } catch (err) {
    console.error("Error in sendPushNotificationToUser:", err.message);
  }
}

/**
 * Create notifications for all family members and send push notifications
 * @param {String} familyId
 * @param {String} senderId
 * @param {Object} data - { type, title, message, relatedId, router }
 */
async function createFamilyNotifications(familyId, senderId, data) {
  try {
    console.log("🔔 Creating family notifications");
    console.log("➡️ Family ID:", familyId);
    console.log("➡️ Sender ID:", senderId);

    const family = await Family.findById(familyId).select("members owner");
    if (!family) {
      console.warn("⚠️ Family not found for notifications");
      return;
    }

    // Combine members + owner + sender
    const recipients = new Set([
      ...family.members.map((id) => id.toString()),
      family.owner.toString(),
      senderId.toString(),
    ]);

    console.log("👥 Notification recipients:", Array.from(recipients));

    // Create notifications array
    const notifications = Array.from(recipients).map((userId) => ({
      recipient: userId,
      familyId,
      type: data.type,
      title: data.title,
      message: data.message,
      relatedId: data.relatedId,
    }));

    if (notifications.length === 0) {
      console.log("ℹ️ No notifications to create");
      return;
    }

    // Insert notifications into DB
    await Notification.insertMany(notifications);
    console.log(`✅ Notifications saved for ${notifications.length} users`);

    // Send push notifications for each recipient
    for (const userId of recipients) {
      await sendPushNotificationToUser(userId, {
        title: data.title,
        body: data.message,
        router: data.router, // optional navigation
      });
    }

    console.log(`✅ Push notifications sent to all recipients`);
  } catch (error) {
    console.error("🔥 createFamilyNotifications Error:", error);
  }
}

// Export the function as a module
module.exports = { createFamilyNotifications };
