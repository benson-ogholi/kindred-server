const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  roomUuid: {
    type: String,
    required: true,
    index: true,
  },
  message: {
    type: String,
    required: true,
  },
  senderName: {
    type: String,
    required: true,
  },
  senderId: {
    type: String,
    required: true,
    index: true,
  },
  receiverId: {
    type: String,
    required: true,
    index: true,
  },
  messageUuid: {
    type: String,
    unique: true,
  },
  messageType: {
    type: String,
    enum: ["text", "voice", "image", "video", "call"],
    default: "text",
  },
  imageuri: {
    type: String,
    default: "",
  },
  videouri: {
    type: String,
    default: "",
  },
  audioUri: {
    type: String,
    default: "",
  },
  duration: {
    type: Number,
    default: 0, // voice note length, or call length for messageType "call"
  },
  // Only for messageType "call" (set by index.js's createCallMessage). Was
  // previously read by `get_calls` but never stored, so every call showed
  // as "ended".
  callStatus: {
    type: String,
    enum: ["missed", "ended", "rejected"],
  },
  callType: {
    type: String,
    enum: ["audio", "video"],
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  receiverProfilePicture: {
    type: String,
    default: "",
  },
  senderProfilePicture: {
    type: String,
    default: "",
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Indexes for performance
MessageSchema.index({ roomUuid: 1, timestamp: -1 });
MessageSchema.index({ receiverId: 1, isRead: 1 });

module.exports = mongoose.model("Message", MessageSchema);
