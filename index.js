require("dotenv").config();

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
const adminRoutes = require("./routes/adminRoutes");
const dashboardRouter = require("./routes/dashboardRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");
const adminFamilyRoutes = require("./routes/adminFamilyRoutes");
const adminFinanceRoutes = require("./routes/adminFinanceRoutes");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 5e7,
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

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
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/dashboard", dashboardRouter);
app.use("/api/v1/admin-user", adminUserRoutes);
app.use("/api/v1/admin-family", adminFamilyRoutes);
app.use("/api/v1/admin-finance", adminFinanceRoutes);

//dashboardRoutes
app.get("/", (req, res) => {
  res.send("Kindred Auth Server Running 🚀");
});

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

io.on("connection", (socket) => {
  console.log(`👤 User Connected: ${socket.id}`);

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
  socket.on("join_room", async (data) => {
    console.log("📥 JOIN_ROOM REQUEST:", JSON.stringify(data, null, 2));

    const { uuid, userId } = data;
    if (!uuid) {
      console.log("⚠️ JOIN_ROOM FAILED: Missing uuid");
      return;
    }

    socket.join(uuid);
    console.log(`🏠 Socket ${socket.id} joined room: ${uuid}`);

    try {
      const updateResult = await Message.updateMany(
        { roomUuid: uuid, receiverId: userId, isRead: false },
        { $set: { isRead: true } }
      );
      console.log(
        "📖 MESSAGES MARKED READ:",
        JSON.stringify(updateResult, null, 2)
      );

      const history = await Message.find({ roomUuid: uuid })
        .sort({ timestamp: 1 })
        .lean();

      const mappedHistory = history.map((msg) => {
        // Logic to ensure images and voice notes have their URLs mapped correctly
        const isImage = msg.messageType === "image";
        const isVoice = msg.messageType === "voice";

        return {
          uuid: msg.messageUuid || msg.uuid,
          message: msg.message,
          senderName: msg.senderName,
          senderId: msg.senderId,
          timestamp: msg.timestamp
            ? msg.timestamp.toISOString()
            : new Date().toISOString(),
          messageType: msg.messageType || "text",

          // Validation: If it's an image, we try to find the URL in imageuri or mediaUri
          imageuri: isImage
            ? msg.imageuri || msg.mediaUri || undefined
            : undefined,

          // Validation: Same logic for voice notes
          audioUri: isVoice
            ? msg.audioUri || msg.mediaUri || undefined
            : undefined,

          videouri: msg.videouri || "",
          duration: msg.duration || 0,
          status: "sent",
        };
      });

      // --- CRITICAL VALIDATION LOG ---
      const imageStatus = mappedHistory
        .filter((m) => m.messageType === "image")
        .map((img) => ({
          uuid: img.uuid,
          hasUrl: !!img.imageuri,
          url: img.imageuri,
        }));

      if (imageStatus.length > 0) {
        console.log(
          "🖼️ IMAGE HISTORY VALIDATION:",
          JSON.stringify(imageStatus, null, 2)
        );
      }

      console.log(`📤 LOAD_MESSAGES (Count: ${mappedHistory.length})`);
      socket.emit("load_messages", mappedHistory);

      const readUpdate = { roomUuid: uuid, readerId: userId };
      io.to(uuid).emit("messages_marked_read", readUpdate);
    } catch (err) {
      console.error("❌ Error joining room:", err);
    }
  });
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

        // UPLOAD TO BACKBLAZE
        const uploadedUrl = await uploadToBackblaze(
          fileBuffer,
          fileName,
          "chat_attachments"
        );

        if (messageType === "image") imageuri = uploadedUrl;
        else if (messageType === "video") videouri = uploadedUrl;
        else if (messageType === "voice") audioUri = uploadedUrl;

        // Log media upload success
        console.log(
          "✅ MEDIA UPLOADED:",
          JSON.stringify(
            {
              messageType,
              url: uploadedUrl,
              room: roomUuid,
            },
            null,
            2
          )
        );
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

      // DEBUG LOG: Verify the full object being sent to frontend
      console.log(
        "📤 OUTGOING MESSAGE:",
        JSON.stringify(messageToSend, null, 2)
      );

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
      console.error("❌ Error processing voice/media message:", err);
      socket.emit("message_error", {
        messageUuid,
        error: "Media upload failed",
      });
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

  socket.on("get_conversations", async ({ userId }) => {
    try {
      const conversations = await Message.aggregate([
        // 1. Filter messages involving the current user
        { $match: { $or: [{ senderId: userId }, { receiverId: userId }] } },

        // 2. Sort by newest first
        { $sort: { timestamp: -1 } },

        // 3. Group by the Room
        {
          $group: {
            _id: "$roomUuid",
            lastMessage: { $first: "$message" },
            timestamp: { $first: "$timestamp" },

            // ID of the person who is NOT you
            otherPersonId: {
              $first: {
                $cond: [
                  { $eq: ["$senderId", userId] },
                  "$receiverId",
                  "$senderId",
                ],
              },
            },

            latestSenderName: { $first: "$senderName" },
            profilePicture: { $first: "$receiverProfilePicture" },

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

        // 4. Convert string ID to ObjectId for lookup
        {
          $addFields: {
            otherPersonObjectId: { $toObjectId: "$otherPersonId" },
          },
        },

        // 5. Lookup the Other Person's details
        {
          $lookup: {
            from: "users",
            localField: "otherPersonObjectId",
            foreignField: "_id",
            as: "userDetails",
          },
        },

        {
          $unwind: {
            path: "$userDetails",
            preserveNullAndEmptyArrays: true,
          },
        },

        // 6. Project Final Shape - REMOVED "Family Member" check
        {
          $project: {
            _id: 1,
            lastMessage: 1,
            timestamp: 1,
            unreadCount: 1,
            profilePicture: 1,
            senderId: "$otherPersonId",
            receiverId: { $literal: userId },

            // ALWAYS return the other person's real name from the User collection
            senderName: {
              $cond: [
                { $ifNull: ["$userDetails", false] },
                {
                  $concat: [
                    "$userDetails.firstName",
                    " ",
                    "$userDetails.lastName",
                  ],
                },
                "$latestSenderName", // Fallback if user document is missing
              ],
            },
          },
        },

        { $sort: { timestamp: -1 } },
      ]);

      console.log(
        "📂 UPDATED INBOX DATA:",
        JSON.stringify(conversations, null, 2)
      );

      socket.emit("conversations_list", conversations);
    } catch (err) {
      console.error("❌ Error fetching conversations:", err);
    }
  });
  // 6. Typing Indicators
  socket.on("typing", (data) => {
    socket.to(data.uuid).emit("user_typing", {
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



  socket.on("start_call", ({ to, offer, fromName, fromId }) => {
    io.to(to).emit("incoming_call", { offer, fromName, fromId });
  });

  // 2. User answers a call
  socket.on("answer_call", ({ to, answer }) => {
    io.to(to).emit("call_answered", { answer });
  });

  // 3. Exchange ICE Candidates (Network info)
  socket.on("ice_candidate", ({ to, candidate }) => {
    io.to(to).emit("ice_candidate", { candidate });
  });

  // 4. Hang up
  socket.on("end_call", ({ to }) => {
    io.to(to).emit("call_ended");
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
