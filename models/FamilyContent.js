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
        "My Village",
        "Key Date",
        "Task", 
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
       * ===== KEY DATES =====
       */
      eventDate: {
        type: Date, // dd/mm/yyyy → stored as ISO
      },
      place: {
        type: String, // Lagos, Nigeria
      },
      visibility: {
        type: String,
        enum: ["private", "family"],
        default: "family",
      },

      /**
       * ===== EXISTING METADATA =====
       */
      deadline: String,
      inCareOf: String,
      resolutionStatus: {
        type: String,
        enum: ["Pending", "In Progress", "Completed", "Cancelled"],
        default: "Pending",
      },

      role: String,
      startYear: Number,
      endYear: Number,
      currentlyServing: { type: Boolean, default: false },

      significance: String,
      traditionType: String,
      lessonCategory: String,

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


      taskStatus: {
        type: String,
        enum: ["Pending", "Completed", "Cancelled"],
        default: "Pending",
      },
    
      visibility: {
        type: String,
        enum: ["private", "family"],
        default: "private", // ✅ tasks are private by default
      },
    
      /**
       * ===== EXISTING METADATA (unchanged) =====
       */
      eventDate: Date,
      place: String,
      deadline: String,
      inCareOf: String,
      resolutionStatus: {
        type: String,
        enum: ["Pending", "In Progress", "Completed", "Cancelled"],
        default: "Pending",
      },
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
      (id) => id.toString() === this.creator.toString()
    );
    if (!exists) this.isRead.push(this.creator);
  }
});

module.exports = mongoose.model("FamilyContent", FamilyContentSchema);
