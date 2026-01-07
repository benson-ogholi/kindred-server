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
    isRead: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Standardized
    upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    status: {
      type: String,
      enum: ["pending", "reviewed", "implemented"],
      default: "pending",
    },
  },
  { timestamps: true }
);

suggestionSchema.pre("save", function () {
  if (!this.isRead) {
    this.isRead = [];
  }

  if (this.isNew && !this.isRead.some(id => id.toString() === this.sender.toString())) {
    this.isRead.push(this.sender);
  }
});

module.exports = mongoose.model("Suggestion", suggestionSchema);
