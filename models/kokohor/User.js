const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    /* 👤 BASIC PROFILE INFO */
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
    },
    dateOfBirth: {
      type: String, // Format: dd/mm/yyyy
      required: true,
    },
    bio: {
      type: String,
      maxlength: 300,
      default: "",
    },
    profilePicture: {
      type: String,
      default: null, // Backblaze B2 or Cloudinary URL
    },
    password: {
      type: String,
      required: true,
    },
    deviceID: {
      type: String,
      required: false,
    },
    platform: {
      type: String,
      enum: ["ios", "android", "others"],
    },
    /* 🛡️ ACCOUNT STATUS & SECURITY */
    isVerified: {
      type: Boolean,
      default: false,
    },
    isOncall: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
    role: {
      type: String,
      enum: ["user", "admin", "superadmin"],
      default: "user",
    },

    /* 📲 REAL-TIME & NOTIFICATIONS */
    expoPushToken: {
      type: String,
      default: null,
      index: true,
    },
    voipPushToken: {
      type: String,
      default: null,
      index: true,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    socketId: {
      type: String,
      default: null,
    },
    passcode: {
      type: String,
      default: "",
    },
    securityQuestion: {
      type: String,
      default: null,
    },
    securityAnswer: {
      type: String,
      default: null,
    },
    passcodeAttempts: { type: Number, default: 0 },
    passcodeLockedUntil: { type: Date, default: null },
    requiresSecurityQuestion: { type: Boolean, default: false },
    /* 🔐 PRIVACY & SHARING PREFERENCES */
    privacySettings: {
      showNameInDonations: {
        type: Boolean,
        default: true,
      },
      showContactDetailsToFamily: {
        type: Boolean,
        default: true,
      },
    },

    /* 🔔 NOTIFICATION PREFERENCES */
    notificationPreferences: {
      push: {
        enabled: { type: Boolean, default: true },
      },
      email: {
        enabled: { type: Boolean, default: true },
      },
      sms: {
        enabled: { type: Boolean, default: false },
      },
      donationNotifications: {
        type: Boolean,
        default: true,
      },
      withdrawalNotifications: {
        type: Boolean,
        default: true,
      },
    },

    /* 🚫 BLOCK & SNOOZE (see utils/kokohor/moderation.js) */
    // Blocked users: their content is hidden from me, they can't message or
    // call me, and I get no notifications from them.
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Blocked families: hidden from my feeds, no notifications or calls.
    blockedFamilies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Family" }],
    // Snoozed users/families: notifications and call ringing are muted
    // until `until` (content stays visible).
    snoozes: [
      {
        _id: false,
        targetType: { type: String, enum: ["user", "family"], required: true },
        target: { type: mongoose.Schema.Types.ObjectId, required: true },
        until: { type: Date, required: true },
      },
    ],

    /* 📂 RELATIONAL DATA (Heritage & Sanctuary) */
    savedFamilies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Family",
      },
    ],
  },
  {
    timestamps: true,
  }
);

userSchema.set("toJSON", {
  transform: (doc, ret) => {
    if (ret.status === "suspended") {
      ret.savedFamilies = [];
    }
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
