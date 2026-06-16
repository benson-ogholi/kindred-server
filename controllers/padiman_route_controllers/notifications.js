const Negotiation = require("../../models/padiman_route_models/Negotiation");
const Notification = require("../../models/padiman_route_models/Notification");

exports.getUserNotifications = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id || req.user;

    const notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const enrichedNotifications = await Promise.all(
      notifications.map(async (n) => {
        let enrichedData = { ...n.data };

        if (n.data?.negotiationId) {
          const negotiation = await Negotiation.findById(n.data.negotiationId)
            .populate("negotiator", "fullName")
            .populate("serviceProvider", "fullName")
            .lean();

          if (negotiation) {
            // 1. Determine if the current user is the Service Provider
            // Compare string IDs to be safe
            const isProvider =
              userId.toString() === negotiation.serviceProvider?._id.toString();

            // 2. Determine if it is a parcel delivery
            const isParcel = negotiation.serviceType === "deliver_a_parcel";

            // Add these flags to the data object
            enrichedData.negotiation = {
              ...negotiation,
              isProvider,
              isParcel,
            };
          }
        }

        return { ...n, data: enrichedData };
      })
    );

    res.status(200).json({
      success: true,
      count: enrichedNotifications.length,
      notifications: enrichedNotifications,
    });
  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch" });
  }
};

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
