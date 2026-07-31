const mongoose = require("mongoose");

const WorkSchema = new mongoose.Schema(
  {
    workman: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PRUtility",
      required: true,
    },
    jobTitle: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    customCategory: {
      type: String,
      trim: true, // Used only if category is set to "Others"
    },
    // NEW: Optional starting price field
    startingPrice: {
      type: Number,
      min: 0,
    },
    jobDescription: {
      type: String,
      required: true,
      trim: true,
    },
    imagesOfPreviousJobs: {
      type: [String], // Array of image URLs (e.g., Backblaze/Cloudinary)
      default: [],
    },
    contactEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    contactPhone: {
      type: String,
      trim: true,
    },
    links: [
      {
        key: { type: String, required: true, trim: true },
        value: { type: String, required: true, trim: true },
        _id: false,
      },
    ],
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isPaused: {
      type: Boolean,
      default: false,
    },
    country: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    age: {
      type: Number,
      min: 18,
    },
    qualifications: [
      {
        title: { type: String, trim: true },
        level: { type: String, trim: true },
        _id: false,
      },
    ],
    benefits: [
      {
        title: { type: String, trim: true },
        description: { type: String, trim: true },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

// Indexes for fast querying
WorkSchema.index({ workman: 1 });
WorkSchema.index({ category: 1 });
WorkSchema.index({ country: 1, state: 1, city: 1 });
WorkSchema.index({ isPaused: 1 });

module.exports = mongoose.model("Work", WorkSchema);