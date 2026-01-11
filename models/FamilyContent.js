const mongoose = require("mongoose");

const FamilyContentSchema = new mongoose.Schema(
  {
    familyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      required: true,
      index: true,
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // The array of user IDs who have read this content
    isRead: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    contentType: {
      type: String,
      enum: [
        "Family Tree",
        "History",
        "Village Tradition",
        "Language Lesson",
        "King",
        "Patriarch",
        "Resolution",
        "My Village",
        "Suggestion Box",
      ],
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String },
    images: [
      {
        url: { type: String },
      },
    ],
    voiceNote: {
      url: { type: String },
      duration: { type: Number },
    },
    metadata: {
      role: { type: String },
      dateOccurred: { type: Date },
      lessonLevel: { type: String },
      parentMemberId: { type: String },
    },
  },
  { timestamps: true }
);

/**
 * Pre-save Middleware
 * Automatically adds the creator to the isRead array when a new
 * document is created so they don't see their own post as "unread".
 */
FamilyContentSchema.pre("save", async function () {
  if (!this.isRead?.length) {
    this.isRead = [];
  }

  if (this.isNew && this.creator) {
    if (!this.isRead.find(id => id.toString() === this.creator.toString())) {
      this.isRead.push(this.creator);
    }
  }
});
module.exports = mongoose.model("FamilyContent", FamilyContentSchema);
