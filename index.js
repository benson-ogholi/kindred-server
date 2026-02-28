const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const authRoutes = require("./routes/auth");
const familiesRoutes = require("./routes/family");
const featuresRoutes = require("./routes/features");
const newsRoutes = require("./routes/news.routes");
const taskRoutes = require("./routes/task");
const reportsRoutes = require("./routes/report");
const suggestionsRoutes = require("./routes/suggestionRoutes");
const pollRoutes = require("./routes/poll");
const notificationsRoutes = require("./routes/notificationRoutes");
const userRoutes = require("./routes/userRoutes");
const donationsRoutes = require("./routes/donationCampaign.routes");
const Message = require("./models/Message");
const contentRoutes = require("./routes/familyContent");
const { uploadToBackblaze } = require("./utils/uploadToBackblaze");
const familyMembers = require("./routes/familyMembers");
const User = require("./models/User");
const SafetyNet = require("./routes/safetyNet");

require("dotenv").config();

const app = express();
const server = http.createServer(app);

// --- 1. CRITICAL FIX: PAYLOAD SIZE ---
// maxHttpBufferSize prevents disconnects when sending large Base64 images
const io = new Server(server, {
  maxHttpBufferSize: 5e7, // 50MB
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// --- ROUTES ---
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/families", familiesRoutes);
app.use("/api/v1/features", featuresRoutes);
app.use("/api/v1/news", newsRoutes);
app.use("/api/v1/tasks", taskRoutes);
app.use("/api/v1/reports", reportsRoutes);
app.use("/api/v1/suggestions", suggestionsRoutes);
app.use("/api/v1/polls", pollRoutes);
app.use("/api/v1/notifications", notificationsRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/donations", donationsRoutes);
app.use("/api/v1/family-content", contentRoutes);
app.use("/api/v1/family-members", familyMembers);
app.use("/api/v1/safety-net", SafetyNet);

app.get("/", (req, res) => {
  res.send("Kindred Auth Server Running 🚀");
});

// Helper for default text
function getDefaultMessage(type) {
  switch (type) {
    case "image":
      return "Photo";
    case "video":
      return "Video";
    case "voice":
      return "Voice Note";
    default:
      return "Message";
  }
}

// --- SOCKET.IO LOGIC ---
io.on("connection", (socket) => {
  console.log(`👤 User Connected: ${socket.id}`);

  // 1. User Presence Registration
  socket.on("register_user", async ({ userId }) => {
    if (!userId) return;
    try {
      socket.userId = userId;
      const user = await User.findById(userId);
      if (!user) return;

      const wasOffline = !user.socketId;
      user.socketId = socket.id;
      if (wasOffline) user.isOnline = true;

      await user.save();
      console.log(`🟢 User ${userId} registered online`);
    } catch (err) {
      console.error("Error registering user:", err);
    }
  });

  // 2. Room Join & History
  socket.on("join_room", async (data) => {
    const { uuid, userId } = data;
    if (!uuid) return;

    socket.join(uuid);

    try {
      // Mark messages as read when entering room
      await Message.updateMany(
        { roomUuid: uuid, receiverId: userId, isRead: false },
        { $set: { isRead: true } }
      );

      const history = await Message.find({ roomUuid: uuid })
        .sort({ timestamp: 1 })
        .lean();

      socket.emit(
        "load_messages",
        history.map((msg) => ({
          uuid: msg.messageUuid,
          message: msg.message,
          senderName: msg.senderName,
          senderId: msg.senderId,
          timestamp: msg.timestamp.toISOString(),
          messageType: msg.messageType,
          imageuri: msg.imageuri,
          videouri: msg.videouri,
          audioUri: msg.audioUri,
          duration: msg.duration,
          status: "sent",
        }))
      );

      io.to(uuid).emit("messages_marked_read", {
        roomUuid: uuid,
        readerId: userId,
      });
    } catch (err) {
      console.error("❌ Error joining room:", err);
    }
  });

  // 3. Send Message (Fixed Buffer Logic)
  socket.on("send_message", async (data) => {
    const {
      uuid: roomUuid,
      message: textMessage,
      fullName: senderName,
      userId: senderId,
      receiverId,
      messageUuid,
      messageType = "text",
      mediaUri: base64Media,
      duration = 0,
      receiverProfilePicture = "",
    } = data;

    if (!roomUuid || !senderId || !receiverId || !messageUuid) {
      return socket.emit("error", { message: "Missing required fields" });
    }

    try {
      let imageuri = "",
        videouri = "",
        audioUri = "";

      if (base64Media && messageType !== "text") {
        const parts = base64Media.split(";base64,");
        const base64Data = parts.length > 1 ? parts.pop() : parts[0];
        const fileBuffer = Buffer.from(base64Data, "base64");

        const extensionMap = { image: "jpg", video: "mp4", voice: "m4a" };
        const extension = extensionMap[messageType] || "bin";
        const fileName = `${messageType}s/${messageUuid}.${extension}`;

        const uploadedUrl = await uploadToBackblaze(
          fileBuffer,
          fileName,
          "chat_attachments"
        );

        if (messageType === "image") imageuri = uploadedUrl;
        else if (messageType === "video") videouri = uploadedUrl;
        else if (messageType === "voice") audioUri = uploadedUrl;
      }

      const newMessage = new Message({
        roomUuid,
        message: textMessage || getDefaultMessage(messageType),
        senderName,
        senderId,
        receiverId,
        messageUuid,
        messageType,
        imageuri,
        videouri,
        audioUri,
        duration,
        receiverProfilePicture,
        timestamp: new Date(),
        isRead: false,
      });

      await newMessage.save();

      const messageToSend = {
        uuid: messageUuid,
        message: newMessage.message,
        senderName: newMessage.senderName,
        senderId: newMessage.senderId,
        timestamp: newMessage.timestamp.toISOString(),
        messageType: newMessage.messageType,
        imageuri: newMessage.imageuri,
        videouri: newMessage.videouri,
        audioUri: newMessage.audioUri,
        duration: newMessage.duration,
      };

      io.to(roomUuid).emit("receive_message", messageToSend);

      const unreadCount = await Message.countDocuments({
        receiverId,
        isRead: false,
      });
      io.to(roomUuid).emit("unread_update", {
        roomUuid,
        unreadCount,
        lastMessage: newMessage.message,
      });
    } catch (err) {
      console.error("Error sending message:", err);
      socket.emit("message_error", { messageUuid, error: "Failed to send" });
    }
  });

  // 4. Edit Message
  socket.on(
    "edit_message",
    async ({ uuid, messageUuid, newMessage, userId }) => {
      try {
        const msg = await Message.findOne({ messageUuid, senderId: userId });
        if (!msg) return socket.emit("error", { message: "Access denied" });

        const minutesPassed =
          (Date.now() - new Date(msg.timestamp).getTime()) / 60000;
        if (minutesPassed > 5)
          return socket.emit("error", { message: "Time limit exceeded" });

        msg.message = newMessage.trim();
        await msg.save();

        io.to(uuid).emit("message_edited", {
          uuid: messageUuid,
          newMessage: msg.message,
        });
      } catch (err) {
        console.error("Edit failed:", err);
      }
    }
  );

  // 5. Delete Message
  socket.on(
    "delete_message",
    async ({ uuid, messageUuid, userId, forEveryone }) => {
      try {
        const msg = await Message.findOne({ messageUuid });
        if (!msg) return;

        if (forEveryone && msg.senderId === userId) {
          await Message.deleteOne({ messageUuid });
          io.to(uuid).emit("message_deleted", { uuid: messageUuid });
        } else {
          socket.emit("message_deleted", { uuid: messageUuid });
        }
      } catch (err) {
        console.error("Delete failed:", err);
      }
    }
  );

  // 6. Typing Indicators
  socket.on("typing", (data) => {
    socket
      .to(data.uuid)
      .emit("user_typing", {
        roomUuid: data.uuid,
        name: data.fullName,
        isTyping: true,
      });
  });

  socket.on("stop_typing", (data) => {
    socket
      .to(data.uuid)
      .emit("user_typing", { roomUuid: data.uuid, isTyping: false });
  });

  // 7. Calling Logic (WebRTC)
  socket.on("call_user", (data) => {
    const { userToCall, signalData, from, fromName } = data;
    io.emit(`incoming_call_${userToCall}`, {
      signal: signalData,
      from,
      fromName,
    });
  });

  socket.on("answer_call", (data) => {
    const { to, signal } = data;
    io.emit(`call_accepted_${to}`, { signal });
  });

  // 8. Disconnect Handler
  socket.on("disconnect", async () => {
    try {
      const user = await User.findOne({ socketId: socket.id });
      if (user) {
        user.socketId = null;
        user.isOnline = false;
        await user.save();
        console.log(`🔴 User ${user._id} offline`);
      }
    } catch (err) {
      console.error("Disconnect error:", err);
    }
  });
});

// --- DATABASE & SERVER START ---
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("🟢 MongoDB Connected"))
  .catch((err) => console.error("🔴 MongoDB Error:", err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
