const Notification = require("../models/Notification");
const Family = require("../models/Family");

/**
 * @param {String} familyId
 * @param {String} senderId
 * @param {Object} data - { type, title, message, relatedId }
 */
const createFamilyNotifications = async (familyId, senderId, data) => {
  try {
    console.log("🔔 Creating family notifications");
    console.log("➡️ Family ID:", familyId);
    console.log("➡️ Sender ID:", senderId);

    const family = await Family.findById(familyId).select("members owner");

    if (!family) {
      console.warn("⚠️ Family not found for notifications");
      return;
    }

    // Combine members + owner (sender INCLUDED)
    const recipients = new Set([
      ...family.members.map((id) => id.toString()),
      family.owner.toString(),
      senderId.toString(), // ✅ explicitly ensure sender is included
    ]);

    console.log("👥 Notification recipients:", Array.from(recipients));

    const notifications = Array.from(recipients).map((userId) => ({
      recipient: userId,
      familyId,
      type: data.type,
      title: data.title,
      message: data.message,
      relatedId: data.relatedId,
    }));

    if (notifications.length === 0) {
      console.log("ℹ️ No notifications to send");
      return;
    }

    await Notification.insertMany(notifications);

    console.log(`✅ Notifications sent to ${notifications.length} users`);
  } catch (error) {
    console.error("🔥 Notification Error:", error);
  }
};

module.exports = { createFamilyNotifications };
