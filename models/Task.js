const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    family: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      required: true,
    },
    title: {
      type: String,
      required: [true, "Task title is required"],
    },
    details: {
      type: String,
    },
    deadline: {
      type: Date,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
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
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // <-- NEW
  },
  { timestamps: true }
);

module.exports = mongoose.model("Task", taskSchema);
