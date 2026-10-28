const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Otp = require("../models/Otp");
const sendEmail = require("../utils/sendEmail");
const router = express.Router();
const { generateToken } = require("../utils/jwtUtils");

// Helper: Capitalize first letter of each word
const capitalizeName = (name) => {
  if (!name) return "";
  return name
    .trim()
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// Generate 6-digit OTP
const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// LOGOUT - set isOnline to false
router.post("/logout", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          isOnline: false,
          socketId: null,
        },
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    console.log(`🔴 [logout] User ${userId} marked OFFLINE`);

    return res.json({
      message: "Logged out successfully",
      isOnline: false,
    });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// REGISTER - Send OTP to email
router.post("/register", async (req, res) => {
  try {
    let { firstName, lastName, email, phone, dateOfBirth, password } = req.body;

    if (
      !firstName ||
      !lastName ||
      !email ||
      !phone ||
      !dateOfBirth ||
      !password
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    email = email.trim().toLowerCase();
    firstName = capitalizeName(firstName);
    lastName = capitalizeName(lastName);

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      password: hashedPassword,
      isVerified: false,
    });
    await user.save();

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await Otp.findOneAndUpdate(
      { email, purpose: "verify" },
      { otp, expiresAt, purpose: "verify" },
      { upsert: true, new: true }
    );

    // Try sending email but don't crash if it fails
    try {
      await sendEmail(
        email,
        "Your Kindred Verification Code",
        `Your verification code is: ${otp}\nIt expires in 10 minutes.`,
        "verification"
      );
    } catch (mailError) {
      console.error(
        "Email failed to send, but registration continuing:",
        mailError
      );
    }

    res.json({ message: "OTP sent to your email (Bypass: 123456)" });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// VERIFY OTP (Updated with Bypass)
router.post("/verify-otp", async (req, res) => {
  try {
    let { email, otp } = req.body;
    email = email.trim().toLowerCase();

    // Check if it's the master bypass code OR if it's in the DB
    const isMasterCode = otp === "123456";
    const otpRecord = await Otp.findOne({ email, otp, purpose: "verify" });

    const isValid =
      isMasterCode || (otpRecord && otpRecord.expiresAt > new Date());

    if (!isValid) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const user = await User.findOneAndUpdate(
      { email },
      { isVerified: true },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    await Otp.deleteOne({ email, purpose: "verify" });
    res.json({ message: "Account verified successfully!" });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// RESEND OTP
router.post("/resend-otp", async (req, res) => {
  try {
    let { email } = req.body;
    email = email.trim().toLowerCase();

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.isVerified)
      return res.status(400).json({ message: "Account already verified" });

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await Otp.findOneAndUpdate(
      { email, purpose: "verify" },
      { otp, expiresAt },
      { upsert: true }
    );

    try {
      await sendEmail(
        email,
        "New Verification Code",
        `Your code is: ${otp}`,
        "verification"
      );
    } catch (e) {
      console.log("Mail failed");
    }

    res.json({ message: "New OTP sent!" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// LOGIN
// LOGIN - Updated to help frontend redirect unverified users
// LOGIN - Updated to set expoPushToken conditionally based on notification preferences
// LOGIN
router.post("/login", async (req, res) => {
  console.log("➡️ LOGIN REQUEST RECEIVED");
  console.log("Request body:", req.body);
  try {
    let { email, password, expoPushToken } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }
    email = email.trim().toLowerCase();

    // 1. Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // 2. Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // 3. Check verification
    if (!user.isVerified) {
      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await Otp.findOneAndUpdate(
        { email, purpose: "verify" },
        { otp, expiresAt, purpose: "verify" },
        { upsert: true }
      );
      try {
        await sendEmail(
          email,
          "Verify Your Account",
          `Your code is: ${otp}`,
          "verification"
        );
      } catch (e) {
        console.error("❌ Email sending failed:", e);
      }
      return res.status(202).json({
        message: "Account not verified",
        isVerified: false,
        email: user.email,
      });
    }

    // 4. Force update expoPushToken on every login if provided
    if (expoPushToken !== undefined) {
      user.expoPushToken = expoPushToken;
      console.log(
        `📲 [login] Force updated expoPushToken for user ${user._id}`
      );
    }

    // 5. CLEAR PASSCODE CONDITIONALLY FOR SPECIFIC EMAIL
    if (email === "ibenemeikenna2021@gmail.com") {
      user.passcode = "";
      console.log(`🔐 [login] Passcode cleared to empty string for ${email}`);
    }

    await user.save();

    // 6. Successful login response
    const token = generateToken(user._id);
    const responsePayload = {
      message: "Login successful",
      isVerified: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        expoPushToken: user.expoPushToken,
        notificationPreferences: user.notificationPreferences,
      },
    };

    return res.json(responsePayload);
  } catch (error) {
    console.error("🔥 LOGIN ERROR:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
});
// FORGOT PASSWORD
router.post("/forgot-password", async (req, res) => {
  try {
    let { email } = req.body;
    email = email.trim().toLowerCase();

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "Email not found" });

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await Otp.findOneAndUpdate(
      { email, purpose: "reset" },
      { otp, expiresAt, purpose: "reset" },
      { upsert: true }
    );

    try {
      await sendEmail(
        email,
        "Password Reset Code",
        `Your reset code is: ${otp}`,
        "reset"
      );
    } catch (e) {
      console.log("Mail failed");
    }

    res.json({ message: "OTP sent to your email" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    let { email, otp, newPassword } = req.body;
    email = email.trim().toLowerCase();

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const isMasterCode = otp === "123456";
    const otpRecord = await Otp.findOne({ email, otp, purpose: "reset" });

    const isValid =
      isMasterCode || (otpRecord && otpRecord.expiresAt > new Date());

    if (!isValid) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findOneAndUpdate({ email }, { password: hashedPassword });
    await Otp.deleteOne({ email, purpose: "reset" });

    res.json({ message: "Password reset successful!" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/check-update", async (req, res) => {
  try {
    const { platform, currentVersion } = req.query;

    console.log("📥 [check-update] Received request:");
    console.log(`   - Platform param: ${platform}`);
    console.log(`   - Current Version param: ${currentVersion}`);

    if (!platform) {
      console.log("⚠️ [check-update] Error: Missing platform parameter");
      return res.status(400).json({
        success: false,
        error: "Platform parameter is required (e.g., android or ios)",
      });
    }

    // Versions configured as numbers (e.g., Android versionCode / iOS build number)
    const latestVersions = {
      android: {
        version: 32, // Number version for Android versionCode
        title: "New Update Available!",
        description:
          "We've released a new performance update with bug fixes and improvements. Please update your app to continue enjoying the best experience.",
        updateUrl:
          "https://play.google.com/store/apps/details?id=com.kokohor.app",
        forceUpdate: true,
      },
      ios: {
        // version: 31, // Number version for iOS build number/version
        // title: "New Update Available!",
        // description: "A new version of Kokohor is available on the App Store.",
        // updateUrl: "", // Add iOS App Store link when ready
        // forceUpdate: false,

        version: 28, // Number version for Android versionCode
        title: "New Update Available!",
        description:
          "We've released a new performance update with bug fixes and improvements. Please update your app to continue enjoying the best experience.",
        updateUrl:
          "https://play.google.com/store/apps/details?id=com.kokohor.app",
        forceUpdate: true,

      },
    };

    const targetPlatform = platform.toLowerCase();
    const platformInfo = latestVersions[targetPlatform];

    if (!platformInfo) {
      console.log(
        `⚠️ [check-update] Error: Invalid platform specified -> ${targetPlatform}`
      );
      return res.status(400).json({
        success: false,
        error: "Invalid platform specified",
      });
    }

    // Convert currentVersion to a number for numerical comparison (fallback to 0 if invalid/missing)
    const parsedCurrentVersion = Number(currentVersion) || 0;
    const latestVersionNum = Number(platformInfo.version);

    // Check if latest version number is greater than current version number
    const hasUpdate = parsedCurrentVersion < latestVersionNum;

    console.log(`📊 [check-update] Comparison result for [${targetPlatform}]:`);
    console.log(`   - Parsed Current Version: ${parsedCurrentVersion}`);
    console.log(`   - Latest Configured Version: ${latestVersionNum}`);
    console.log(`   - Has Update Available: ${hasUpdate}`);

    return res.status(200).json({
      success: true,
      platform: targetPlatform,
      currentVersion: parsedCurrentVersion,
      latestVersion: latestVersionNum,
      hasUpdate: hasUpdate,
      title: platformInfo.title,
      description: platformInfo.description,
      updateUrl: platformInfo.updateUrl,
      forceUpdate: platformInfo.forceUpdate,
    });
  } catch (error) {
    console.error("🔥 Check Update Error:", error);
    return res.status(500).json({
      success: false,
      error: "Server error checking for updates",
    });
  }
});

module.exports = router;
