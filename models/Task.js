const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    family: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      required: true,
    },
    title: { type: String, required: true },
    details: { type: String },
    deadline: { type: Date },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "in-progress", "completed"],
      default: "pending",
    },
    isRead: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Standardized
  },
  { timestamps: true }
);

taskSchema.pre("save", function (next) {
  if (this.isNew && !this.isRead.includes(this.createdBy)) {
    this.isRead.push(this.createdBy);
  }
  next();
});

module.exports = mongoose.model("Task", taskSchema);
