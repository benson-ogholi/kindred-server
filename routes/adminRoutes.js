const express = require("express");
const router = express.Router();
const Admin = require("../models/Admin");
const AdminOtp = require("../models/AdminOtp");
const jwt = require("jsonwebtoken");

// STEP 1: Send/Resend OTP using only Phone Number
router.post("/send-otps", async (req, res) => {
  console.log("--- [START] SEND-OTP PROTOCOL ---");
  try {
    const { phoneNumber } = req.body;
    console.log(`📡 Uplink request received for: ${phoneNumber}`);

    if (!phoneNumber) {
      console.warn("❌ Request rejected: Missing Phone Number");
      return res.status(400).json({ message: "Phone number is required" });
    }

    // Generate 6-digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`🔐 Generated OTP: ${generatedOtp}`);

    // Store/Update OTP and reset the 30-minute TTL timer
    const updatedOtp = await AdminOtp.findOneAndUpdate(
      { phoneNumber },
      { otp: generatedOtp, createdAt: Date.now() },
      { upsert: true, new: true }
    );
    console.log(`💾 OTP Database updated for ${phoneNumber}. TTL reset.`);

    // LOG: In production, replace with your SMS gateway (Twilio, Termii, etc.)
    console.log(`[SECURITY] OTP for ${phoneNumber}: ${generatedOtp}`);

    console.log("--- [SUCCESS] OTP DISPATCHED ---");
    res.status(200).json({ message: "OTP sent successfully" });
  } catch (error) {
    console.error(`🚨 CRITICAL ERROR [SEND-OTP]: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});
router.post("/send-otp", async (req, res) => {
  console.log("--- [START] SEND-OTP PROTOCOL ---");
  try {
    const { phoneNumber } = req.body;
    console.log(`📡 Uplink request received for: ${phoneNumber}`);

    if (!phoneNumber) {
      console.warn("❌ Request rejected: Missing Phone Number");
      return res.status(400).json({ message: "Phone number is required" });
    }

    // 1. FIRST CHECK: Does this admin exist?
    const existingAdmin = await Admin.findOne({ phoneNumber });

    if (!existingAdmin) {
      console.warn(
        `🚫 Access Denied: ${phoneNumber} is not registered as an Admin.`
      );
      return res
        .status(404)
        .json({ message: "Admin record not found. Access denied." });
    }

    // 2. Generate 6-digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`🔐 Generated OTP: ${generatedOtp}`);

    // 3. Update OTP Collection
    await AdminOtp.findOneAndUpdate(
      { phoneNumber },
      { otp: generatedOtp, createdAt: Date.now() },
      { new: true, upsert: true }
    );
    console.log(`💾 OTP Database updated for ${phoneNumber}.`);

    // 4. DISPATCH STYLED EMAIL
    // We use the email from the Admin record we found in Step 1
    if (existingAdmin.email) {
      await sendEmail(
        existingAdmin.email,
        "Your Admin Access Code",
        `Your verification code is ${generatedOtp}`,
        "verification" // This triggers the Kindred Gold template
      );
    } else {
      console.warn(
        `⚠️ Admin found but has no email address on file for ${phoneNumber}`
      );
    }

    console.log("--- [SUCCESS] OTP DISPATCHED VIA EMAIL ---");
    res.status(200).json({
      message: "OTP sent successfully",
      sentTo: existingAdmin.email ? "email" : "console_only",
    });
  } catch (error) {
    console.error(`🚨 CRITICAL ERROR [SEND-OTP]: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});
// STEP 2: Verify OTP and Login/Register
router.post("/verify-otp", async (req, res) => {
  console.log("--- [START] VERIFICATION PROTOCOL ---");
  try {
    const { phoneNumber, otp } = req.body;
    console.log(`🔍 Attempting verification for: ${phoneNumber} | Key: ${otp}`);

    if (!phoneNumber || !otp) {
      console.warn("❌ Verification rejected: Missing Credentials");
      return res.status(400).json({ message: "Phone and OTP are required" });
    }

    // 1. Validate OTP from the temporary collection
    const otpRecord = await AdminOtp.findOne({ phoneNumber, otp });

    if (!otpRecord) {
      console.warn(
        `⚠️ Authentication Failed: Invalid or expired key for ${phoneNumber}`
      );
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }
    console.log("✅ OTP Validated.");

    // 2. Find or Auto-Create Admin (Registration by Phone only)
    let admin = await Admin.findOne({ phoneNumber });

    if (!admin) {
      console.log(
        `👤 New Admin detected. Initializing record for ${phoneNumber}...`
      );
      admin = new Admin({
        phoneNumber,
        fullName: "New Admin",
        role: "moderator",
      });
      await admin.save();
      console.log("✨ Skeleton Admin record created.");
    } else {
      console.log(`🤝 Returning Admin: ${admin.fullName} (${admin.role})`);
    }

    // 3. Cleanup: Wipe OTP record immediately
    await AdminOtp.deleteOne({ _id: otpRecord._id });
    console.log("🧹 One-time key purged from database.");

    // 4. Issue Access Token
    console.log("🎟️ Signing Access Token...");
    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log(`🔓 Access Granted. Session authorized for 7 days.`);
    console.log("--- [FINISH] AUTHENTICATION COMPLETE ---");

    res.status(200).json({
      message: "Authentication successful",
      token,
      admin: {
        id: admin._id,
        phoneNumber: admin.phoneNumber,
        fullName: admin.fullName,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error(`🚨 CRITICAL ERROR [VERIFY-OTP]: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
