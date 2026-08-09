const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { protect } = require("../middlewares/authMiddleware");
const { uploadToBackblaze } = require("../utils/uploadToBackblaze");
const multer = require("multer"); // <-- This is required for upload
const upload = multer({ storage: multer.memoryStorage() });

// Save VoIP Token Route
router.post("/voip-token", protect, async (req, res) => {
  try {
    const { voipPushToken } = req.body;
    const userId = req.user._id; // Securely using ID from the protect middleware

    if (!voipPushToken) {
      return res.status(400).json({
        success: false,
        error: "Missing voipPushToken",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { voipPushToken },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    console.log(`[voip-token] Saved VoIP token for user ${userId}`);

    res.status(200).json({
      success: true,
      voipPushToken: user.voipPushToken,
    });
  } catch (err) {
    console.error("[voip-token] error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to save VoIP token",
    });
  }
});

router.get("/profile", protect, async (req, res) => {
  try {
    // req.user._id is provided by the protect middleware
    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("🔥 Get Profile Error:", error);
    res.status(500).json({ message: "Server error fetching profile" });
  }
});

router.patch(
  "/profile-picture",
  protect,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Please upload an image" });
      }

      // 1. Upload to Backblaze
      const fileName = `profile_${req.user._id}_${Date.now()}`;
      const folder = "profile-pictures";

      const imageUrl = await uploadToBackblaze(
        req.file.buffer,
        req.file.originalname,
        folder
      );

      // 2. Save URL to User in DB
      const user = await User.findByIdAndUpdate(
        req.user._id,
        { profilePicture: imageUrl },
        { new: true }
      ).select("-password");

      res.status(200).json({
        success: true,
        message: "Profile picture updated successfully",
        profilePicture: imageUrl,
        user,
      });
    } catch (error) {
      console.error("🔥 Profile Picture Upload Error:", error);
      res.status(500).json({ message: "Server error uploading image" });
    }
  }
);

router.patch("/profile", protect, async (req, res) => {
  try {
    console.log("🟢 UPDATE PROFILE HIT");
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Ensure nested objects exist
    if (!user.privacySettings) user.privacySettings = {};
    if (!user.notificationPreferences)
      user.notificationPreferences = { push: {}, email: {}, sms: {} };

    const {
      firstName,
      lastName,
      phone,
      dateOfBirth,
      bio,
      email,
      expoPushToken,
      privacySettings,
      notificationPreferences,
    } = req.body;

    // Basic Info
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (phone !== undefined) user.phone = phone;
    if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth;
    if (bio !== undefined) user.bio = bio;
    if (expoPushToken !== undefined) user.expoPushToken = expoPushToken;

    // Email update logic
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists)
        return res.status(400).json({ message: "Email already in use" });
      user.email = email;
    }

    // Privacy Settings - Syncing with Schema
    if (privacySettings) {
      if (privacySettings.showNameInDonations !== undefined) {
        user.privacySettings.showNameInDonations =
          privacySettings.showNameInDonations;
      }
      if (privacySettings.showContactDetailsToFamily !== undefined) {
        user.privacySettings.showContactDetailsToFamily =
          privacySettings.showContactDetailsToFamily;
      }
    }

    // Notification Preferences
    if (notificationPreferences) {
      if (notificationPreferences.push?.enabled !== undefined)
        user.notificationPreferences.push.enabled =
          notificationPreferences.push.enabled;
      if (notificationPreferences.email?.enabled !== undefined)
        user.notificationPreferences.email.enabled =
          notificationPreferences.email.enabled;
      if (notificationPreferences.sms?.enabled !== undefined)
        user.notificationPreferences.sms.enabled =
          notificationPreferences.sms.enabled;

      if (notificationPreferences.donationNotifications !== undefined) {
        user.notificationPreferences.donationNotifications =
          notificationPreferences.donationNotifications;
      }
      if (notificationPreferences.withdrawalNotifications !== undefined) {
        user.notificationPreferences.withdrawalNotifications =
          notificationPreferences.withdrawalNotifications;
      }
    }

    const updatedUser = await user.save();
    const userResponse = updatedUser.toObject();
    delete userResponse.password;

    res.status(200).json({ success: true, user: userResponse });
  } catch (error) {
    console.error("🔥 Profile Update Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get all users (admin / protected)
router.get("/", protect, async (req, res) => {
  try {
    // Fetch all users, excluding passwords
    const users = await User.find().select("-password");

    res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("🔥 Get All Users Error:", error);
    res.status(500).json({ message: "Server error fetching users" });
  }
});

router.get("/:id", protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const showContact =
      user.privacySettings?.showContactDetailsToFamily !== false;

    // Build safe response manually
    const safeUser = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      profilePicture: user.profilePicture,
      isVerified: user.isVerified,

      // Only include contact details if allowed
      ...(showContact && {
        email: user.email,
        phone: user.phone,
      }),

      privacySettings: user.privacySettings,
      notificationPreferences: user.notificationPreferences,
      savedFamilies: user.savedFamilies,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.json({
      success: true,
      user: safeUser,
    });
  } catch (error) {
    console.error("🔥 Fetch User Error:", error);
    res.status(500).json({ message: "Server error fetching user details" });
  }
});

// Update Expo Push Token
router.patch("/push-token", protect, async (req, res) => {
  try {
    const { expoPushToken } = req.body;

    if (!expoPushToken) {
      return res.status(400).json({ message: "expoPushToken is required" });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.expoPushToken = expoPushToken;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Expo push token updated successfully",
      expoPushToken: user.expoPushToken,
    });
  } catch (error) {
    console.error("🔥 Update Expo Push Token Error:", error);
    res.status(500).json({ message: "Server error updating push token" });
  }
});

module.exports = router;
