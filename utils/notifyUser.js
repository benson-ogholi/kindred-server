// Filename: notificationUtils.js
const { Expo } = require("expo-server-sdk");
const User = require("../models/User");

// Initialize a new Expo SDK client
let expo = new Expo();

/**
 * Send a push notification to a user by their ID
 * @param {String} userId - MongoDB user ID
 * @param {Object} messageData - { title, body, router }
 */
const sendPushNotificationToUser = async (userId, messageData) => {
  try {
    if (!userId) throw new Error("User ID is required");
    const { title, body, router } = messageData;

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      console.log(`User ${userId} not found, skipping notification.`);
      return;
    }

    // Check if user has any Expo push tokens
    if (!user.exponentPushTokens || user.exponentPushTokens.length === 0) {
      console.log(`User ${userId} has no push tokens`);
      return;
    }

    // Prepare messages
    const messages = user.exponentPushTokens
      .filter(Expo.isExpoPushToken)
      .map((token) => ({
        to: token,
        sound: "default",
        title,
        body,
        data: { router }, // Optional: can be used on client to navigate
      }));

    if (messages.length === 0) {
      console.log(`No valid Expo push tokens for user ${userId}`);
      return;
    }

    // Send notifications in chunks (Expo recommends chunking)
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
