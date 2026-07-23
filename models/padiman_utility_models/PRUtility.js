const mongoose = require("mongoose");

const PRUtilitySchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    countryCode: {
      type: String,
      default: "NG",
    },
    dialCode: {
      type: String,
      default: "+234",
    },
    isWorkman: {
      type: Boolean,
      default: false,
      required: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    expoPushToken: {
      type: String,
    },
    profilePicture: {
      type: String, // Backblaze URL
      default: null,
    },

    // ==================== NEW FIELDS ====================
    gender: {
      type: String,
      enum: ["Male", "Female", "Other", "Prefer not to say"],
      default: null,
    },
    address: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    skillset: {
      type: [String],
      default: [],
    },
    meansOfIdentification: {
      type: String,
      trim: true,
      default: null,
    },

    // NEW: Availability for workmen
    isAvailable: {
      type: Boolean,
      default: false, // Default to not available
    },
  },
  { timestamps: true }
);

// Existing indexes
PRUtilitySchema.index({ email: 1 });
PRUtilitySchema.index({ username: 1 });
PRUtilitySchema.index({ city: 1 });
PRUtilitySchema.index({ isWorkman: 1 });
PRUtilitySchema.index({ isAvailable: 1 });

module.exports = mongoose.model("PRUtility", PRUtilitySchema);
