const mongoose = require("mongoose");

const padimanRouteAdminOtpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    index: true, // Indexed for fast lookup during verification
  },
  otp: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 300, // TTL: Automatically deletes document after 300 seconds
  },
});

module.exports = mongoose.model(
  "PadimanRouteAdminOtp",
  padimanRouteAdminOtpSchema
);
