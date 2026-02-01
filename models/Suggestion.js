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
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    imageUrl: { type: String, default: null },
    isRead: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Standard upvotes/likes array to store User IDs
    upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // NEW: Likes section if you want to distinguish from upvotes
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    status: {
      type: String,
      enum: ["pending", "reviewed", "implemented"],
      default: "pending",
    },
    // Comments Section
    comments: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        message: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Pre-save middleware to handle unread status
suggestionSchema.pre("save", function (next) {
  if (!this.isRead) {
    this.isRead = [];
  }

  // Ensure sender has "read" their own suggestion by default
  if (
    this.isNew &&
    this.sender &&
    !this.isRead.some((id) => id.toString() === this.sender.toString())
  ) {
    this.isRead.push(this.sender);
  }
  next();
});

module.exports = mongoose.model("Suggestion", suggestionSchema);
