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
    title: { type: String, required: true, trim: true },
    content: { type: String,  trim: true },
    isRead: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Standardized
    images: [
      { url: { type: String, }, publicId: { type: String } },
    ],
    voiceNote: { url: { type: String }, duration: { type: Number } },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

NewsSchema.pre("save", function () {
  if (!this.isRead) {
    this.isRead = [];
  }

  if (this.isNew && !this.isRead.some(id => id.toString() === this.sender.toString())) {
    this.isRead.push(this.sender);
  }
});
module.exports = mongoose.model("News", NewsSchema);
