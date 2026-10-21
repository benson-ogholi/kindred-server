const express = require("express");
const authController = require("../../controllers/cooperative/authController");
const { protect } = require("../../middlewares/cooperative/authMiddleware");
const multer = require("multer");
const router = express.Router();

// Public routes
router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/verify-otp", authController.verifyOtp);
router.post("/forgot-password", authController.forgotPassword);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // Limit file size to 5MB
  },
});

// Protected profile & security routes
router.put(
  "/profile",
  protect,
  upload.single("profilePicture"),
  authController.updateUserProfile
);

router.patch("/transaction-pin", protect, authController.setupOrUpdatePin);
// Protected role switching route
router.patch("/switch-role", protect, authController.switchRole);
// Protected routes
router.get("/me", protect, authController.getMe);
router.patch("/push-token", protect, authController.updatePushToken);
router.post("/reset-password", authController.resetPassword);

module.exports = router;
