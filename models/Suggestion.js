const mongoose = require("mongoose");

const suggestionSchema = new mongoose.Schema(
  {
    familyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
    },
    imageUrl: {
      type: String,
      default: null,
    },    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // <-- NEW
    upvotes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    status: {
      type: String,
      enum: ["pending", "reviewed", "implemented"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Suggestion", suggestionSchema);
