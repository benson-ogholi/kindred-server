const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  phoneNumber: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true 
  },
  role: { 
    type: String, 
    enum: ['superadmin', 'editor', 'moderator'], 
    default: 'moderator' 
  },
  otp: { type: String },
  otpExpires: { type: Date },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Admin', adminSchema);