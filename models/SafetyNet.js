const mongoose = require("mongoose");

const safetyNetSchema = new mongoose.Schema(
  {
    family: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    // Media Arrays
    imageUrls: [{ type: String }],
    audioUrls: [{ type: String }],
    videoUrls: [{ type: String }],

    assignedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    description: {
      type: String,
      required: [true, "description is required"],
      trim: true,
    },
    triggerDate: {
      type: Date,
      required: [true, "Trigger date is required"],
    },
    status: {
      type: String,
      enum: ["PENDING", "RELEASED", "CANCELLED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

// Index to help with cron jobs searching for triggered nets
safetyNetSchema.index({ triggerDate: 1, status: 1 });

module.exports = mongoose.model("SafetyNet", safetyNetSchema);
