const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const { protect } = require("../middlewares/authMiddleware");

// @desc    Get user's notifications
// @route   GET /api/notifications
router.get("/", protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50); // Keep the feed fast

    res.json({ success: true, notifications });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

// @desc    Mark notification as read
// @route   PATCH /api/notifications/:id/read
router.patch("/:id/read", protect, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Mark all as read
router.patch("/read-all", protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
