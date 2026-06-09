// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const {
  getProfile,
  updateProfile,
  deleteAccount,
  logout,
  saveExpoPushToken,
} = require("../../controllers/padiman_route_controllers/pr.user.controllers");
const { protect } = require("../../middlewares/pr/pr.authMiddleware");

router.get("/profile", protect, getProfile);
router.put("/profile", protect, updateProfile);
router.delete("/account", protect, deleteAccount);
router.post("/logout", protect, logout);

router.post("/push-token", protect, saveExpoPushToken);

module.exports = router;
