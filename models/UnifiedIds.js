const mongoose = require("mongoose");

const UnifiedIdsSchema = new mongoose.Schema(
  {
    users: {
      type: [mongoose.Schema.Types.ObjectId],
      required: true,
      index: true,
    },
    unifiedId: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { timestamps: true }
);

UnifiedIdsSchema.pre("save", async function () {
  this.users.sort(); // 🔒 order safety
});

module.exports = mongoose.model("UnifiedIds", UnifiedIdsSchema);