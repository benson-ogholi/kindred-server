// models/Otp.js
const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  purpose: { type: String, enum: ["verify", "reset"], required: true },
  expiresAt: { type: Date, required: true },
});

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto delete expired OTPs

module.exports = mongoose.model("Otp", otpSchema);