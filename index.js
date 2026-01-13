const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http"); // 1. Import http
const { Server } = require("socket.io"); // 2. Import Socket.io

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

require("dotenv").config();

const app = express();
const server = http.createServer(app); // 3. Create the HTTP server
const io = new Server(server, {
  cors: {
    origin: "*", // Adjust this in production for security
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

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

app.get("/", (req, res) => {
  res.send("Kindred Auth Server Running 🚀");
});

// --- SOCKET.IO LOGIC ---

// --- SOCKET.IO LOGIC ---

io.on("connection", (socket) => {
  console.log(`👤 User Connected: ${socket.id}`);

  // 1. Join Room & Load History + Mark as Read
  socket.on("join_room", async (data) => {
    const { uuid, fullName, userId } = data;
    if (!uuid) return;

    socket.join(uuid);

    try {
      // Update all messages in this room sent to ME as read
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
      // Notify the sender that their messages were read
      io.to(uuid).emit("messages_marked_read", {
        roomUuid: uuid,
        readerId: userId,
      });
    } catch (err) {
      console.error("❌ Error joining room:", err);
    }
  });

  // 2. Get Conversations with Unread Counts
  socket.on("get_conversations", async ({ userId }) => {
    try {
      const conversations = await Message.aggregate([
        // 1. Filter messages involving the current user
        { $match: { $or: [{ senderId: userId }, { receiverId: userId }] } },

        // 2. Sort by newest first so the group picks the latest message data
        { $sort: { timestamp: -1 } },

        // 3. Group by the Room
        {
          $group: {
            _id: "$roomUuid",
            lastMessage: { $first: "$message" },
            timestamp: { $first: "$timestamp" },
            senderName: { $first: "$senderName" },
            senderId: { $first: "$senderId" },
            receiverId: { $first: "$receiverId" },
            // Grab the profile picture from the latest message
            profilePicture: { $first: "$receiverProfilePicture" },

            // 4. Calculate unreadCount: Only count if I am the receiver and isRead is false
            unreadCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$receiverId", userId] },
                      { $eq: ["$isRead", false] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        // 5. Final sort to keep newest conversations at the top
        { $sort: { timestamp: -1 } },
      ]);

      socket.emit("conversations_list", conversations);
    } catch (err) {
      console.error("❌ Error fetching conversations:", err);
    }
  });
  // --- ADD THIS INSIDE io.on("connection") ---

  // User signals they are calling someone
  socket.on("call_user", (data) => {
    const { userToCall, signalData, from, fromName } = data;
    // Notify the specific receiver that someone is calling them
    io.emit(`incoming_call_${userToCall}`, {
      signal: signalData,
      from,
      fromName,
    });
  });

  // User answers the call
  socket.on("answer_call", (data) => {
    const { to, signal } = data;
    // Send the signal back to the original caller
    io.emit(`call_accepted_${to}`, { signal });
  });

  // Handle ICE Candidates (Connection path details)
  socket.on("ice_candidate", (data) => {
    const { to, candidate } = data;
    io.emit(`ice_candidate_${to}`, { candidate });
  });

  // End Call
  socket.on("end_call", (data) => {
    const { to } = data;
    io.emit(`call_ended_${to}`);
  });

  // 3. Send Message with Real-time Count Update
  // Inside io.on("connection", (socket) => { ...

  socket.on(
    "edit_message",
    async ({ uuid, messageUuid, newMessage, userId }) => {
      try {
        const msg = await Message.findOne({ messageUuid, senderId: userId });
        if (!msg) {
          return socket.emit("error", {
            message: "Message not found or not yours",
          });
        }

        const msgTime = new Date(msg.timestamp).getTime();
        const now = Date.now();
        if ((now - msgTime) / 60000 > 5) {
          return socket.emit("error", {
            message: "Edit time expired (5 minutes only)",
          });
        }

        msg.message = newMessage.trim();
        await msg.save();

        io.to(uuid).emit("message_edited", {
          uuid: messageUuid,
          newMessage: msg.message,
        });
      } catch (err) {
        console.error("Edit failed:", err);
        socket.emit("error", { message: "Failed to edit message" });
      }
    }
  );

  // Delete Message
  socket.on(
    "delete_message",
    async ({ uuid, messageUuid, userId, forEveryone }) => {
      try {
        const msg = await Message.findOne({ messageUuid });
        if (!msg) {
          return socket.emit("error", { message: "Message not found" });
        }

        const msgTime = new Date(msg.timestamp).getTime();
        const now = Date.now();
        if ((now - msgTime) / 60000 > 5) {
          return socket.emit("error", {
            message: "Delete time expired (5 minutes only)",
          });
        }

        if (forEveryone) {
          // Delete from database → everyone sees it gone
          await Message.deleteOne({ messageUuid });
          io.to(uuid).emit("message_deleted", { uuid: messageUuid });
        } else {
          // Only sender removes it from their view
          socket.emit("message_deleted", { uuid: messageUuid });
        }
      } catch (err) {
        console.error("Delete failed:", err);
        socket.emit("error", { message: "Failed to delete message" });
      }
    }
  );

  socket.on("send_message", async (data) => {
    const {
      uuid: roomUuid,
      message: textMessage,
      fullName: senderName,
      userId: senderId,
      receiverId,
      messageUuid,
      messageType = "text",
      mediaUri: base64Media, // Client still sends in mediaUri (base64)
      duration = 0,
      receiverProfilePicture = "",
    } = data;

    if (!roomUuid || !senderId || !receiverId || !messageUuid) {
      return socket.emit("error", { message: "Missing required fields" });
    }

    try {
      let imageuri = "";
      let videouri = "";
      let audioUri = "";

      // Upload only if it's media and base64 is provided
      if (base64Media && messageType !== "text") {
        const base64Data = base64Media.split(";base64,").pop();
        const fileBuffer = Buffer.from(base64Data, "base64");

        const extensionMap = {
          image: "jpg",
          video: "mp4",
          voice: "m4a",
        };
        const extension = extensionMap[messageType] || "bin";
        const fileName = `${messageType}s/${messageUuid}.${extension}`;

        const uploadedUrl = await uploadToBackblaze(
          fileBuffer,
          fileName,
          "chat_attachments"
        );

        // Assign to the correct field
        if (messageType === "image") imageuri = uploadedUrl;
        if (messageType === "video") videouri = uploadedUrl;
        if (messageType === "voice") audioUri = uploadedUrl;

        console.log(`Uploaded ${messageType}: ${uploadedUrl}`);
      }

      // Save message with separate fields
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

      // Send back to clients with separate fields
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

      // Update unread count
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

  socket.on("disconnect", () => {
    console.log("❌ User Disconnected");
  });
});
// --- DATABASE & SERVER START ---
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("🟢 MongoDB Connected"))
  .catch((err) => console.error("🔴 MongoDB Error:", err));

const PORT = process.env.PORT || 5000;
// 4. Use server.listen instead of app.listen
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
