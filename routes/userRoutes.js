const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs"); // Still required for hashing passcodes
const User = require("../models/User");
const { protect } = require("../middlewares/authMiddleware");
const { uploadToBackblaze } = require("../utils/uploadToBackblaze");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

// Save VoIP Token Route
router.post("/voip-token", protect, async (req, res) => {
  try {
    const { voipPushToken } = req.body;
    const userId = req.user._id;

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
  console.log(
    "🔵 [POST /set-passcode] Request received for user ID:",
    req.user._id
  );
  console.log("📦 Request Body:", {
    ...req.body,
    passcode: req.body.passcode ? "[PROTECTED]" : undefined,
  });

  try {
    const { passcode, backupQuestion, backupAnswer } = req.body;
    const userId = req.user._id;

    if (!passcode) {
      console.log(
        "❌ [POST /set-passcode] Validation failed: Passcode is missing"
      );
      return res.status(400).json({
        success: false,
        message: "Passcode is required",
      });
    }

    if (passcode.length < 4 || passcode.length > 6) {
      console.log(
        "❌ [POST /set-passcode] Validation failed: Passcode length invalid"
      );
      return res.status(400).json({
        success: false,
        message: "Passcode must be between 4 and 6 digits",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log("❌ [POST /set-passcode] User not found in database");
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const hashedPasscode = await bcrypt.hash(passcode, 10);
    user.passcode = hashedPasscode;

    if (backupQuestion && backupAnswer) {
      const formattedAnswer = backupAnswer.trim().toLowerCase();
      user.securityQuestion = backupQuestion.trim();
      user.securityAnswer = formattedAnswer;
      user.backupAnswer = formattedAnswer; // Storing to both properties to ensure support
      console.log(
        "✅ [POST /set-passcode] Security Question & Raw Answer configured."
      );
    } else {
      user.securityQuestion = null;
      user.securityAnswer = null;
      user.backupAnswer = null;
      console.log("⚠️ [POST /set-passcode] No security question provided.");
    }

    await user.save();
    console.log(
      "💾 [POST /set-passcode] Passcode and settings successfully saved for user:",
      userId
    );

    return res.status(200).json({
      success: true,
      message: "Passcode and security settings updated successfully!",
    });
  } catch (error) {
    console.error("🔥 [POST /set-passcode] Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==========================================
// ✏️ EDIT PASSCODE & SECURITY QUESTION
// ==========================================
router.patch("/edit-passcode", protect, async (req, res) => {
  console.log(
    "🟡 [PATCH /edit-passcode] Request received for user ID:",
    req.user._id
  );

  try {
    const {
      currentPasscode,
      newPasscode,
      newBackupQuestion,
      newBackupAnswer,
      removeSecurityQuestion,
    } = req.body;
    const userId = req.user._id;

    if (!currentPasscode) {
      console.log("❌ [PATCH /edit-passcode] Current passcode missing");
      return res.status(400).json({
        success: false,
        message: "Current passcode is required to make changes",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      console.log("❌ [PATCH /edit-passcode] User not found");
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!user.passcode) {
      console.log("❌ [PATCH /edit-passcode] No passcode set on user account");
      return res.status(400).json({
        success: false,
        message: "No passcode currently set. Please use /set-passcode first.",
      });
    }

    const isMatch = await bcrypt.compare(currentPasscode, user.passcode);
    if (!isMatch) {
      console.log(
        "❌ [PATCH /edit-passcode] Incorrect current passcode entered"
      );
      return res
        .status(400)
        .json({ success: false, message: "Incorrect current passcode" });
    }

    if (newPasscode) {
      if (newPasscode.length < 4 || newPasscode.length > 6) {
        console.log("❌ [PATCH /edit-passcode] New passcode length invalid");
        return res.status(400).json({
          success: false,
          message: "New passcode must be between 4 and 6 digits",
        });
      }
      user.passcode = await bcrypt.hash(newPasscode, 10);
      console.log("✅ [PATCH /edit-passcode] New passcode hashed and staged.");
    }

    if (removeSecurityQuestion) {
      user.securityQuestion = null;
      user.securityAnswer = null;
      user.backupAnswer = null;
      console.log("🗑️ [PATCH /edit-passcode] Security question removed.");
    } else if (newBackupQuestion !== undefined) {
      if (newBackupQuestion === "" || !newBackupAnswer) {
        user.securityQuestion = null;
        user.securityAnswer = null;
        user.backupAnswer = null;
        console.log(
          "🗑️ [PATCH /edit-passcode] Security question cleared due to empty input."
        );
      } else {
        const formattedAnswer = newBackupAnswer.trim().toLowerCase();
        user.securityQuestion = newBackupQuestion.trim();
        user.securityAnswer = formattedAnswer;
        user.backupAnswer = formattedAnswer;
        console.log(
          "✅ [PATCH /edit-passcode] New security question/answer staged."
        );
      }
    }

    await user.save();
    console.log(
      "💾 [PATCH /edit-passcode] Changes successfully saved for user:",
      userId
    );

    return res.status(200).json({
      success: true,
      message: "Passcode and security details updated successfully!",
    });
  } catch (error) {
    console.error("🔥 [PATCH /edit-passcode] Error:", error);
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
  console.log(
    "🔐 [POST /verify-passcode] Verification request received for user ID:",
    req.user._id
  );

  try {
    const { passcode, securityAnswer } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      console.log("❌ [POST /verify-passcode] User not found");
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const isExempt = user.email === "ibenemeikenna2021@gmail.com";

    // Skip lockout expiration checks and enforcement for the exempt user
    if (
      !isExempt &&
      user.passcodeLockedUntil &&
      new Date() < new Date(user.passcodeLockedUntil)
    ) {
      const remainingMinutes = Math.ceil(
        (new Date(user.passcodeLockedUntil) - new Date()) / (1000 * 60)
      );
      console.log(
        `🔒 [POST /verify-passcode] Account is locked. ${remainingMinutes} mins remaining.`
      );
      return res.status(429).json({
        success: false,
        locked: true,
        message: `Account is locked due to multiple failed attempts. Try again in ${remainingMinutes} minutes.`,
      });
    }

    if (user.requiresSecurityQuestion || securityAnswer) {
      console.log(
        "🛡️ [POST /verify-passcode] Processing Security Question verification mode."
      );

      if (
        !user.securityQuestion ||
        (!user.securityAnswer && !user.backupAnswer)
      ) {
        console.log(
          "❌ [POST /verify-passcode] No security question configured on account."
        );
        return res.status(400).json({
          success: false,
          message: "No security question configured for recovery.",
        });
      }

      if (!securityAnswer) {
        console.log(
          "⚠️ [POST /verify-passcode] Security answer missing from request. Prompting user."
        );
        return res.status(400).json({
          success: false,
          requiresSecurityQuestion: true,
          securityQuestion: user.securityQuestion,
          message: "Please answer your security question.",
        });
      }

      const formattedInput = securityAnswer.trim().toLowerCase();
      const storedSecurityAns = user.securityAnswer
        ? user.securityAnswer.trim().toLowerCase()
        : "";
      const storedBackupAns = user.backupAnswer
        ? user.backupAnswer.trim().toLowerCase()
        : "";

      const isAnswerMatch =
        (storedSecurityAns && formattedInput === storedSecurityAns) ||
        (storedBackupAns && formattedInput === storedBackupAns);

      console.log(
        `🔎 [POST /verify-passcode] Security Answer Match Result: ${isAnswerMatch}`
      );

      if (!isAnswerMatch) {
        if (!isExempt) {
          const lockoutTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
          user.passcodeLockedUntil = lockoutTime;
          user.passcodeAttempts = 0;
          user.requiresSecurityQuestion = false;
          user.isOnline = false;
          user.socketId = null;
          await user.save();
          console.log(
            "🚫 [POST /verify-passcode] Incorrect security answer. Account locked for 3 hours."
          );

          return res.status(403).json({
            success: true,
            locked: true,
            message:
              "Incorrect security answer. Account has been locked for 3 hours.",
          });
        } else {
          console.log(
            "🛡️ [EXEMPTION] Incorrect security answer for ibenemeikenna2021@gmail.com - Account lock bypassed!"
          );
          return res.status(400).json({
            success: false,
            message: "Incorrect security answer. Please try again.",
          });
        }
      }

      user.passcodeAttempts = 0;
      user.requiresSecurityQuestion = false;
      user.passcodeLockedUntil = null;
      await user.save();
      console.log(
        "🎉 [POST /verify-passcode] Security answer verified successfully!"
      );

      return res.status(200).json({
        success: true,
        message: "Passcode verified successfully via security question!",
      });
    }

    if (!passcode) {
      console.log("❌ [POST /verify-passcode] Passcode missing from request");
      return res
        .status(400)
        .json({ success: false, message: "Passcode is required" });
    }

    if (!user.passcode) {
      console.log("❌ [POST /verify-passcode] No passcode set on user account");
      return res
        .status(400)
        .json({ success: false, message: "No passcode set for this user." });
    }

    const isMatch = await bcrypt.compare(passcode, user.passcode);
    console.log(`🔎 [POST /verify-passcode] Passcode Match Result: ${isMatch}`);

    if (!isMatch) {
      user.passcodeAttempts = (user.passcodeAttempts || 0) + 1;
      console.log(
        `⚠️ [POST /verify-passcode] Incorrect passcode attempt count: ${user.passcodeAttempts}`
      );

      if (!isExempt && user.passcodeAttempts >= 3) {
        if (!user.securityQuestion) {
          console.log(
            "⚠️ [POST /verify-passcode] 3 failed attempts, but no security question set."
          );
          return res.status(401).json({
            success: false,
            message: "3 incorrect attempts. Please try again later.",
          });
        }

        user.requiresSecurityQuestion = true;
        await user.save();
        console.log(
          "🚨 [POST /verify-passcode] 3 failed attempts reached. Triggering security question recovery."
        );

        return res.status(401).json({
          success: false,
          requiresSecurityQuestion: true,
          securityQuestion: user.securityQuestion,
          message:
            "3 incorrect attempts. Please answer your security question to continue.",
        });
      } else if (isExempt && user.passcodeAttempts >= 3) {
        console.log(
          "🛡️ [EXEMPTION] 3+ failed passcode attempts reached for ibenemeikenna2021@gmail.com - Forcing security question prompt without locking out!"
        );
        user.requiresSecurityQuestion = true;
        await user.save();
        return res.status(401).json({
          success: false,
          requiresSecurityQuestion: true,
          securityQuestion:
            user.securityQuestion || "What is your security question?",
          message: "Incorrect passcode. Please answer your security question.",
        });
      }

      await user.save();
      const remainingAttempts = 3 - user.passcodeAttempts;
      return res.status(400).json({
        success: false,
        message: `Incorrect passcode. You have ${remainingAttempts} attempt(s) remaining.`,
      });
    }

    user.passcodeAttempts = 0;
    user.requiresSecurityQuestion = false;
    user.passcodeLockedUntil = null;
    await user.save();
    console.log("🎉 [POST /verify-passcode] Passcode verified successfully!");

    return res.status(200).json({
      success: true,
      message: "Passcode verified successfully!",
    });
  } catch (error) {
    console.error("🔥 [POST /verify-passcode] Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

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
