const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  roomUuid: { type: String, required: true,  },
  message: { type: String, required: true },
  senderName: { type: String, required: true },
  senderId: { type: String, required: true },
  receiverId: { type: String, required: true, }, // Added index for performance
  messageUuid: { type: String },
  isRead: { type: Boolean, default: false }, // New field
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Message", MessageSchema);

