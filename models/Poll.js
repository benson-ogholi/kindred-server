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

pollSchema.pre("save", function (next) {
  if (this.isNew && !this.isRead.includes(this.sender)) {
    this.isRead.push(this.sender);
  }
  next();
});

module.exports = mongoose.model("Poll", pollSchema);
