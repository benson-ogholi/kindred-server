const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
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
    reportName: { type: String, required: true },
    expectations: { type: String },
    workDone: { type: String, required: true },
    status: {
      type: String,
      enum: ["In Progress", "Review", "Completed"],
      default: "In Progress",
    },    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // <-- NEW
    completionPercentage: { type: Number, min: 0, max: 100, default: 0 },
    proofLinks: [{ type: String }],
    sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Target members
  },
  { timestamps: true }
);

module.exports = mongoose.model("Report", reportSchema);
