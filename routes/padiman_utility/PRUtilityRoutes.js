const express = require("express");
const multer = require("multer");

const {
  registerPRUtility,
  loginPRUtility,
  forgotPassword,
  verifyOTP,
  resetPassword,
  resendOTP,
  getProfile,
  updateProfile,
  getWorkmen,        // ← NEW
} = require("../../controllers/padiman_utility_controllers/PRUtilityController");

const router = express.Router();
const { protect } = require("../../middlewares/pru/auth");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ======================
// Auth Routes
// ======================
router.post("/register", registerPRUtility);
router.post("/login", loginPRUtility);

router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOTP);
router.post("/reset-password", resetPassword);
router.post("/resend-otp", resendOTP);

// ======================
// Profile Routes
// ======================
router.get("/profile", protect, getProfile);
router.put("/profile", protect, upload.single("profilePicture"), updateProfile);

// ======================
// Workmen Routes (NEW)
// ======================
router.get("/workmen", getWorkmen);

module.exports = router;