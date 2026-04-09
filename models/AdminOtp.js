const mongoose = require('mongoose');

const adminOtpSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true },
  otp: { type: String, required: true },
  createdAt: { 
    type: Date, 
    default: Date.now, 
    expires: 1800 
  }
});

module.exports = mongoose.model('AdminOtp', adminOtpSchema);