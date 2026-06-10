const Notification = require("../../models/padiman_route_models/Notification");

// Get all notifications for the logged-in user
exports.getUserNotifications = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id || req.user; // Support different token structures

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    console.log(`📬 Fetching notifications for user: ${userId}`);

    const notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 }) // Newest first
      .limit(100); // Limit to prevent overload

    // Optional: Mark all unread as delivered (if you want)
    // await Notification.updateMany(
    //   { user: userId, read: false },
    //   { $set: { delivered: true } }
    // );

    res.status(200).json({
      success: true,
      count: notifications.length,
      notifications,
    });
  } catch (error) {
    console.error("❌ Error fetching user notifications:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: error.message,
    });
  }
};

// Mark a single notification as read
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id || req.user;
    const { id } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: userId },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found or not yours",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
      notification,
    });
  } catch (error) {
    console.error("Error marking notification as read:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update notification",
    });
  }
};

// Mark ALL notifications as read
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id || req.user;

    const result = await Notification.updateMany(
      { user: userId, read: false },
      { read: true }
    );

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error marking all as read:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
