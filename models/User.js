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

    /* 🔐 PRIVACY SETTINGS */
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