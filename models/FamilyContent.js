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
        "My Village"
      ],
      required: true,
    },

    // ===== Common Fields =====
    title: {
      type: String, // Resolution Topic
    },

    description: {
      type: String, // Brief Details
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
      /**
       * ===== Family Resolution =====
       */
      deadline: {
        type: String,
      },
      inCareOf: {
        type: String, // Person or group responsible
      },
      resolutionStatus: {
        type: String,
        enum: ["Pending", "In Progress", "Completed", "Cancelled"],
        default: "Pending",
      },

      /**
       * ===== Leaders / Patriarch =====
       */
      role: { type: String },
      startYear: { type: Number },
      endYear: { type: Number },
      currentlyServing: { type: Boolean, default: false },

      /**
       * ===== Family History / Stories =====
       */
      significance: { type: String },

      /**
       * ===== Traditions =====
       */
      traditionType: { type: String },

      /**
       * ===== Language Lessons =====
       */
      lessonCategory: { type: String },

      /**
       * ===== Family Tree =====
       */
      fullName: { type: String },
      yearOfBirth: { type: Number },
      yearOfDeath: { type: Number },
      gender: {
        type: String,
        enum: ["Male", "Female", "Other"],
      },
      relationshipType: { type: String },
      currentlyLiving: { type: Boolean, default: true },
      spouseName: { type: String },
      maidenName: { type: String },
      placeOfBirth: { type: String },
      placeOfDeath: { type: String },
      occupation: { type: String },
      parentName: { type: String },
      birthOrder: { type: Number },
      additionalNotes: { type: String },
    },
  },
  { timestamps: true }
);

/**
 * Auto mark creator as read
 */
FamilyContentSchema.pre("save", function () {
  if (!this.isRead) this.isRead = [];

  if (this.isNew && this.creator) {
    const exists = this.isRead.some(
      id => id.toString() === this.creator.toString()
    );
    if (!exists) this.isRead.push(this.creator);
  }
});

module.exports = mongoose.model("FamilyContent", FamilyContentSchema);