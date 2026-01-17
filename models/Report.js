const mongoose = require("mongoose");


const commentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);



const reportSchema = new mongoose.Schema(
  {
    familyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reportName: { type: String },
    expectations: { type: String },
    workDone: { type: String },
    status: {
      type: String,
      enum: ["In Progress", "Review", "Completed"],
      default: "In Progress",
    },
    comments: [commentSchema],
    isRead: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Standardized
    completionPercentage: { type: Number, min: 0, max: 100, default: 0 },
    proofLinks: [{ type: String }],
    sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

reportSchema.pre("save", function () {
  if (!this.isRead) {
    this.isRead = [];
  }

  if (this.isNew && !this.isRead.some(id => id.toString() === this.sender.toString())) {
    this.isRead.push(this.sender);
  }
});

module.exports = mongoose.model("Report", reportSchema);
