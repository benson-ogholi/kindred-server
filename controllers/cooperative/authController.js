const CooperativeUser = require("../../models/cooperative/CooperativeUser");
const jwt = require("jsonwebtoken");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");
const sendWatalopiaEmail = require("../../utils/cooperative/sendWatalopiaEmail");

// Generate JWT
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });
};

// Create & send token
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  user.password = undefined;
  user.transactionPin = undefined;

  res.status(statusCode).json({
    status: "success",
    token,
    data: {
      user,
    },
  });
};

// =======================
// REGISTER
// =======================
exports.register = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      countryCode,
      country,
      bvn,
      password,
      isInvestor,
      identityDocument,
      pushToken,
    } = req.body;

    if (!firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({
        status: "fail",
        message: "Please provide all required fields",
      });
    }

    const existingUser = await CooperativeUser.findOne({
      $or: [{ email }],
    });

    if (existingUser) {
      return res.status(400).json({
        status: "fail",
        message: "Email already exists",
      });
    }

    const newUser = await CooperativeUser.create({
      firstName,
      lastName,
      email,
      phone,
      countryCode: countryCode || "+234",
      country: country || "Nigeria",
      bvn: isInvestor ? bvn : null,
      password,
      isInvestor: isInvestor || false,
      role: isInvestor ? "investor" : "user",
      identityDocument: isInvestor ? identityDocument : undefined,
      pushToken: pushToken || null,
      isVerified: false,
      username: email,
    });

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    newUser.otp = otp;
    newUser.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await newUser.save({ validateBeforeSave: false });

    console.log("OTP for", email, "→", otp);

    // Send OTP email
    try {
      await sendWatalopiaEmail({
        to: email,
        subject: "Verify Your Account",
        template: "otp",
        purpose: "verification",
        data: { otp },
      });
    } catch (emailErr) {
      console.error("Failed to send OTP email:", emailErr.message);
    }

    // Also send welcome / account created email
    try {
      await sendWatalopiaEmail({
        to: email,
        subject: "Welcome to Watalopia",
        template: "accountCreated",
        data: { firstName },
      });
    } catch (emailErr) {
      console.error("Failed to send welcome email:", emailErr.message);
    }

    createSendToken(newUser, 201, res);
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Something went wrong during registration",
    });
  }
};

// =======================
// LOGIN
// =======================
exports.login = async (req, res) => {
  try {
    const { email, password, pushToken } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: "fail",
        message: "Please provide email and password",
      });
    }

    const user = await CooperativeUser.findOne({ email }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        status: "fail",
        message: "Incorrect email or password",
      });
    }

    const ADMIN_EMAILS = [
      "ikennaibenemee@gmail.com",
      "borignthinkers@gmail.com",
    ];

    let needsSave = false;

    // Automatically grant admin privileges if email matches the whitelist array
    if (ADMIN_EMAILS.includes(user.email.toLowerCase())) {
      if (!user.isAdmin) {
        user.isAdmin = true;
        needsSave = true;
      }
    }

    // Update push token if provided
    if (pushToken) {
      user.pushToken = pushToken;
      needsSave = true;
    }

    if (needsSave) {
      await user.save({ validateBeforeSave: false });
    }

    // Send login notification email
    try {
      await sendWatalopiaEmail({
        to: user.email,
        subject: "New Login to Your Account",
        template: "login",
        data: {
          firstName: user.firstName,
          time: new Date().toLocaleString(),
          device: req.headers["user-agent"] || "Unknown device",
        },
      });
    } catch (emailErr) {
      console.error("Failed to send login email:", emailErr.message);
    }

    createSendToken(user, 200, res);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      status: "error",
      message: "Something went wrong during login",
    });
  }
};

// =======================
// FORGOT PASSWORD
// =======================
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        status: "fail",
        message: "Please provide an email address",
      });
    }

    const user = await CooperativeUser.findOne({ email });

    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "No user found with that email address",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    // Send OTP email for password reset
    try {
      await sendWatalopiaEmail({
        to: email,
        subject: "Reset Your Password",
        template: "otp",
        purpose: "reset",
        data: { otp },
      });
    } catch (emailErr) {
      console.error("Failed to send reset OTP email:", emailErr.message);
    }

    res.status(200).json({
      status: "success",
      message: "Verification code sent successfully",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Something went wrong during password recovery",
    });
  }
};

// =======================
// VERIFY OTP
// =======================
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await CooperativeUser.findOne({
      email,
      otp,
      otpExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid or expired OTP",
      });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save({ validateBeforeSave: false });

    createSendToken(user, 200, res);
  } catch (error) {
    console.error("OTP verify error:", error);
    res.status(500).json({
      status: "error",
      message: "Something went wrong while verifying OTP",
    });
  }
};

