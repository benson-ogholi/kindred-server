const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true,
    lowercase: true // Added this to prevent "User@me.com" duplicates
  },
  // If you decide to add phone back later, do it like this:
  // phoneNumber: { type: String, unique: true, sparse: true }, 

  role: { 
    type: String, 
    enum: ['superadmin', 'editor', 'moderator'], 
    default: 'moderator' 
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Admin', adminSchema);