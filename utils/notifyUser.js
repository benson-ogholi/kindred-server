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

    const pushToken = user.expoPushToken;

    // Check if token exists and is a valid Expo push token string
    if (!pushToken || !Expo.isExpoPushToken(pushToken)) {
      console.log(`No valid Expo push token found for user ${userId}`);
      return;
    }

    const messages = [
      {
        to: pushToken,
        sound,
        title,
        body,
        data: {
          router,
          ...data,
        },
        priority: "high",
        channelId: "calls",
      },
    ];

    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (err) {
        console.error("Error sending push notification chunk:", err);
      }
    }

    // Inspect tickets for immediate errors (e.g., DeviceNotRegistered)
    for (const ticket of tickets) {
      if (ticket.status === "error") {
        console.error(`Error sending notification ticket: ${ticket.message}`);
        if (ticket.details && ticket.details.error) {
          console.error(`Error code: ${ticket.details.error}`);
        }
      } else if (ticket.status === "ok") {
        console.log(
          `Notification ticket enqueued successfully with ID: ${ticket.id}`
        );
      }
    }
  } catch (err) {
    console.error("Error in sendPushNotificationToUser:", err.message);
  }
};


module.exports = { sendPushNotificationToUser };
