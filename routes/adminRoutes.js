const express = require("express");
const router = express.Router();
const Admin = require("../models/Admin");
const AdminOtp = require("../models/AdminOtp");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendEmail");

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
  console.log("--- [START] SEND-OTP PROTOCOL (AUTO-PROVISIONING) ---");
  try {
    const { email } = req.body;

    if (!email) {
      console.warn("❌ Request rejected: Missing Email");
      return res.status(400).json({ message: "Email is required" });
    }

    const cleanEmail = email.toLowerCase().trim();
    console.log(`📡 Uplink request received for: ${cleanEmail}`);

    // 1. CHECK/CREATE: Does this admin exist?
    let admin = await Admin.findOne({ email: cleanEmail });

    if (!admin) {
      console.log(
        `✨ No admin found. Provisioning new account for: ${cleanEmail}`
      );
      res.status(500).json({ message: " No admin found" });
      //   // Creating a new admin if they don't exist
      //   admin = await Admin.create({
      //     email: cleanEmail,
      //     fullName: cleanEmail.split("@")[0], // Default name from email prefix
      //     phoneNumber: `PENDING_${Date.now()}`, // Temporary placeholder to satisfy schema
      //     role: "moderator", // Default role
      //     isActive: true,
      //   });

      //   console.log(`✅ New Admin record created: ${admin._id}`);
    }

    // 2. Generate 6-digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Update OTP Collection (tracked by email)
    await AdminOtp.findOneAndUpdate(
      { email: cleanEmail },
      { otp: generatedOtp, createdAt: Date.now() },
      { new: true, upsert: true }
    );
    console.log(`💾 OTP Database updated for ${cleanEmail}.`, generatedOtp);

    // 4. DISPATCH STYLED EMAIL
    await sendEmail(
      cleanEmail,
      "Your Admin Access Code",
      `Your verification code is ${generatedOtp}`,
      "verification"
    );

    console.log(`--- [SUCCESS] OTP SENT TO ${cleanEmail} ---`);
    res.status(200).json({
      message: "OTP sent successfully",
      sentTo: cleanEmail,
      isNewUser: !admin.createdAt, // Simple flag for the frontend if needed
    });
  } catch (error) {
    console.error(`🚨 CRITICAL ERROR [SEND-OTP]: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});
// STEP 2: Verify OTP and Login/Register
router.post("/verify-otp", async (req, res) => {
  console.log("--- [START] VERIFICATION PROTOCOL (EMAIL) ---");
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      console.warn("❌ Verification rejected: Missing Credentials");
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const cleanEmail = email.toLowerCase().trim();
    console.log(`🔍 Attempting verification for: ${cleanEmail} | Key: ${otp}`);

    // 1. Validate OTP from the temporary collection
    // Note: We are now searching by the 'email' field in AdminOtp
    const otpRecord = await AdminOtp.findOne({ email: cleanEmail, otp });

    if (!otpRecord) {
      console.warn(
        `⚠️ Authentication Failed: Invalid or expired key for ${cleanEmail}`
      );
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }
    console.log("✅ OTP Validated.");

    // 2. Find or Auto-Create Admin
    let admin = await Admin.findOne({ email: cleanEmail });

    if (!admin) {
      console.log(
        `👤 New Admin detected. Initializing record for ${cleanEmail}...`
      );
      admin = new Admin({
        email: cleanEmail,
        fullName: cleanEmail.split("@")[0], // Default name from email prefix
        phoneNumber: `PENDING_${Date.now()}`, // Temporary placeholder to satisfy schema
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
        email: admin.email,
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
