const mongoose = require("mongoose");

const NewsSchema = new mongoose.Schema(
  {
    family: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      required: true,
    },

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    content: {
      type: String,
      required: true,
      trim: true,
    },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // <-- NEW
    // ✅ Optional images
    images: [
      {
        url: {
          type: String,
          required: true,
        },
        publicId: {
          type: String, // optional (Cloudinary/S3 cleanup)
        },
      },
    ],

    // ✅ Optional voice note
    voiceNote: {
      url: {
        type: String,
      },
      duration: {
        type: Number, // in seconds
      },
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // adds createdAt & updatedAt automatically
  }
);

module.exports = mongoose.model("News", NewsSchema);
