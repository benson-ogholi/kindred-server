const mongoose = require("mongoose");

const PRUtility_OTPSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
    },
    otp: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    purpose: {
      type: String,
      enum: ["signup", "reset-password"],
      default: "signup",
    },
  },
  {
    timestamps: true,
  }
);

// Auto delete expired OTPs
PRUtility_OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PRUtility_OTP", PRUtility_OTPSchema);
