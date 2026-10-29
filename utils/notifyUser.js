// notificationUtils.js
const { Expo } = require("expo-server-sdk");
const User = require("../models/User");

const expo = new Expo();

/**
 * @param {String} userId
 * @param {Object} messageData - { title, body, router, data?, sound?, channelId?, priority?, badge? }
 */
const sendPushNotificationToUser = async (userId, messageData) => {
  try {
    if (!userId) throw new Error("User ID is required");

    const {
      title,
      body,
      router,
      data = {},
      sound = "default",
      channelId = "chat_messages_v2", // default channel is chat, NOT calls
      priority = "high",
      badge,
    } = messageData;

    const user = await User.findById(userId);
    if (!user) {
      console.log(`User ${userId} not found, skipping notification.`);
      return;
    }

    const pushToken = user.expoPushToken;

    if (!pushToken || !Expo.isExpoPushToken(pushToken)) {
      console.log(`No valid Expo push token found for user ${userId}`);
      return;
    }

    const message = {
      to: pushToken,
      sound,
      title,
      body,
      data: {
        router,
        ...data,
      },
      priority, // "high" = delivered immediately even in Doze mode
      channelId, // must match a channel created in the app
      ttl: 60 * 60, // drop if undelivered for 1 hour
    };
    if (badge !== undefined) message.badge = badge;

    const chunks = expo.chunkPushNotifications([message]);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (err) {
        console.error("Error sending push notification chunk:", err);
      }
    }

    for (const ticket of tickets) {
      if (ticket.status === "error") {
        console.error(`Error sending notification ticket: ${ticket.message}`);
        if (ticket.details && ticket.details.error) {
          console.error(`Error code: ${ticket.details.error}`);

          // Token is dead: clear it so we stop sending to it
          if (ticket.details.error === "DeviceNotRegistered") {
            await User.updateOne(
              { _id: userId },
              { $unset: { expoPushToken: "" } }
            );
          }
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
