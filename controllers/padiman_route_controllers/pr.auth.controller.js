const PR_Otp = require("../../models/padiman_route_models/PR_Otp");
const Padiman_Route_User = require("../../models/padiman_route_models/Padiman_Route_User");
const sendPrEmail = require("../../utils/pr/sendEmail");
const jwt = require("jsonwebtoken");

// Temporary in-memory OTP storage
const otpStore = new Map();
// Helper to generate token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET_PR, {
    expiresIn: "30d", // Token valid for 30 days
  });
};

// 1. Registration
exports.registerUser = async (req, res) => {
  try {
    const { fullName, phone, email, password, referralCode } = req.body;

    // Create the user
    const newUser = await Padiman_Route_User.create({
      fullName,
      phone,
      email,
      password,
      referralCode,
    });

    // Generate numeric OTP string
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Clear old OTPs for this email and save the new one to the DB
    await PR_Otp.deleteMany({ email });
    await PR_Otp.create({ email, otp });

    console.log(
      `[AUTH] Registration successful for: ${email}. Triggering Welcome Email...`
    );

    await sendPrEmail(
      email,
      "Welcome to Padiman Route!",
      `Hello ${fullName}, welcome to Padiman Route! Your verification code is ${otp}.`
    );

    res.status(201).json({
      success: true,
      message: "Account created. Please verify your email.",
    });
  } catch (error) {
    console.error(`[ERROR] Registration failed: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};



exports.loginUser = async (req, res) => {
  try {
    const { email, password, expoPushToken } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await Padiman_Route_User.findOne({ email: normalizedEmail });

    // 1. Validate credentials
    if (!user || !(await user.comparePassword(password))) {
      console.warn(`[AUTH] Failed login attempt: ${normalizedEmail}`);
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    // 2. Check if user is verified
    if (!user.isVerified) {
      console.warn(
        `[AUTH] Login attempted by unverified user: ${normalizedEmail}`
      );

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      await PR_Otp.deleteMany({ email: normalizedEmail });
      await PR_Otp.create({ email: normalizedEmail, otp });
      await sendPrEmail(
        normalizedEmail,
        "Verify your account",
        `Your new verification code is ${otp}.`
      );

      return res.status(403).json({
        success: false,
        message: "Account not verified. A new OTP has been sent to your email.",
        needsVerification: true,
      });
    }

    // 3. Update Expo Push Token if provided in request
    if (expoPushToken) {
      user.expoPushToken = expoPushToken;
      await user.save();
    }

    // 4. Proceed with successful login
    console.log(
      `[AUTH] User login: ${normalizedEmail}. Sending notification...`
    );
    await sendPrEmail(
      normalizedEmail,
      "New Login Detected",
      `Hi ${user.fullName}, we detected a new login to your Padiman Route account.`
    );

    const token = generateToken(user._id);
    console.log(`[AUTH] User login success: ${normalizedEmail}.`);

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        expoPushToken: user.expoPushToken,
      },
    });
  } catch (error) {
    console.error(`[ERROR] Login failure: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};



exports.loginUsers = async (req, res) => {
  try {
    const { email, password, expoPushToken } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await Padiman_Route_User.findOne({ email: normalizedEmail });

    // 1. Validate credentials
    if (!user || !(await user.comparePassword(password))) {
      console.warn(`[AUTH] Failed login attempt: ${normalizedEmail}`);
      return res
        .status(401) // Corrected from 500 to 401 Unauthorized
        .json({ success: false, message: "Invalid credentials" });
    }

    // 2. Check if user is verified
    if (!user.isVerified) {
      console.warn(
        `[AUTH] Login attempted by unverified user: ${normalizedEmail}`
      );

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      await PR_Otp.deleteMany({ email: normalizedEmail });
      await PR_Otp.create({ email: normalizedEmail, otp });
      await sendPrEmail(
        normalizedEmail,
        "Verify your account",
        `Your new verification code is ${otp}.`
      );

      return res.status(403).json({
        success: false,
        message: "Account not verified. A new OTP has been sent to your email.",
        needsVerification: true,
      });
    }

    // 3. Update Expo Push Token if provided in request
    if (expoPushToken) {
      user.expoPushToken = expoPushToken;
      await user.save();
    }

    // 4. Proceed with successful login
    console.log(
      `[AUTH] User login: ${normalizedEmail}. Sending notification...`
    );
    await sendPrEmail(
      normalizedEmail,
      "New Login Detected",
      `Hi ${user.fullName}, we detected a new login to your Padiman Route account.`
    );

    const token = generateToken(user._id);
    console.log(`[AUTH] User login success: ${normalizedEmail}.`);

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        expoPushToken: user.expoPushToken,
      },
    });
  } catch (error) {
    console.error(`[ERROR] Login failure: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.sendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    // 1. Validate that the email exists in the request body
    if (!email || typeof email !== "string" || !email.includes("@")) {
      console.warn(
        `[AUTH] Send OTP rejected: Invalid or missing email address.`
      );
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 2. Only send OTPs to users who actually exist
    const user = await Padiman_Route_User.findOne({ email: normalizedEmail });
    if (!user) {
      console.warn(
        `[AUTH] Send OTP rejected: No account found for ${normalizedEmail}`
      );
      return res.status(404).json({
        success: false,
        message: "No account found with that email address.",
      });
    }

    // 3. Generate numeric OTP string
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 4. Clear any existing OTPs for this email and create the new one
    await PR_Otp.deleteMany({ email: normalizedEmail });
    await PR_Otp.create({ email: normalizedEmail, otp });

    console.log(`[AUTH] OTP generated for ${normalizedEmail}. Sending email...`);

    // 5. Send the verification email
    await sendPrEmail(
      normalizedEmail,
      "Verification Code",
      `Your verification code is ${otp}`
    );

    return res
      .status(200)
      .json({ success: true, message: "OTP sent successfully." });
  } catch (error) {
    console.error(`[ERROR] Send OTP failure: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "An error occurred while processing your request.",
    });
  }
};

// 4. Verify OTP (Updated to use DB)
// 4. Verify OTP (Updated)
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // 1. Check if the OTP is valid
    const otpDoc = await PR_Otp.findOne({ email, otp });

    if (!otpDoc) {
      console.warn(`[AUTH] Failed verification for ${email}`);
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });
    }

    // 2. Mark the user as verified in the User collection
    const updatedUser = await Padiman_Route_User.findOneAndUpdate(
      { email },
      { isVerified: true },
      { new: true }
    );

    if (!updatedUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // 3. Delete the OTP document after successful verification
    await PR_Otp.deleteOne({ _id: otpDoc._id });

    const token = generateToken(updatedUser._id);

    console.log(`[AUTH] Email verified and status updated for: ${email}`);

    res.status(200).json({
      success: true,
      token,
      message: "OTP verified successfully",
      user: { email: updatedUser.email, isVerified: updatedUser.isVerified },
    });
  } catch (error) {
    console.error(`[ERROR] Verification failed: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
// 5. Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const { email, newPassword, confirmPassword } = req.body;
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const user = await Padiman_Route_User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.password = newPassword;
    await user.save();

    console.log(`[AUTH] Password reset completed for: ${email}`);
    res
      .status(200)
      .json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error(`[ERROR] Reset failed: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};
