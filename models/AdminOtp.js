const mongoose = require('mongoose');

const adminOtpSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  otp: { type: String, required: true },
  createdAt: { 
    type: Date, 
    default: Date.now, 
    expires: 1800 // 30 minutes
  }
});

module.exports = mongoose.model('AdminOtp', adminOtpSchema);