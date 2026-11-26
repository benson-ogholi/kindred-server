const mongoose = require("mongoose");

const HistoryEntrySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    stars: { type: Number, default: 0 },
    credits: { type: Number, default: 0 },
    relatedId: { type: mongoose.Schema.Types.ObjectId },
    familyId: { type: mongoose.Schema.Types.ObjectId, ref: "Family" },
  },
  { timestamps: true, _id: false }
);

const GamificationAccountSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    stars: { type: Number, default: 0, min: 0 },
    credits: { type: Number, default: 0, min: 0 },
    // Bounded activity log (most recent 200 entries) — enough for an
    // "activity feed" UI without the document growing unbounded.
    history: [HistoryEntrySchema],
  },
  { timestamps: true }
);

GamificationAccountSchema.index({ stars: -1 });
GamificationAccountSchema.index({ credits: -1 });

module.exports = mongoose.model("GamificationAccount", GamificationAccountSchema);
