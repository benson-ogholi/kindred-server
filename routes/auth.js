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
      console.log(`📲 [login] Force updated expoPushToken for user ${user._id}`);
    }

    await user.save();

    // 5. Successful login response
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

module.exports = router;
