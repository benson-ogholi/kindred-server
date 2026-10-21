const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs"); // <-- Required for hashing passcode & security answers
const User = require("../models/User");
const { protect } = require("../middlewares/authMiddleware");
const { uploadToBackblaze } = require("../utils/uploadToBackblaze");
const sendEmail = require("../utils/sendEmail"); // <-- Imported sendEmail for security alerts
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

      const folder = "profile-pictures";
      const imageUrl = await uploadToBackblaze(
        req.file.buffer,
        req.file.originalname,
        folder
      );

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
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

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

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (phone !== undefined) user.phone = phone;
    if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth;
    if (bio !== undefined) user.bio = bio;
    if (expoPushToken !== undefined) user.expoPushToken = expoPushToken;

    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists)
        return res.status(400).json({ message: "Email already in use" });
      user.email = email;
    }

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

// ==========================================
// 🔐 SET PASSCODE & BACKUP SECURITY QUESTION
// ==========================================
router.post("/set-passcode", protect, async (req, res) => {
  try {
    const { passcode, backupQuestion, backupAnswer } = req.body;
    const userId = req.user._id;

    if (!passcode || !backupQuestion || !backupAnswer) {
      return res.status(400).json({
        success: false,
        message: "Passcode, backup question, and answer are required",
      });
    }

    if (passcode.length < 4 || passcode.length > 6) {
      return res.status(400).json({
        success: false,
        message: "Passcode must be between 4 and 6 digits",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const hashedPasscode = await bcrypt.hash(passcode, 10);
    const hashedAnswer = await bcrypt.hash(
      backupAnswer.trim().toLowerCase(),
      10
    );

    user.passcode = hashedPasscode;
    user.securityQuestion = backupQuestion;
    user.securityAnswer = hashedAnswer;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Passcode and security question set successfully!",
    });
  } catch (error) {
    console.error("🔥 Set Passcode Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==========================================
// ✏️ EDIT PASSCODE & SECURITY QUESTION
// ==========================================
router.patch("/edit-passcode", protect, async (req, res) => {
  try {
    const { currentPasscode, newPasscode, newBackupQuestion, newBackupAnswer } =
      req.body;
    const userId = req.user._id;

    if (!currentPasscode) {
      return res.status(400).json({
        success: false,
        message: "Current passcode is required to make changes",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!user.passcode) {
      return res.status(400).json({
        success: false,
        message: "No passcode currently set. Please use /set-passcode first.",
      });
    }

    const isMatch = await bcrypt.compare(currentPasscode, user.passcode);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Incorrect current passcode" });
    }

    if (newPasscode) {
      if (newPasscode.length < 4 || newPasscode.length > 6) {
        return res.status(400).json({
          success: false,
          message: "New passcode must be between 4 and 6 digits",
        });
      }
      user.passcode = await bcrypt.hash(newPasscode, 10);
    }

    if (newBackupQuestion && newBackupAnswer) {
      user.securityQuestion = newBackupQuestion;
      user.securityAnswer = await bcrypt.hash(
        newBackupAnswer.trim().toLowerCase(),
        10
      );
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Passcode and security details updated successfully!",
    });
  } catch (error) {
    console.error("🔥 Edit Passcode Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/", protect, async (req, res) => {
  try {
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

    const safeUser = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      profilePicture: user.profilePicture,
      isVerified: user.isVerified,
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

// ==========================================
// 🔑 VERIFY PASSCODE & HANDLE FAILED ATTEMPTS
// ==========================================
router.post("/verify-passcode", protect, async (req, res) => {
  try {
    const { passcode, securityAnswer } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Check if this account is exempt from lockouts
    const isExempt = user.email === "ibenemeikenna2021@gmail.com";

    // 1. Check if user is currently locked out (Bypassed if exempt)
    if (
      !isExempt &&
      user.passcodeLockedUntil &&
      new Date() < new Date(user.passcodeLockedUntil)
    ) {
      const remainingMinutes = Math.ceil(
        (new Date(user.passcodeLockedUntil) - new Date()) / (1000 * 60)
      );
      return res.status(429).json({
        success: false,
        locked: true,
        message: `Account is locked due to multiple failed attempts. Try again in ${remainingMinutes} minutes.`,
      });
    }

    // 2. If user hit max attempts OR clicked "Forgot Passcode" and provided a security answer
    if (user.requiresSecurityQuestion || securityAnswer) {
      if (!securityAnswer) {
        return res.status(400).json({
          success: false,
          requiresSecurityQuestion: true,
          securityQuestion: user.securityQuestion,
          message: "Please answer your security question.",
        });
      }

      // Safely compare trimmed and lowercased input with the stored hash
      const isAnswerMatch = await bcrypt.compare(
        securityAnswer.trim().toLowerCase(),
        user.securityAnswer
      );

      if (!isAnswerMatch) {
        // If exempt, don't lock the account or change status
        if (isExempt) {
          return res.status(400).json({
            success: false,
            requiresSecurityQuestion: true,
            securityQuestion: user.securityQuestion,
            message:
              "Incorrect security answer. (Bypassed lock for exempt user)",
          });
        }

        // Failed security question -> Lock for 3 hours, log out user
        const lockoutTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
        user.passcodeLockedUntil = lockoutTime;
        user.passcodeAttempts = 0;
        user.requiresSecurityQuestion = false;
        user.isOnline = false;
        user.socketId = null;
        await user.save();

        // 🚨 SEND SECURITY ALERT EMAIL ON FAILED ACCESS
        try {
          if (user.email) {
            await sendEmail(
              user.email,
              "Security Alert: Account Access Locked",
              `Hello ${
                user.firstName || "User"
              },\n\nWe detected multiple incorrect security verification attempts on your Kokohor Circle account. For your safety, your account access has been temporarily locked for 3 hours.\n\nIf this wasn't you, please secure your account immediately or contact support at kokohorcircle@gmail.com.`,
              "alert"
            );
          }
        } catch (emailErr) {
          console.error("Failed to send security alert email:", emailErr);
        }

        return res.status(403).json({
          success: true,
          locked: true,
          message:
            "Incorrect security answer. Account has been locked for 3 hours.",
        });
      }

      // Success answering security question! Reset attempts and unlock
      user.passcodeAttempts = 0;
      user.requiresSecurityQuestion = false;
      user.passcodeLockedUntil = null;
      await user.save();

      return res.status(200).json({
        success: true,
        message: "Passcode verified successfully via security question!",
      });
    }

    // 3. Normal Passcode verification flow
    if (!passcode) {
      return res
        .status(400)
        .json({ success: false, message: "Passcode is required" });
    }

    if (!user.passcode) {
      return res
        .status(400)
        .json({ success: false, message: "No passcode set for this user." });
    }

    const isMatch = await bcrypt.compare(passcode, user.passcode);
    if (!isMatch) {
      user.passcodeAttempts = (user.passcodeAttempts || 0) + 1;

      if (!isExempt && user.passcodeAttempts >= 3) {
        user.requiresSecurityQuestion = true;
        await user.save();

        return res.status(401).json({
          success: false,
          requiresSecurityQuestion: true,
          securityQuestion: user.securityQuestion,
          message:
            "3 incorrect attempts. Please answer your security question to continue.",
        });
      }

      await user.save();

      if (isExempt) {
        return res.status(400).json({
          success: false,
          message: "Incorrect passcode. (Lockout bypassed for exempt user)",
        });
      }

      const remainingAttempts = 3 - user.passcodeAttempts;
      return res.status(400).json({
        success: false,
        message: `Incorrect passcode. You have ${remainingAttempts} attempt(s) remaining before security verification.`,
      });
    }

    // 4. Successful passcode match -> Reset counters
    user.passcodeAttempts = 0;
    user.requiresSecurityQuestion = false;
    user.passcodeLockedUntil = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Passcode verified successfully!",
    });
  } catch (error) {
    console.error("🔥 Verify Passcode Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
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


// ==========================================
// 📱 CHECK APP UPDATE ROUTE
// ==========================================


module.exports = router;
