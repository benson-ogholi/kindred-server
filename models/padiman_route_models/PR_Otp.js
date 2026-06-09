const mongoose = require("mongoose");

const prOtpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    index: true, // Speeds up lookup
  },
  otp: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600, // MongoDB automatically deletes this doc after 10 minutes (600 seconds)
  },
});

module.exports = mongoose.model("PR_Otp", prOtpSchema);