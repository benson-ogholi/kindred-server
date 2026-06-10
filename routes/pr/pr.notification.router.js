// routes/pr/pr.notification.router.js
const express = require("express");
const router = express.Router();

// Import controller functions
const {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
} = require("../../controllers/padiman_route_controllers/notifications"); // ← Adjust path if needed
const { protect } = require("../../middlewares/pr/pr.authMiddleware");


// ====================== NOTIFICATION ROUTES ======================

// Get all notifications for current user
router.get("/", protect, getUserNotifications);

// Mark a single notification as read
router.put("/:id/read", protect, markAsRead);

// Mark ALL notifications as read
router.put("/mark-all-read", protect, markAllAsRead);

// Optional: Delete a notification (if you want this feature later)
// router.delete("/:id", protect, deleteNotification);

module.exports = router;
