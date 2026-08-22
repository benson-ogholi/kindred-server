// notificationUtils.js
const { Expo } = require("expo-server-sdk");
const User = require("../models/User");

let expo = new Expo();

/**
 * @param {String} userId
 * @param {Object} messageData - { title, body, router, data?, sound? }
 */
const sendPushNotificationToUser = async (userId, messageData) => {
  try {
    if (!userId) throw new Error("User ID is required");

    const { title, body, router, data = {}, sound = "default" } = messageData;

    const user = await User.findById(userId);
    if (!user) {
      console.log(`User ${userId} not found, skipping notification.`);
      return;
    }

    if (!user.expoPushToken || user.expoPushToken.length === 0) {
      console.log(`User ${userId} has no push tokens`);
      return;
    }

    const messages = user.expoPushToken
      .filter(Expo.isExpoPushToken)
      .map((token) => ({
        to: token,
        sound,
        title,
        body,
        // Everything the client needs when the app is opened from the notification
        data: {
          router,
          ...data, // type, roomId, callerId, etc.
        },
        // Optional but recommended for calls
        priority: "high",
        channelId: "calls", // create this channel on Android
      }));

    if (messages.length === 0) {
      console.log(`No valid Expo push tokens for user ${userId}`);
      return;
    }

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        const receipts = await expo.sendPushNotificationsAsync(chunk);
        console.log("Push notification receipts:", receipts);
      } catch (err) {
        console.error("Error sending push notifications chunk:", err);
      }
    }
  } catch (err) {
    console.error("Error in sendPushNotificationToUser:", err.message);
  }
};

module.exports = { sendPushNotificationToUser };