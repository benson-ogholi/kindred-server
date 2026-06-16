// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");

const {
  getProfile,
  updateProfile,
  updateProfilePicture, // ← New function added
  deleteAccount,
  logout,
  saveExpoPushToken,
  getUserDashboardOrders,
  getUserAllRequests,
  getRequestById,
  getAppUpdates
} = require("../../controllers/padiman_route_controllers/pr.user.controllers");

const { protect } = require("../../middlewares/pr/pr.authMiddleware");

// Multer setup for file upload (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// ====================== PROFILE ROUTES ======================
router.get("/app-updates", getAppUpdates);

// Get User Profile
router.get("/profile", protect, getProfile);

// Update Profile (Text fields only)
router.put("/profile", protect, updateProfile);

// Update Profile Picture (Separate endpoint)
router.put(
  "/profile-picture",
  protect,
  upload.single("profileImage"),
  updateProfilePicture
);

// Delete Account
router.delete("/account", protect, deleteAccount);

// Logout
router.post("/logout", protect, logout);

// Push Token
router.post("/push-token", protect, saveExpoPushToken);

// Dashboard Summary
router.get("/orders/summary", protect, getUserDashboardOrders);

router.get("/my-requests", protect, getUserAllRequests);
router.get("/:id", protect, getRequestById);

module.exports = router;
