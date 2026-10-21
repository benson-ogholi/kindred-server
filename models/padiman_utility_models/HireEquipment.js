const mongoose = require("mongoose");

const HireEquipmentSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PRUtility",
      required: true,
    },
    equipmentTitle: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true, // e.g., "Cars", "Tractors", "Heavy Machinery", "Generators"
    },
    customCategory: {
      type: String,
      trim: true, // Used only if category is set to "Others"
    },
    modelYear: {
      type: Number,
      min: 1950,
      max: new Date().getFullYear() + 1,
    },
    color: {
      type: String,
      trim: true,
    },
    images: {
      type: [String], // Array of image URLs for the equipment
      default: [],
    },
    notes: {
      type: String,
      trim: true, // Poster's displays, terms, or special conditions
    },
    hiringPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    pricePerUnit: {
      type: String,
      enum: ["hour", "day", "weekly", "month", "service", "none"],
      default: "day",
      required: true,
    },
    plateNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
    registrationDocumentsComplete: {
      type: Boolean,
      default: false,
      required: true,
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
    isPaused: {
      type: Boolean,
      default: false,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Indexes for fast querying
HireEquipmentSchema.index({ owner: 1 });
HireEquipmentSchema.index({ category: 1 });
HireEquipmentSchema.index({ country: 1, state: 1, city: 1 });
HireEquipmentSchema.index({ isPaused: 1 });

module.exports = mongoose.model("HireEquipment", HireEquipmentSchema);
