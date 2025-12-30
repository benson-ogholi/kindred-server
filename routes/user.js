const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { protect } = require("../middlewares/authMiddleware");

router.patch("/profile", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 1. Basic Information Update
    const { firstName, lastName, phone, dateOfBirth, email } = req.body;

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;
    if (dateOfBirth) user.dateOfBirth = dateOfBirth;

    // Email update check (optional: add verification logic if changed)
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ message: "Email already in use" });
      }
      user.email = email;
    }
    if (req.body.expoPushToken !== undefined) {
      user.expoPushToken = req.body.expoPushToken;
    }

    if (req.body.notificationPreferences) {
      const { push, email: emailPref, sms } = req.body.notificationPreferences;

      if (push && typeof push.enabled === "boolean") {
        user.notificationPreferences.push.enabled = push.enabled;
      }
      if (emailPref && typeof emailPref.enabled === "boolean") {
        user.notificationPreferences.email.enabled = emailPref.enabled;
      }
      if (sms && typeof sms.enabled === "boolean") {
        user.notificationPreferences.sms.enabled = sms.enabled;
      }
    }

    const updatedUser = await user.save();

    // Remove password from response
    const userResponse = updatedUser.toObject();
    delete userResponse.password;

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: userResponse,
    });
  } catch (error) {
    console.error("🔥 Profile Update Error:", error);
    res.status(500).json({ message: "Server error during profile update" });
  }
});



module.exports = router;
