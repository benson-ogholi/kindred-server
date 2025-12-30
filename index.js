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
          uuid: msg.messageUuid || msg._id.toString(),
          message: msg.message,
          senderName: msg.senderName,
          senderId: msg.senderId,
          timestamp: msg.timestamp,
          isRead: msg.isRead,
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
        { $match: { $or: [{ senderId: userId }, { receiverId: userId }] } },
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: "$roomUuid",
            lastMessage: { $first: "$message" },
            timestamp: { $first: "$timestamp" },
            senderName: { $first: "$senderName" },
            senderId: { $first: "$senderId" },
            // Calculate unread count for messages where I am the receiver
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
        { $sort: { timestamp: -1 } },
      ]);
      socket.emit("conversations_list", conversations);
    } catch (err) {
      console.error("Error fetching conversations:", err);
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
  socket.on("send_message", async (data) => {
    const { uuid, message, fullName, userId, receiverId, messageUuid } = data;

    try {
      const newMessage = new Message({
        roomUuid: uuid,
        message,
        senderName: fullName,
        senderId: userId,
        receiverId,
        messageUuid: messageUuid || uuid,
        isRead: false,
        timestamp: new Date(),
      });
      await newMessage.save();

      // Emit the message to the room
      io.to(uuid).emit("receive_message", {
        uuid: messageUuid || newMessage._id.toString(),
        message,
        senderName: fullName,
        senderId: userId,
        timestamp: newMessage.timestamp,
      });

      // Fetch the new total unread count for the receiver globally
      const globalUnreadCount = await Message.countDocuments({
        receiverId: receiverId,
        isRead: false,
      });

      // Send a notification to the receiver's private channel
      io.emit(`unread_update_${receiverId}`, {
        roomUuid: uuid,
        totalUnread: globalUnreadCount,
        lastMessage: message,
      });
    } catch (err) {
      console.error("❌ Error saving message:", err);
    }
  });

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
