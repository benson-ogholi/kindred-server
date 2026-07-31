const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const PRUtility = require("../../models/padiman_utility_models/PRUtility");
const OTP = require("../../models/padiman_utility_models/PRUtility_OTP");
const sendPruEmail = require("../../utils/pru/sendEmail");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");

// Helper to generate 6-digit OTP
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// Register
const registerPRUtility = async (req, res) => {
  try {
    const {
      fullName,
      username,
      phone,
      email,
      password,
      confirmPassword,
      countryCode,
      dialCode,
      isWorkman = false,
    } = req.body;

    if (
      !fullName ||
      !username ||
      !phone ||
      !email ||
      !password ||
      !confirmPassword
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const existingUser = await PRUtility.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: username.toLowerCase() },
      ],
    });

    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await PRUtility.create({
      fullName,
      username: username.toLowerCase(),
      phone,
      email: email.toLowerCase(),
      password: hashedPassword,
      countryCode: countryCode || "NG",
      dialCode: dialCode || "+234",
      isWorkman,
      isVerified: false,
    });

    const otpCode = generateOTP();

    await OTP.create({
      email: newUser.email,
      otp: otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      purpose: "signup",
    });

    await sendPruEmail({
      to: newUser.email,
      subject: "Your Padiman Verification Code",
      html: `
        <h2>Welcome to Padiman!</h2>
        <p>Your verification code is: <strong>${otpCode}</strong></p>
        <p>This code will expire in 10 minutes.</p>
      `,
    });

    res.status(201).json({
      message: "Account created. OTP sent to your email.",
      user: {
        id: newUser._id,
        fullName: newUser.fullName,
        username: newUser.username,
        email: newUser.email,
        isWorkman: newUser.isWorkman,
        isVerified: false,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Resend OTP
const resendOTP = async (req, res) => {
  try {
    const { email, purpose = "signup" } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await PRUtility.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await OTP.deleteMany({ email: email.toLowerCase(), purpose });

    const otpCode = generateOTP();

    await OTP.create({
      email: email.toLowerCase(),
      otp: otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      purpose,
    });

    await sendPruEmail({
      to: email,
      subject:
        purpose === "signup"
          ? "Your Padiman Verification Code"
          : "Password Reset Code - Padiman",
      html: `
        <h2>${
          purpose === "signup" ? "Welcome to Padiman!" : "Password Reset"
        }</h2>
        <p>Your verification code is: <strong>${otpCode}</strong></p>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    });

    res.json({
      message: "New OTP sent successfully to your email.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Login
const loginPRUtility = async (req, res) => {
  try {
    const { email, password, expoPushToken } = req.body;

    const user = await PRUtility.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: "Invalid credentials" });

    // Update expo token if provided
    if (expoPushToken) {
      user.expoPushToken = expoPushToken;
    }

    if (!user.isVerified) {
      // Save any expo token changes before returning
      if (expoPushToken) await user.save();
      return res.status(200).json({
        message: "Account not verified. Please verify your email first.",
        user: {
          id: user._id,
          email: user.email,
          isVerified: false,
        },
        requiresVerification: true,
      });
    }

    // 🔥 INCREMENT TOKEN VERSION TO INVALIDATE PREVIOUS TOKENS
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    // 🔥 ADD TOKEN VERSION TO JWT PAYLOAD
    const token = jwt.sign(
      {
        id: user._id,
        isWorkman: user.isWorkman,
        tokenVersion: user.tokenVersion,
      },
      process.env.JWT_SECRET_PRU,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        isWorkman: user.isWorkman,
        isVerified: user.isVerified,
        expoPushToken: user.expoPushToken,
      },
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Forgot Password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await PRUtility.findOne({ email: email.toLowerCase() });

    if (!user) return res.status(404).json({ message: "User not found" });

    const otpCode = generateOTP();

    await OTP.create({
      email: email.toLowerCase(),
      otp: otpCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      purpose: "reset-password",
    });

    await sendPruEmail({
      to: email,
      subject: "Password Reset Code - Padiman",
      html: `
        <h2>Password Reset Request</h2>
        <p>Your password reset code is: <strong>${otpCode}</strong></p>
        <p>This code expires in 10 minutes.</p>
      `,
    });

    res.json({ message: "OTP sent to your email" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Verify OTP
const verifyOTP = async (req, res) => {
  try {
    const { email, otp, purpose = "signup" } = req.body;

    const otpRecord = await OTP.findOne({
      email: email.toLowerCase(),
      otp,
      purpose,
    });

    if (!otpRecord || otpRecord.expiresAt < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const user = await PRUtility.findOneAndUpdate(
      { email: email.toLowerCase() },
      { isVerified: true },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    await OTP.deleteOne({ _id: otpRecord._id });

    const token = jwt.sign(
      { id: user._id, isWorkman: user.isWorkman },
      process.env.JWT_SECRET_PRU,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Account verified successfully",
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        isWorkman: user.isWorkman,
        isVerified: true,
      },
      token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Reset Password
const resetPassword = async (req, res) => {
  try {
    const { email, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const user = await PRUtility.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found" });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Get Profile
const getProfile = async (req, res) => {
  try {
    const user = await PRUtility.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Profile fetched successfully",
      user,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Update Profile
const updateProfile = async (req, res) => {
  try {
    const {
      fullName,
      username,
      phone,
      countryCode,
      dialCode,
      gender,
      address,
      city,
      skillset,
      meansOfIdentification,
      isAvailable,
      expoPushToken,
    } = req.body;

    const updateData = {};

    if (fullName) updateData.fullName = fullName;
    if (username) updateData.username = username.toLowerCase().trim();
    if (phone) updateData.phone = phone;
    if (countryCode) updateData.countryCode = countryCode;
    if (dialCode) updateData.dialCode = dialCode;
    if (gender) updateData.gender = gender;
    if (address) updateData.address = address;
    if (city) updateData.city = city;
    if (meansOfIdentification)
      updateData.meansOfIdentification = meansOfIdentification;

    if (isAvailable !== undefined) {
      if (typeof isAvailable === "boolean") {
        updateData.isAvailable = isAvailable;
      } else if (typeof isAvailable === "string") {
        updateData.isAvailable = isAvailable.trim().toLowerCase() === "true";
      }
    }

    if (expoPushToken) updateData.expoPushToken = expoPushToken;

    if (skillset) {
      updateData.skillset = Array.isArray(skillset)
        ? skillset
        : skillset
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    }

    if (req.file) {
      try {
        const profilePicUrl = await uploadToBackblaze(
          req.file.buffer,
          req.file.originalname,
          "profile-pictures"
        );
        updateData.profilePicture = profilePicUrl;
      } catch (uploadError) {
        console.error("Backblaze upload error:", uploadError);
        return res
          .status(500)
          .json({ message: "Failed to upload profile picture" });
      }
    }

    const updatedUser = await PRUtility.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// ======================
// NEW: Get All Workmen
// ======================
const getWorkmen = async (req, res) => {
  try {
    const { city, skillset, isAvailable, limit = 20, page = 1 } = req.query;

    const query = {
      isWorkman: true,
      isVerified: true,
    };

    if (city) {
      query.city = { $regex: city, $options: "i" };
    }

    if (isAvailable !== undefined) {
      query.isAvailable = isAvailable === "true" || isAvailable === true;
    }

    if (skillset) {
      const skillsArray = skillset
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (skillsArray.length > 0) {
        query.skillset = { $in: skillsArray };
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const workmen = await PRUtility.find(query)
      .select("-password -__v")
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ isAvailable: -1, createdAt: -1 }); // Available workmen first

    const total = await PRUtility.countDocuments(query);

    res.json({
      message: "Workmen fetched successfully",
      workmen,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  registerPRUtility,
  loginPRUtility,
  forgotPassword,
  verifyOTP,
  resetPassword,
  resendOTP,
  updateProfile,
  getProfile,
  getWorkmen, // ← Added
};
