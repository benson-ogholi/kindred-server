const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const cooperativeUserSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
    },
    username: {
      type: String,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    countryCode: {
      type: String,
      default: "+234",
    },
    country: {
      type: String,
      default: "Nigeria",
    },
    bvn: {
      type: String,
      trim: true,
      default: null,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,
    },
    transactionPin: {
      type: String,
      select: false,
    },
    identityDocument: {
      name: { type: String, default: null },
      url: { type: String, default: null },
      size: { type: String, default: null },
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isInvestor: {
      type: Boolean,
      default: false,
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    currentRole: {
      type: String,
      enum: ["user", "manager", "admin"],
      default: "user",
    },
    permissions: {
      type: [String],
      default: [],
      // Available permissions:
      // "review_savings", "review_loans", "review_membership",
      // "review_withdrawals", "send_messages", "view_financial_reports", "manage_quick_actions"
    },
    pushToken: {
      type: String,
      default: null,
    },
    otp: {
      type: String,
      default: null,
      select: false,
    },
    otpExpires: {
      type: Date,
      default: null,
      select: false,
    },
    role: {
      type: String,
      enum: ["user", "investor", "admin"],
      default: "user",
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
cooperativeUserSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Compare password method
cooperativeUserSchema.methods.comparePassword = async function (
  candidatePassword
) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const CooperativeUser = mongoose.model(
  "CooperativeUser",
  cooperativeUserSchema
);

module.exports = CooperativeUser;
