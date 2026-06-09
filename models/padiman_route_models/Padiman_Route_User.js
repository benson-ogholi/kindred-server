const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const padimanRouteUserSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, "Full name is required"],
    trim: true,
  },
  phone: {
    type: String,
    required: [true, "Phone number is required"],
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  isDriver: {
    type: Boolean,
    default: false,
  },
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: [6, "Password must be at least 6 characters long"],
  },
  referralCode: {
    type: String,
    default: null,
    trim: true,
  },
  expoPushToken: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Pre-save hook: Hash password before saving to the database
// Pre-save hook: Simplified and error-safe
// Pre-save hook: Use this exact syntax
padimanRouteUserSchema.pre("save", async function () {
  // 1. If password isn't modified, we don't need to do anything
  if (!this.isModified("password")) {
    return;
  }

  // 2. Hash the password
  // Mongoose automatically waits for this promise to resolve
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});
// Method to compare passwords during login authentication
padimanRouteUserSchema.methods.comparePassword = async function (
  candidatePassword
) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("PadimanRouteUser", padimanRouteUserSchema);
