const mongoose = require("mongoose");

const driverApplicationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PadimanRouteUser", // Links to your existing user model
    required: true,
    unique: true, // One application per user
  },
  // --- VEHICLE DETAILS ---
  carDetails: {
    model: String,
    licensePlate: String,
    year: Number,
  },
  // Multiple images for the car (e.g., front, back, interior)
  carImages: [
    {
      url: String, // Path or Cloudinary/S3 URL
      description: String, // e.g., "Front view"
    },
  ],
  // --- DOCUMENTATION ---
  driversLicense: {
    licenseNumber: String,
    issueDate: Date,
    expiryDate: Date,
    image: String, // URL to the license document image
  },
  // --- APPLICATION WORKFLOW ---
  
  status: {
    type: String,
    enum: ["submitted", "approved", "rejected", "suspended"],
    default: "submitted",
  },
  rejectionReason: String, // Only filled if status is "rejected"
  submittedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("DriverApplication", driverApplicationSchema);
