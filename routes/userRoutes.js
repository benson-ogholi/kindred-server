const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { protect } = require("../middlewares/authMiddleware");

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

router.patch("/profile", protect, async (req, res) => {
  try {
    console.log("🟢 UPDATE PROFILE HIT");
    console.log("➡️ Payload:", req.body);
    console.log("➡️ User:", req.user._id);

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    /* =====================================================
       🔧 ENSURE NESTED OBJECTS EXIST (CRITICAL FIX)
    ====================================================== */
    if (!user.privacySettings) {
      user.privacySettings = {
        showNameInDonations: true,
        showContactDetailsToFamily: true,
      };
    }

    if (!user.notificationPreferences) {
      user.notificationPreferences = {
        push: { enabled: true },
        email: { enabled: true },
        sms: { enabled: false },
        donationNotifications: true,
        withdrawalNotifications: true,
      };
    }

    if (!user.notificationPreferences.push) {
      user.notificationPreferences.push = { enabled: true };
    }
    if (!user.notificationPreferences.email) {
      user.notificationPreferences.email = { enabled: true };
    }
    if (!user.notificationPreferences.sms) {
      user.notificationPreferences.sms = { enabled: false };
    }

    /* =====================================================
       1️⃣ BASIC INFORMATION
    ====================================================== */
    const {
      firstName,
      lastName,
      phone,
      dateOfBirth,
      email,
      bio,
      expoPushToken,
      privacySettings,
      notificationPreferences,
    } = req.body;

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (phone !== undefined) user.phone = phone;
    if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth;
    if (bio !== undefined) user.bio = bio;

    /* =====================================================
       2️⃣ EMAIL UPDATE (SAFE)
    ====================================================== */
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ message: "Email already in use" });
      }
      user.email = email;
    }

    /* =====================================================
       3️⃣ EXPO PUSH TOKEN
    ====================================================== */
    if (expoPushToken !== undefined) {
      user.expoPushToken = expoPushToken;
      console.log("📲 Expo push token updated");
    }

    /* =====================================================
       4️⃣ PRIVACY SETTINGS
    ====================================================== */
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

    /* =====================================================
       5️⃣ NOTIFICATION PREFERENCES
    ====================================================== */
    if (notificationPreferences) {
      if (notificationPreferences.push?.enabled !== undefined) {
        user.notificationPreferences.push.enabled =
          notificationPreferences.push.enabled;
      }

      if (notificationPreferences.email?.enabled !== undefined) {
        user.notificationPreferences.email.enabled =
          notificationPreferences.email.enabled;
      }

      if (notificationPreferences.sms?.enabled !== undefined) {
        user.notificationPreferences.sms.enabled =
          notificationPreferences.sms.enabled;
      }

      if (notificationPreferences.donationNotifications !== undefined) {
        user.notificationPreferences.donationNotifications =
          notificationPreferences.donationNotifications;
      }

      if (notificationPreferences.withdrawalNotifications !== undefined) {
        user.notificationPreferences.withdrawalNotifications =
          notificationPreferences.withdrawalNotifications;
      }
    }

    /* =====================================================
       6️⃣ SAVE
    ====================================================== */
    const updatedUser = await user.save();

    const userResponse = updatedUser.toObject();
    delete userResponse.password;

    console.log("✅ Profile updated successfully");

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: userResponse,
    });
  } catch (error) {
    console.error("🔥 Profile Update Error:", error);
    res.status(500).json({ message: "Server error during profile update" });
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

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("🔥 Fetch User Error:", error);
    res.status(500).json({ message: "Server error fetching user details" });
  }
});

module.exports = router;
