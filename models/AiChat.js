const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const aiChatSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    family: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      required: true,
    },

    messages: [messageSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("AiChat", aiChatSchema);