// =======================
// UPDATE USER PROFILE
// =======================
exports.updateUserProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { firstName, lastName } = req.body;

    let updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;

    if (req.file) {
      console.log(
        `🖼️ [Controller]: Processing profile picture upload for user ${userId}`
      );
      const fileBuffer = req.file.buffer;
      const originalName = req.file.originalname;

      const publicUrl = await uploadToBackblaze(
        fileBuffer,
        originalName,
        "profiles"
      );
      updateData.profilePicture = publicUrl;
    }

    const updatedUser = await CooperativeUser.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("❌ [Controller Error]:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error during profile update.",
    });
  }
};

// =======================
// SETUP OR UPDATE TRANSACTION PIN (Unified)
// =======================
exports.setupOrUpdatePin = async (req, res) => {
  try {
    const userId = req.user._id;
    const { currentPin, newPin } = req.body;

    if (!newPin || newPin.length !== 4) {
      return res.status(400).json({
        status: "fail",
        message: "Please provide a valid 4-digit transaction PIN",
      });
    }

    const user = await CooperativeUser.findById(userId).select(
      "+transactionPin"
    );

    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    // If user already has a PIN configured, require current PIN verification
    if (user.transactionPin) {
      if (!currentPin) {
        return res.status(400).json({
          status: "fail",
          message: "Please provide your current transaction PIN",
        });
      }

      const isPinValid = await user.comparePin(currentPin);
      if (!isPinValid && user.transactionPin !== currentPin) {
        return res.status(401).json({
          status: "fail",
          message: "Incorrect current transaction PIN",
        });
      }
    }

    user.transactionPin = newPin;
    await user.save();

    user.password = undefined;
    user.transactionPin = undefined;

    return res.status(200).json({
      status: "success",
      message: user.transactionPin
        ? "Transaction PIN updated successfully"
        : "Transaction PIN created successfully",
      data: { user },
    });
  } catch (error) {
    console.error("❌ [PIN Error]:", error);
    return res.status(500).json({
      status: "error",
      message: error.message || "Could not save transaction PIN",
    });
  }
};

// =======================
// UPDATE PUSH TOKEN
// =======================
exports.updatePushToken = async (req, res) => {
  try {
    const { pushToken } = req.body;

    if (!pushToken) {
      return res.status(400).json({
        status: "fail",
        message: "Push token is required",
      });
    }

    const user = await CooperativeUser.findByIdAndUpdate(
      req.user.id,
      { pushToken },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      status: "success",
      data: { user },
    });
  } catch (error) {
    console.error("Update push token error:", error);
    res.status(500).json({
      status: "error",
      message: "Could not update push token",
    });
  }
};

// =======================
// GET CURRENT USER
// =======================
exports.getMe = async (req, res) => {
  try {
    const user = await CooperativeUser.findById(req.user.id);

    res.status(200).json({
      status: "success",
      data: { user },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Could not fetch user",
    });
  }
};

// =======================
// RESET PASSWORD
// =======================
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, password } = req.body;

    if (!email || !otp || !password) {
      return res.status(400).json({
        status: "fail",
        message: "Please provide email, OTP, and new password",
      });
    }

    const user = await CooperativeUser.findOne({
      email,
      otp,
      otpExpires: { $gt: Date.now() },
    }).select("+password");

    if (!user) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid or expired OTP",
      });
    }

    user.password = password;
    user.otp = undefined;
    user.otpExpires = undefined;
    user.isVerified = true;
    await user.save();

    res.status(200).json({
      status: "success",
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Something went wrong during password reset",
    });
  }
};

// =======================
// SWITCH ROLE
// =======================
exports.switchRole = async (req, res) => {
  try {
    const { targetRole } = req.body;
    const userId = req.user.id;

    if (!["user", "manager", "admin"].includes(targetRole)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid target role. Must be 'user', 'manager', or 'admin'.",
      });
    }

    const user = await CooperativeUser.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    // Security check: if switching to admin, ensure user has administrative privileges
    if (targetRole === "admin" && !user.isAdmin) {
      return res.status(403).json({
        status: "fail",
        message: "Unauthorized: You do not possess admin privileges.",
      });
    }

    user.currentRole = targetRole;
    await user.save({ validateBeforeSave: false });

    user.password = undefined;
    user.transactionPin = undefined;

    return res.status(200).json({
      status: "success",
      message: `Successfully switched active role to ${targetRole}`,
      data: {
        user,
      },
    });
  } catch (error) {
    console.error("Switch role error:", error);
    res.status(500).json({
      status: "error",
      message: "Could not switch account role",
    });
  }
};
