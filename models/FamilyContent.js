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

    isRead: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Social Logic
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        text: { type: String },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    contentType: {
      type: String,
      enum: [
        "Family Tree",
        "Family History",
        "Village Story",
        "Village Tradition",
        "Language Lesson",
        "King",
        "Patriarch",
        "Resolution",
        "Suggestion Box",
        "My Village",
        "Key Date",
        "Task",

        "History",
      ],
      required: true,
    },

    // ===== Common Fields =====
    title: {
      type: String,
    },

    description: {
      type: String,
    },

    images: [
      {
        url: { type: String },
      },
    ],

    videoUrl: {
      type: String,
    },

    // ===== Metadata =====
    metadata: {
      eventDate: {
        type: Date,
      },
      place: {
        type: String,
      },
      deadline: {
        type: String,
      },

      visibility: {
        type: String,
        enum: ["private", "family", "personal", "public"],
        default: "family",
      },

      resolutionStatus: {
        type: String,
        enum: ["Pending", "In Progress", "Completed", "Cancelled"],
        default: "Pending",
      },
      taskStatus: {
        type: String,
        enum: ["Pending", "Completed", "Cancelled"],
        default: "Pending",
      },

      role: String,
      startYear: Number,
      endYear: Number,
      currentlyServing: { type: Boolean, default: false },
      significance: String,
      traditionType: String,
      lessonCategory: String,
      inCareOf: String,

      fullName: String,
      yearOfBirth: Number,
      yearOfDeath: Number,
      gender: {
        type: String,
        enum: ["Male", "Female", "Other"],
      },
      relationshipType: String,
      currentlyLiving: { type: Boolean, default: true },
      spouseName: String,
      maidenName: String,
      placeOfBirth: String,
      placeOfDeath: String,
      occupation: String,
      parentName: String,
      birthOrder: Number,
      additionalNotes: String,
    },
  },
  { timestamps: true }
);

/**
 * Auto mark creator as read
 * FIX: Removed 'next' and used async to prevent "next is not a function"
 */
FamilyContentSchema.pre("save", async function () {
  if (!this.isRead) this.isRead = [];

  if (this.isNew && this.creator) {
    const exists = this.isRead.some(
      (id) => id.toString() === this.creator.toString()
    );
    if (!exists) {
      this.isRead.push(this.creator);
    }
  }
  // With async hooks, you don't need next()
});

module.exports = mongoose.model("FamilyContent", FamilyContentSchema);
