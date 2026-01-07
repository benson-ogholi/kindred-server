const mongoose = require("mongoose");

const pollSchema = new mongoose.Schema(
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
    title: { type: String, required: true, trim: true },
    description: { type: String },
    options: [
      {
        text: { type: String, required: true },
        votes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      },
    ],
    isRead: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Standardized
    endDate: { type: Date },
    status: { type: String, enum: ["active", "closed"], default: "active" },
  },
  { timestamps: true }
);

pollSchema.pre("save", function () {
  if (!this.isRead) {
    this.isRead = [];
  }

  if (this.isNew && !this.isRead.some(id => id.toString() === this.sender.toString())) {
    this.isRead.push(this.sender);
  }
});

module.exports = mongoose.model("Poll", pollSchema);
