// routes/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Otp = require("../models/Otp");
const sendEmail = require("../utils/sendEmail");

const router = express.Router();
const jwt = require("jsonwebtoken");
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

    // Normalize email to lowercase
    email = email.trim().toLowerCase();

    // Capitalize names
    firstName = capitalizeName(firstName);
    lastName = capitalizeName(lastName);

    // Check if user already exists (case-insensitive)
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      firstName,
      lastName,
      email, // stored in lowercase
      phone,
      dateOfBirth,
      password: hashedPassword,
      isVerified: false,
    });
    await user.save();

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await Otp.findOneAndUpdate(
      { email, purpose: "verify" },
      { otp, expiresAt, purpose: "verify" },
      { upsert: true, new: true }
    );

    await sendEmail(
      email,
      "Your Kindred Verification Code",
      `Your verification code is: ${otp}\nIt expires in 10 minutes.`,
      "verification"
    );

    console.log(`New user registered: ${firstName} ${lastName} (${email})`);

    res.json({ message: "OTP sent to your email" });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// VERIFY OTP
router.post("/verify-otp", async (req, res) => {
  try {
    let { email, otp } = req.body;

    email = email.trim().toLowerCase(); // Normalize email

    const otpRecord = await Otp.findOne({
      email,
      otp,
      purpose: "verify",
    });

    if (!otpRecord || otpRecord.expiresAt < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const user = await User.findOneAndUpdate(
      { email },
      { isVerified: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await Otp.deleteOne({ email, purpose: "verify" });

    console.log(`Email verified: ${email}`);

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

    if (user.isVerified) {
      return res.status(400).json({ message: "Account already verified" });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await Otp.findOneAndUpdate(
      { email, purpose: "verify" },
      { otp, expiresAt },
      { upsert: true }
    );

    await sendEmail(
      email,
      "New Kindred Verification Code",
      `Your new code is: ${otp}\nValid for 10 minutes.`,
      "verification"
    );

    console.log(`OTP resent to: ${email}`);

    res.json({ message: "New OTP sent!" });
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    let { email, password } = req.body;
    email = email.trim().toLowerCase();

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    if (!user.isVerified) {
      return res
        .status(400)
        .json({ message: "Please verify your email first" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    // Generate token using utils
    const token = generateToken(user._id);

    console.log(`Login successful: ${email}`);

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// FORGOT PASSWORD - Send OTP
router.post("/forgot-password", async (req, res) => {
  try {
    let { email } = req.body;

    email = email.trim().toLowerCase();

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "Email not found" });

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await Otp.findOneAndUpdate(
      { email, purpose: "reset" },
      { otp, expiresAt, purpose: "reset" },
      { upsert: true }
    );

    await sendEmail(
      email,
      "Kindred Password Reset Code",
      `Your reset code is: ${otp}\nValid for 15 minutes.`,
      "reset"
    );

    console.log(`Password reset OTP sent to: ${email}`);

    res.json({ message: "OTP sent to your email" });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// RESET PASSWORD WITH OTP
router.post("/reset-password", async (req, res) => {
  try {
    let { email, otp, newPassword } = req.body;

    email = email.trim().toLowerCase();

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const otpRecord = await Otp.findOne({
      email,
      otp,
      purpose: "reset",
    });

    if (!otpRecord || otpRecord.expiresAt < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await User.findOneAndUpdate({ email }, { password: hashedPassword });

    await Otp.deleteOne({ email, purpose: "reset" });

    console.log(`Password reset successful for: ${email}`);

    res.json({ message: "Password reset successful!" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
