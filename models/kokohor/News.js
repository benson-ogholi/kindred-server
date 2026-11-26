const mongoose = require("mongoose");

const CommentSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

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
    content: { type: String, trim: true },
    isRead: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    images: [{ url: { type: String }, publicId: { type: String } }],
    voiceNote: {
      url: { type: String },
      duration: { type: Number },
    },
    // Added Likes
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Added Comments
    comments: [CommentSchema],
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

NewsSchema.pre("save", async function () {
  if (!this.isRead) {
    this.isRead = [];
  }

  // Ensure we are checking against the correct field (author vs sender)
  if (this.isNew && this.author) {
    const exists = this.isRead.some(
      (id) => id.toString() === this.author.toString()
    );
    if (!exists) {
      this.isRead.push(this.author);
    }
  }
  // No need for next() in an async pre-save hook
});

module.exports = mongoose.model("News", NewsSchema);
