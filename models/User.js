const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    /* 👤 BASIC INFO */
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },

    phone: {
      type: String,
      required: true,
    },

    dateOfBirth: {
      type: String, // dd/mm/yyyy
      required: true,
    },

    bio: {
      type: String,
      maxlength: 300,
      default: "",
    },
    profilePicture: {
      type: String,
      default: null, // Stores the Backblaze URL
    },
    
    password: {
      type: String,
      required: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    /* 📲 EXPO PUSH TOKEN */
    expoPushToken: {
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
    /* 🔐 PRIVACY SETTINGS */
    privacySettings: {
      showNameInDonations: {
        type: Boolean,
        default: true,
      },
      // Added to match the "Show my contact details" toggle
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

      // Matches: "Receive donation notifications"
      donationNotifications: {
        type: Boolean,
        default: true,
      },
      // Matches: "Receive withdrawal notifications"
      withdrawalNotifications: {
        type: Boolean,
        default: true,
      },
    },
    
    savedFamilies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Family",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);