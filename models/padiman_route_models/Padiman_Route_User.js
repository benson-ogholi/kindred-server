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

  isDriverApproved: {
    type: Boolean,
    default: false,
  },
  isUserDocumented: {
    type: Boolean,
    default: false,
  },
  isDriverSuspended: {
    type: Boolean,
    default: false,
  },
  isDriverRejected: {
    type: Boolean,
    default: false,
  },
  gender: {
    type: String,
    enum: ["male", "female", "other", "prefer_not_to_say"],
    default: null,
  },
  address: {
    type: String,
    trim: true,
  },
  occupation: {
    type: String,
    trim: true,
  },
  driverLicenseNumber: {
    type: String,
    trim: true,
    sparse: true, // Allows null/undefined for non-drivers
  },
  ninNumber: {
    type: String,
    trim: true,
    sparse: true,
    default: null,
  },
  profileImage: {
    type: String,
    default: null,
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
  // Verification metadata supporting vehicle applications and structured document statuses
  verificationMeta: {
    vehicleApplication: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    verifiedDocuments: {
      bvnStatus: {
        type: String,
        default: "BVN number not verified",
      },
      ninStatus: {
        type: String,
        default: "NIN number not verified",
      },
      verifiedAt: {
        type: Date,
        default: null,
      },
    },
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
});

// Pre-save hook: Hash password before saving to the database
padimanRouteUserSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }
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
