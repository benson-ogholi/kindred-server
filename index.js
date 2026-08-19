require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const RequestingMessage = require("./models/padiman_utility_models/RequestingMessage");
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
const aiAnalysisRoutes = require("./routes/aiAnalysis");
const SafetyNet = require("./routes/safetyNet");
const adminRoutes = require("./routes/adminRoutes");
const dashboardRouter = require("./routes/dashboardRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");
const adminFamilyRoutes = require("./routes/adminFamilyRoutes");
const adminFinanceRoutes = require("./routes/adminFinanceRoutes");
const pr_auth = require("./routes/pr/pr.auth.router");
const pr_user = require("./routes/pr/pr.user.router");
const pr_parcel = require("./routes/pr/pr.parcel.router");
const pr_parcel_requester = require("./routes/pr/pr.parcel.requester");
const pr_rider_offer = require("./routes/pr/pr.ride.offer.router");
const pr_negs = require("./routes/pr/pr.negotiation.router");
const NegotiationMessage = require("./models/padiman_route_models/NegotiationMessage");
const pr_pay = require("./routes/pr/payment.routes");
const pr_notify = require("./routes/pr/pr.notification.router");
const pr_wallet = require("./routes/pr/pr.wallet");
const pr_driver = require("./routes/pr/pr.driver.router");
const pr_admin = require("./routes/pr/admin.auth.router");
const pr_admin_data = require("./routes/pr/admin");
const { sendNotification } = require("./utils/pr/pr_push");
const Negotiation = require("./models/padiman_route_models/Negotiation");
const pru_auth = require("./routes/padiman_utility/PRUtilityRoutes");
const pru_asset = require("./routes/padiman_utility/asset");
const pru_sales = require("./routes/padiman_utility/sale");
const pru_found = require("./routes/padiman_utility/lostAndFound");
const pr_requests = require("./routes/pr/pr.request.router");
const pru_works = require("./routes/padiman_utility/pru.works.router");
const pru_hire_equipment = require("./routes/padiman_utility/pru.hire.equipment");
const pru_requesting = require("./routes/padiman_utility/pru.requesting.routes");
const pru_payment = require("./routes/padiman_utility/pru.payments");
const pru_wallet = require("./routes/padiman_utility/pru.wallet.route");
const Request = require("./models/padiman_route_models/Request");
const STATUS_COPY = require("./constants/pr/statusCopy");
const pru_home = require("./routes/padiman_utility/pru.home.routes");
const { sendPushNotificationToUser } = require("./utils/notifyUser");
const { protect, checkStatus } = require("./middlewares/authMiddleware");
const cooperative_auth = require("./routes/cooperative/authRoutes");
const cooperative_admin = require("./routes/cooperative/adminRoutes");
const cooperative_dividends = require("./routes/cooperative/dividendRoutes");
const cooperative_loans = require("./routes/cooperative/loanRoutes");
const cooperative_savings = require("./routes/cooperative/savingsRoutes");
const cooperative_wallet = require("./routes/cooperative/walletRoutes");
const cooperative_payments = require('./routes/cooperative/cooperativePaymentRouter')
const cooperative_requests = require('./routes/cooperative/cooperativeRequestRoutes')


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
app.use("/api/v1/ai", protect, checkStatus, aiAnalysisRoutes);

app.use("/api/v1/padiman_route/auth", pr_auth);
app.use("/api/v1/padiman_route/user", pr_user);
app.use("/api/v1/padiman_route/send_a_delivery", pr_parcel);
app.use("/api/v1/padiman_route/deliver_a_delivery", pr_parcel_requester);
app.use("/api/v1/padiman_route/ride-offers", pr_rider_offer);
app.use("/api/v1/padiman_route/negs", pr_negs);
app.use("/api/v1/padiman_route/payments", pr_pay);
app.use("/api/v1/padiman_route/notifications", pr_notify);
app.use("/api/v1/padiman_route/wallet", pr_wallet);
app.use("/api/v1/padiman_route/driver", pr_driver);
app.use("/api/v1/padiman_route/admin", pr_admin);
app.use("/api/v1/padiman_route/admin/data", pr_admin_data);
app.use("/api/v1/pru/home", pru_home);

app.use(
  "/api/v1/padiman_route/types/requests",
  (req, res, next) => {
    console.log(
      `📡 [Incoming Request] ${req.method} /api/v1/padiman_route/types/requests`,
      req.body
    );
    next();
  },
  pr_requests
);

app.use("/api/v1/pru/auth/", pru_auth);
app.use("/api/v1/pru/assest/", pru_asset);
app.use("/api/v1/pru/sales/", pru_sales);
app.use("/api/v1/pru/lost-found", pru_found);
app.use("/api/v1/pru/works", pru_works);
app.use("/api/v1/pru/hire-equipment", pru_hire_equipment);
app.use("/api/v1/pru/requesting", pru_requesting);
app.use("/api/v1/pru/payments", pru_payment);
app.use("/api/v1/pru/wallet", pru_wallet);

/* ==================== COOPERATIVE MODULE ROUTES ==================== */
app.use("/api/v1/cooperative/auth", cooperative_auth);
app.use("/api/v1/cooperative/admin", cooperative_admin);
app.use("/api/v1/dividends", cooperative_dividends);
app.use("/api/v1/loans", cooperative_loans);
app.use("/api/v1/savings", cooperative_savings);
app.use("/api/v1/wallet", cooperative_wallet);
app.use("/api/v1/cooperative/payment", cooperative_payments);
app.use("/api/v1/cooperative/requests", cooperative_requests);




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

const rooms = new Map();

// Shared maps for presence & calls (one instance for the whole server)
const onlineUsers = new Map(); // userId -> socketId
const activeCalls = new Map(); // roomId -> call info

io.on("connection", (socket) => {
  console.log(`👤 [Connection] User Connected: ${socket.id}`);

  const getCleanId = (id) => {
    if (!id) return null;
    if (typeof id === "string") return id.trim();
    if (typeof id === "object" && id !== null) {
      return (
        id.id ||
        id._id ||
        id.negotiationId ||
        id.negotiation?.id ||
        id.negotiation?._id ||
        String(id)
      );
    }
    return String(id).trim();
  };

  const formatMessageTime = (date) => {
    if (!date) return "";
    return new Date(date).toLocaleTimeString("en-NG", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  // =========================================================
  // === PADIMAN ROUTE (PR) NEGOTIATION CHAT
  // =========================================================

  socket.on("join-pr-chat", async ({ negotiationId, userPayload }) => {
    console.log(
      `📥 [join-pr-chat] Socket ${socket.id} requesting to join negotiation:`,
      negotiationId
    );
    console.log(`👤 [join-pr-chat] User payload received:`, userPayload);

    if (!negotiationId || !mongoose.Types.ObjectId.isValid(negotiationId)) {
      console.error(
        `❌ [join-pr-chat] Invalid Negotiation ID provided: ${negotiationId}`
      );
      return socket.emit("error", { message: "Invalid negotiation ID format" });
    }

    if (!userPayload?.id && !userPayload?._id) {
      console.error(`❌ [join-pr-chat] Missing user ID in userPayload`);
      return socket.emit("error", { message: "userPayload with id required" });
    }

    socket.join(negotiationId);

    if (!rooms.has(negotiationId)) {
      rooms.set(negotiationId, { users: new Map(), messages: [] });
      console.log(
        `🏠 [join-pr-chat] Created new room structure in memory for: ${negotiationId}`
      );
    }

    const room = rooms.get(negotiationId);
    room.users.set(socket.id, userPayload);

    try {
      console.log(
        `⏳ [join-pr-chat] Fetching messages for negotiation: ${negotiationId}...`
      );
      const allMessages = await NegotiationMessage.find({
        negotiation: negotiationId,
      })
        .sort({ createdAt: 1 })
        .populate("sender", "name fullName email profileImage");

      console.log(
        `✅ [join-pr-chat] Retrieved ${allMessages.length} messages from DB.`
      );

      const formattedMessages = allMessages.map((msg) => ({
        id: msg._id?.toString(),
        negotiation: msg.negotiation.toString(),
        sender: msg.sender,
        text: msg.text,
        type: msg.type || "text",
        meta: msg.meta || {},
        attachments: msg.attachments || [],
        isRead: msg.isRead || false,
        isPriceSet: msg.isPriceSet || false,
        price: msg.price || 0,
        readBy: msg.readBy || [],
        timestamp: msg.createdAt,
        time: formatMessageTime(msg.createdAt),
      }));

      socket.emit("room-joined", {
        users: Array.from(room.users.values()),
        messages: formattedMessages,
      });
      console.log(
        `✅ [join-pr-chat] Emitted 'room-joined' to socket ${socket.id} with history.`
      );

      socket.to(negotiationId).emit("user-joined", { userPayload });
      console.log(
        `✅ [join-pr-chat] Broadcasted 'user-joined' to room ${negotiationId}.`
      );
    } catch (error) {
      console.error("❌ [join-pr-chat] Error joining chat:", error);
      socket.emit("error", { message: "Failed to join chat room" });
    }
  });

  socket.on("pr-chat-message", async (payload) => {
    console.log(
      `📥 [pr-chat-message] Received message payload from sender: ${payload.senderId}`
    );
    console.log(
      `📄 [pr-chat-message] Payload text: "${payload.text}", priceSet: ${payload.isPriceSet}, price: ${payload.price}`
    );

    try {
      const {
        negotiation,
        text,
        attachments,
        senderId,
        price,
        isPriceSet,
        clientId,
      } = payload;

      const cleanNegotiationId = getCleanId(negotiation);

      let finalMessageText = text ? text.trim() : "";
      if (!finalMessageText && isPriceSet && Number(price) > 0) {
        finalMessageText = `A counter offer of ₦${Number(
          price
        ).toLocaleString()} was made.`;
        console.log(
          `📝 [pr-chat-message] Auto-generated price offer text: ${finalMessageText}`
        );
      }
      if (!finalMessageText) {
        finalMessageText = "Counter offer details attached.";
      }

      console.log(
        `⏳ [pr-chat-message] Saving new message to DB for negotiation: ${cleanNegotiationId}...`
      );
      const newMessage = await NegotiationMessage.create({
        negotiation: cleanNegotiationId,
        sender: senderId,
        text: finalMessageText,
        attachments: attachments || [],
        price: price || 0,
        isPriceSet: isPriceSet || false,
        isRead: false,
        type: isPriceSet ? "price" : "text",
      });

      const populatedMessage = await newMessage.populate(
        "sender",
        "name fullName email profileImage"
      );

      console.log(
        `✅ [pr-chat-message] Message saved with ID: ${populatedMessage._id.toString()}`
      );

      const messageToSend = {
        id: populatedMessage._id.toString(),
        negotiation: cleanNegotiationId,
        sender: populatedMessage.sender,
        text: populatedMessage.text,
        type: populatedMessage.type || "text",
        attachments: populatedMessage.attachments,
        isRead: populatedMessage.isRead,
        isPriceSet: populatedMessage.isPriceSet,
        price: populatedMessage.price,
        readBy: populatedMessage.readBy,
        timestamp: populatedMessage.createdAt,
        time: formatMessageTime(populatedMessage.createdAt),
        clientId,
      };

      io.to(cleanNegotiationId).emit("pr-chat-message", messageToSend);
      console.log(
        `✅ [pr-chat-message] Emitted 'pr-chat-message' to room ${cleanNegotiationId}`
      );

      console.log(`⏳ [pr-chat-message] Triggering push notification...`);
      await sendChatNotification(
        cleanNegotiationId,
        populatedMessage,
        senderId
      );
    } catch (error) {
      console.error("❌ [pr-chat-message] Error sending message:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  socket.on("pr-agree-price", async ({ messageId, negotiationId, price }) => {
    console.log(
      `📥 [pr-agree-price] Received price agreement for negotiation: ${negotiationId} | Price: ₦${price}`
    );
    try {
      const cleanNegotiationId = getCleanId(negotiationId);

      console.log(`⏳ [pr-agree-price] Updating negotiation DB record...`);
      const updatedNegotiation = await Negotiation.findByIdAndUpdate(
        cleanNegotiationId,
        { isPriceSet: true, price: price },
        { new: true }
      );

      io.to(cleanNegotiationId).emit("price-agreed", {
        messageId,
        negotiationId: cleanNegotiationId,
        price,
        updatedNegotiation,
      });

      console.log(
        `✅ [pr-agree-price] Price Agreed and broadcasted | Room: ${cleanNegotiationId} | Price: ₦${price}`
      );

      console.log(
        `⏳ [pr-agree-price] Triggering push notification for price agreement...`
      );
      await sendPriceAgreedNotification(cleanNegotiationId, price);
    } catch (error) {
      console.error("❌ [pr-agree-price] Error agreeing to price:", error);
      socket.emit("error", { message: "Failed to agree to price" });
    }
  });

  socket.on("pr-update-request-progress", async (payload) => {
    console.log(
      `📥 [pr-update-request-progress] Received status update payload:`,
      payload
    );
    try {
      const { requestId, negotiationId, status, currentLocation, senderId } =
        payload;

      if (!requestId || !mongoose.Types.ObjectId.isValid(requestId)) {
        console.error(
          `❌ [pr-update-request-progress] Valid requestId is missing or invalid: ${requestId}`
        );
        return socket.emit("error", { message: "Valid requestId is required" });
      }

      console.log(
        `⏳ [pr-update-request-progress] Finding request by ID: ${requestId}...`
      );
      const requestItem = await Request.findById(requestId);
      if (!requestItem) {
        console.error(
          `❌ [pr-update-request-progress] Request not found for ID: ${requestId}`
        );
        return socket.emit("error", { message: "Request not found" });
      }

      const statusActuallyProvided = Boolean(status);

      if (status) requestItem.status = status;
      if (currentLocation !== undefined)
        requestItem.currentLocation = currentLocation;

      await requestItem.save();
      console.log(
        `✅ [pr-update-request-progress] Updated parent request status to: ${
          status || "unchanged"
        }, location: ${currentLocation || "unchanged"}`
      );

      const queryIdentifiers = [
        requestId,
        requestItem._id.toString(),
        requestItem.inRideWith,
        requestItem.assignedTo,
      ].filter(Boolean);

      const updateFields = {};
      if (status) updateFields.status = status;
      if (currentLocation !== undefined)
        updateFields.currentLocation = currentLocation;

      if (Object.keys(updateFields).length > 0) {
        console.log(
          `⏳ [pr-update-request-progress] Syncing linked requests with identifiers:`,
          queryIdentifiers
        );
        const updateResult = await Request.updateMany(
          {
            _id: { $ne: requestItem._id },
            $or: [
              { inRideWith: { $in: queryIdentifiers } },
              { assignedTo: { $in: queryIdentifiers } },
            ],
          },
          { $set: updateFields }
        );
        console.log(
          `✅ [pr-update-request-progress] Synced ${updateResult.modifiedCount} linked request(s).`
        );
      }

      const cleanNegotiationId = getCleanId(negotiationId);

      let systemText = null;
      if (statusActuallyProvided) {
        systemText = `Status updated to "${status.replace(/_/g, " ")}"`;
      }
      if (currentLocation) {
        systemText = systemText
          ? `${systemText} • Location: ${currentLocation}`
          : `Location updated: ${currentLocation}`;
      }

      let messageToSend = null;

      if (
        systemText &&
        cleanNegotiationId &&
        mongoose.Types.ObjectId.isValid(cleanNegotiationId)
      ) {
        console.log(
          `⏳ [pr-update-request-progress] Creating inline status message in negotiation chat...`
        );
        const newMessage = await NegotiationMessage.create({
          negotiation: cleanNegotiationId,
          sender: senderId,
          text: systemText,
          type: "status",
          meta: { status, currentLocation, requestId },
          isRead: false,
        });

        const populatedMessage = await newMessage.populate(
          "sender",
          "name fullName email profileImage"
        );

        messageToSend = {
          id: populatedMessage._id.toString(),
          negotiation: cleanNegotiationId,
          sender: populatedMessage.sender,
          text: populatedMessage.text,
          type: populatedMessage.type,
          meta: populatedMessage.meta,
          isRead: populatedMessage.isRead,
          readBy: populatedMessage.readBy,
          timestamp: populatedMessage.createdAt,
          time: formatMessageTime(populatedMessage.createdAt),
        };

        io.to(cleanNegotiationId).emit("pr-chat-message", messageToSend);
        console.log(
          `✅ [pr-update-request-progress] Emitted status as inline chat message to room ${cleanNegotiationId}`
        );
      } else {
        console.log(
          `⚠️ [pr-update-request-progress] Skipped creating chat message — no systemText or invalid/missing negotiationId.`,
          { systemText, cleanNegotiationId }
        );
      }

      io.to(cleanNegotiationId || requestId).emit("request-progress-updated", {
        requestId: requestItem._id.toString(),
        status: requestItem.status,
        currentLocation: requestItem.currentLocation,
        message: messageToSend,
      });
      console.log(
        `✅ [pr-update-request-progress] Emitted 'request-progress-updated' event.`
      );

      if (statusActuallyProvided) {
        console.log(
          `⏳ [pr-update-request-progress] Status provided. Checking STATUS_COPY for push notification...`
        );
        const copy = STATUS_COPY[requestItem.status];
        if (copy) {
          sendNotification(requestItem.userId, {
            title: copy.title,
            body: copy.body,
            type: "REQUEST_STATUS_CHANGED",
            router: "/(screens)/order",
            data: {
              requestId: requestItem._id.toString(),
              requestType: requestItem.type,
              status: requestItem.status,
            },
          })
            .then(() => {
              console.log(
                `✅ [pr-update-request-progress] Push notification sent for status change.`
              );
            })
            .catch((err) =>
              console.error(
                "⚠️ [pr-update-request-progress] sendNotification (socket progress update) failed:",
                err
              )
            );
        } else {
          console.log(
            `⚠️ [pr-update-request-progress] No STATUS_COPY found for status: ${requestItem.status}`
          );
        }
      }
    } catch (error) {
      console.error(
        "❌ [pr-update-request-progress] Error updating request progress via socket:",
        error
      );
      socket.emit("error", { message: "Failed to update request progress" });
    }
  });

  // =========================================================
  // === HELPERS (PR notifications)
  // =========================================================

  const sendChatNotification = async (
    negotiationId,
    populatedMessage,
    senderId
  ) => {
    try {
      console.log(
        `⏳ [sendChatNotification] Fetching negotiation details for notification...`
      );
      const negotiationDoc = await Negotiation.findById(negotiationId)
        .populate("negotiator", "fullName")
        .populate("serviceProvider", "fullName")
        .lean();

      if (!negotiationDoc) {
        console.error(
          `❌ [sendChatNotification] Negotiation not found for ID: ${negotiationId}`
        );
        return;
      }

      const senderObjectId = new mongoose.Types.ObjectId(senderId);
      let receiverId = null;

      if (
        negotiationDoc.negotiator &&
        !senderObjectId.equals(negotiationDoc.negotiator._id)
      ) {
        receiverId = negotiationDoc.negotiator._id;
      } else if (
        negotiationDoc.serviceProvider &&
        !senderObjectId.equals(negotiationDoc.serviceProvider._id)
      ) {
        receiverId = negotiationDoc.serviceProvider._id;
      }

      if (receiverId) {
        const senderName = populatedMessage.sender?.fullName || "Someone";
        const messagePreview =
          populatedMessage.text.substring(0, 60) +
          (populatedMessage.text.length > 60 ? "..." : "");

        console.log(
          `⏳ [sendChatNotification] Dispatching push notification to receiver: ${receiverId}`
        );
        await sendNotification(receiverId, {
          title: "New Message",
          body: `${senderName}: ${messagePreview}`,
          type: "CHAT",
          router: "/(features)/chat",
          data: {
            negotiationId: negotiationId,
            messageId: populatedMessage._id.toString(),
            senderId: senderId,
            isPriceOffer: populatedMessage.isPriceSet,
          },
        });
        console.log(
          `✅ [sendChatNotification] Push notification sent successfully.`
        );
      } else {
        console.log(
          `⚠️ [sendChatNotification] No valid receiver found to notify.`
        );
      }
    } catch (err) {
      console.error("❌ [sendChatNotification] Chat Notification Error:", err);
    }
  };

  const sendPriceAgreedNotification = async (negotiationId, price) => {
    try {
      console.log(`⏳ [sendPriceAgreedNotification] Fetching negotiation...`);
      const negotiationDoc = await Negotiation.findById(negotiationId)
        .populate("negotiator", "fullName")
        .populate("serviceProvider", "fullName")
        .lean();

      if (!negotiationDoc) {
        console.error(
          `❌ [sendPriceAgreedNotification] Negotiation not found.`
        );
        return;
      }

      const receivers = [
        negotiationDoc.negotiator?._id,
        negotiationDoc.serviceProvider?._id,
      ].filter(Boolean);

      console.log(
        `⏳ [sendPriceAgreedNotification] Sending to ${receivers.length} receivers...`
      );
      for (const receiverId of receivers) {
        await sendNotification(receiverId, {
          title: "Price Agreed! 🎉",
          body: `The price of ₦${Number(
            price
          ).toLocaleString()} has been accepted.`,
          type: "NEGOTIATION",
          router: "/(features)/chat",
          data: {
            negotiationId: negotiationId,
            price: price,
            status: "price_agreed",
          },
        });
      }
      console.log(
        `✅ [sendPriceAgreedNotification] Notifications successfully dispatched.`
      );
    } catch (err) {
      console.error(
        "❌ [sendPriceAgreedNotification] Price Agreement Notification Error:",
        err
      );
    }
  };

  // =========================================================
  // === U-SERVER (UTILITY) REQUESTING SOCKET EVENTS
  // =========================================================

  socket.on("u-join-request-chat", async ({ requestId, userPayload }) => {
    console.log(
      `📥 [u-join-request-chat] Socket ${socket.id} requesting to join Requesting chat:`,
      requestId
    );
    console.log(`👤 [u-join-request-chat] User payload received:`, userPayload);

    if (!requestId || !mongoose.Types.ObjectId.isValid(requestId)) {
      console.error(
        `❌ [u-join-request-chat] Invalid Request ID provided: ${requestId}`
      );
      return socket.emit("error", { message: "Invalid request ID format" });
    }

    if (!userPayload?.id && !userPayload?._id) {
      console.error(`❌ [u-join-request-chat] Missing user ID in userPayload`);
      return socket.emit("error", { message: "userPayload with id required" });
    }

    const userId = userPayload.id || userPayload._id;

    socket.join(requestId);
    console.log(
      `🔌 [u-join-request-chat] Socket ${socket.id} joined room: ${requestId}`
    );

    if (!rooms.has(requestId)) {
      rooms.set(requestId, { users: new Map(), messages: [] });
      console.log(
        `🏠 [u-join-request-chat] Created new room structure in memory for: ${requestId}`
      );
    }

    const room = rooms.get(requestId);
    room.users.set(socket.id, userPayload);
    console.log(
      `👥 [u-join-request-chat] Added user to room map. Current room user count: ${room.users.size}`
    );

    try {
      console.log(
        `⏳ [u-join-request-chat] Marking unread messages as read for user ${userId} in request: ${requestId}...`
      );

      await RequestingMessage.updateMany(
        {
          request: requestId,
          sender: { $ne: userId },
          readBy: { $ne: userId },
        },
        {
          $set: { isRead: true },
          $addToSet: { readBy: userId },
        }
      );

      console.log(
        `⏳ [u-join-request-chat] Fetching messages for Request: ${requestId}...`
      );
      const allMessages = await RequestingMessage.find({
        request: requestId,
      })
        .sort({ createdAt: 1 })
        .populate("sender", "name fullName email profileImage");

      console.log(
        `✅ [u-join-request-chat] Retrieved ${allMessages.length} messages from DB.`
      );

      const formattedMessages = allMessages.map((msg) => ({
        id: msg._id?.toString(),
        request: msg.request.toString(),
        sender: msg.sender,
        text: msg.text,
        type: msg.type || "text",
        meta: msg.meta || {},
        attachments: msg.attachments || [],
        isRead: msg.isRead || false,
        isPriceSet: msg.isPriceSet || false,
        price: msg.price || 0,
        readBy: msg.readBy || [],
        timestamp: msg.createdAt,
        time: formatMessageTime(msg.createdAt),
      }));
      console.log(
        `📋 [u-join-request-chat] Formatted ${formattedMessages.length} messages for client delivery.`
      );

      socket.emit("u-room-joined", {
        users: Array.from(room.users.values()),
        messages: formattedMessages,
      });
      console.log(
        `✅ [u-join-request-chat] Emitted 'u-room-joined' to socket ${socket.id} with history.`
      );

      socket.to(requestId).emit("u-user-joined", { userPayload });
      console.log(
        `✅ [u-join-request-chat] Broadcasted 'u-user-joined' to room ${requestId}.`
      );
    } catch (error) {
      console.error("❌ [u-join-request-chat] Error joining chat:", error);
      socket.emit("error", { message: "Failed to join requesting chat room" });
    }
  });

  socket.on("u-request-chat-message", async (payload) => {
    console.log(
      `📥 [u-request-chat-message] Received message payload from sender: ${payload.senderId}`
    );
    console.log(
      `📄 [u-request-chat-message] Payload text: "${payload.text}", priceSet: ${payload.isPriceSet}, price: ${payload.price}`
    );

    try {
      const {
        requestId,
        text,
        attachments,
        senderId,
        price,
        isPriceSet,
        clientId,
      } = payload;

      const cleanRequestId = getCleanId(requestId);
      console.log(
        `🧹 [u-request-chat-message] Cleaned Request ID: ${cleanRequestId}`
      );

      let finalMessageText = text ? text.trim() : "";
      if (!finalMessageText && isPriceSet && Number(price) > 0) {
        finalMessageText = `A utility offer of ₦${Number(
          price
        ).toLocaleString()} was made.`;
        console.log(
          `📝 [u-request-chat-message] Auto-generated price offer text: ${finalMessageText}`
        );
      }
      if (!finalMessageText) {
        finalMessageText = "Utility offer details attached.";
        console.log(
          `📝 [u-request-chat-message] Defaulted message text to: ${finalMessageText}`
        );
      }

      console.log(
        `⏳ [u-request-chat-message] Saving new message to DB for request: ${cleanRequestId}...`
      );
      const newMessage = await RequestingMessage.create({
        request: cleanRequestId,
        sender: senderId,
        text: finalMessageText,
        attachments: attachments || [],
        price: price || 0,
        isPriceSet: isPriceSet || false,
        isRead: false,
        type: isPriceSet ? "price" : "text",
      });

      const populatedMessage = await newMessage.populate(
        "sender",
        "name fullName email profileImage"
      );

      console.log(
        `✅ [u-request-chat-message] Message saved with ID: ${populatedMessage._id.toString()}`
      );

      const messageToSend = {
        id: populatedMessage._id.toString(),
        request: cleanRequestId,
        sender: populatedMessage.sender,
        text: populatedMessage.text,
        type: populatedMessage.type || "text",
        attachments: populatedMessage.attachments,
        isRead: populatedMessage.isRead,
        isPriceSet: populatedMessage.isPriceSet,
        price: populatedMessage.price,
        readBy: populatedMessage.readBy,
        timestamp: populatedMessage.createdAt,
        time: formatMessageTime(populatedMessage.createdAt),
        clientId,
      };
      console.log(
        `📋 [u-request-chat-message] Prepared message object for broadcast.`
      );

      io.to(cleanRequestId).emit("u-chat-message", messageToSend);
      console.log(
        `✅ [u-request-chat-message] Emitted 'u-chat-message' to room ${cleanRequestId}`
      );
    } catch (error) {
      console.error(
        "❌ [u-request-chat-message] Error sending message:",
        error
      );
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  socket.on(
    "u-request-agree-price",
    async ({ messageId, requestId, price }) => {
      console.log(
        `📥 [u-request-agree-price] Received price agreement for request: ${requestId} | Price: ₦${price}`
      );
      try {
        const cleanRequestId = getCleanId(requestId);
        console.log(
          `🧹 [u-request-agree-price] Cleaned Request ID: ${cleanRequestId}`
        );

        console.log(
          `⏳ [u-request-agree-price] Updating Requesting DB record...`
        );
        const updatedRequest = await mongoose
          .model("Requesting")
          .findByIdAndUpdate(
            cleanRequestId,
            { isPriceSet: true, price: price, isAgreed: true },
            { new: true }
          );
        console.log(
          `✅ [u-request-agree-price] Database record successfully updated for request: ${cleanRequestId}`
        );

        io.to(cleanRequestId).emit("u-price-agreed", {
          messageId,
          requestId: cleanRequestId,
          price,
          updatedRequest,
        });

        console.log(
          `✅ [u-request-agree-price] Price Agreed and broadcasted | Room: ${cleanRequestId} | Price: ₦${price}`
        );
      } catch (error) {
        console.error(
          "❌ [u-request-agree-price] Error agreeing to price:",
          error
        );
        socket.emit("error", { message: "Failed to agree to utility price" });
      }
    }
  );

  socket.on("u-update-request-progress", async (payload) => {
    console.log(
      `📥 [u-update-request-progress] Received status update payload:`,
      payload
    );
    try {
      const { requestId, status, currentLocation, senderId } = payload;

      const cleanRequestId = getCleanId(requestId);
      console.log(
        `🧹 [u-update-request-progress] Cleaned Request ID: ${cleanRequestId}`
      );

      if (!cleanRequestId || !mongoose.Types.ObjectId.isValid(cleanRequestId)) {
        console.error(
          `❌ [u-update-request-progress] Valid requestId is missing or invalid: ${requestId}`
        );
        return socket.emit("error", { message: "Valid requestId is required" });
      }

      console.log(
        `⏳ [u-update-request-progress] Finding Requesting by ID: ${cleanRequestId}...`
      );

      const RequestingModel = mongoose.model("Requesting");
      const requestItem = await RequestingModel.findById(cleanRequestId);

      if (!requestItem) {
        console.error(
          `❌ [u-update-request-progress] Requesting item not found for ID: ${cleanRequestId}`
        );
        return socket.emit("error", { message: "Requesting item not found" });
      }
      console.log(
        `✅ [u-update-request-progress] Found request item in database.`
      );

      const statusActuallyProvided = Boolean(status);

      if (status) requestItem.status = status;
      if (currentLocation !== undefined)
        requestItem.currentLocation = currentLocation;

      await requestItem.save();
      console.log(
        `✅ [u-update-request-progress] Updated Requesting status to: ${
          status || "unchanged"
        }, location: ${currentLocation || "unchanged"}`
      );

      let systemText = null;
      if (statusActuallyProvided) {
        systemText = `Status updated to "${status.replace(/_/g, " ")}"`;
      }
      if (currentLocation) {
        systemText = systemText
          ? `${systemText} • Location: ${currentLocation}`
          : `Location updated: ${currentLocation}`;
      }
      console.log(
        `📝 [u-update-request-progress] Generated system text for chat message: ${
          systemText || "None"
        }`
      );

      let messageToSend = null;

      if (systemText) {
        console.log(
          `⏳ [u-update-request-progress] Creating inline status message in requesting chat...`
        );
        const newMessage = await RequestingMessage.create({
          request: cleanRequestId,
          sender: senderId,
          text: systemText,
          type: "status",
          meta: { status, currentLocation, requestId: cleanRequestId },
          isRead: false,
        });

        const populatedMessage = await newMessage.populate(
          "sender",
          "name fullName email profileImage"
        );
        console.log(
          `✅ [u-update-request-progress] Inline status message created and populated with ID: ${populatedMessage._id}`
        );

        messageToSend = {
          id: populatedMessage._id.toString(),
          request: cleanRequestId,
          sender: populatedMessage.sender,
          text: populatedMessage.text,
          type: populatedMessage.type,
          meta: populatedMessage.meta,
          isRead: populatedMessage.isRead,
          readBy: populatedMessage.readBy,
          timestamp: populatedMessage.createdAt,
          time: formatMessageTime(populatedMessage.createdAt),
        };

        io.to(cleanRequestId).emit("u-chat-message", messageToSend);
        console.log(
          `✅ [u-update-request-progress] Emitted status as inline chat message to room ${cleanRequestId}`
        );
      }

      io.to(cleanRequestId).emit("u-request-progress-updated", {
        requestId: requestItem._id.toString(),
        status: requestItem.status,
        currentLocation: requestItem.currentLocation,
        message: messageToSend,
      });
      console.log(
        `✅ [u-update-request-progress] Emitted 'u-request-progress-updated' event.`
      );
    } catch (error) {
      console.error(
        "❌ [u-update-request-progress] Error updating request progress via socket:",
        error
      );
      socket.emit("error", {
        message: "Failed to update utility request progress",
      });
    }
  });

  // =========================================================
  // === FAMILY / KINDRED CHAT + PRESENCE + CALLS
  // =========================================================

  const formatCallDuration = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const parts = [];
    if (hrs > 0) parts.push(`${hrs}h`);
    if (mins > 0 || hrs > 0) parts.push(`${mins}m`);
    parts.push(`${secs}s`);
    return parts.join(" ");
  };

  const createCallMessage = async ({
    roomUuid,
    callerId,
    receiverId,
    callerName,
    status,
    duration = 0,
  }) => {
    try {
      const messageUuid = `call-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 9)}`;
      let text = "";
      if (status === "missed") {
        text = "Missed voice call";
      } else if (status === "rejected") {
        text = "Call declined";
      } else {
        text =
          duration > 0
            ? `Call ended • ${formatCallDuration(duration)}`
            : "Call ended";
      }

      const newMessage = new Message({
        roomUuid,
        message: text,
        senderName: callerName || "System",
        senderId: callerId,
        receiverId,
        messageUuid,
        messageType: "call",
        timestamp: new Date(),
        isRead: false,
      });
      await newMessage.save();

      io.to(roomUuid).emit("receive_message", {
        uuid: messageUuid,
        message: text,
        senderName: callerName || "System",
        senderId: callerId,
        timestamp: newMessage.timestamp.toISOString(),
        messageType: "call",
        callStatus: status,
        duration,
        status: "sent",
      });

      const unreadCount = await Message.countDocuments({
        receiverId,
        isRead: false,
      });
      io.to(roomUuid).emit("unread_update", {
        roomUuid,
        unreadCount,
        lastMessage: text,
      });
    } catch (err) {
      console.error("[CALL-MSG:ERROR]", err);
    }
  };

  const finalizeCall = async (roomId) => {
    const callInfo = activeCalls.get(roomId);
    if (!callInfo) return;

    if (callInfo.missedCallTimeout) {
      clearTimeout(callInfo.missedCallTimeout);
      callInfo.missedCallTimeout = null;
    }

    const isAnswered = callInfo.answered || Boolean(callInfo.answerTime);

    const duration = isAnswered
      ? Math.floor(
          (Date.now() - (callInfo.answerTime || callInfo.startTime)) / 1000
        )
      : 0;

    const status = isAnswered ? "ended" : "missed";

    await createCallMessage({
      roomUuid: roomId,
      callerId: callInfo.callerId,
      receiverId: callInfo.receiverId,
      callerName: callInfo.callerName,
      status,
      duration,
    });

    activeCalls.delete(roomId);

    try {
      const userIds = [callInfo.callerId, callInfo.receiverId].filter(Boolean);
      if (userIds.length > 0) {
        await User.updateMany(
          { _id: { $in: userIds } },
          { $set: { isOncall: false } }
        );
      }
    } catch (err) {
      console.error("[CALL-FINALIZE:DB-ERROR]", err);
    }
  };

  const resolveActiveRoomId = (
    socket,
    explicitRoomId,
    callerId,
    receiverId
  ) => {
    if (explicitRoomId && activeCalls.has(explicitRoomId))
      return explicitRoomId;
    if (socket.roomId && activeCalls.has(socket.roomId)) return socket.roomId;

    const wantCaller = callerId || socket.callerId;
    const wantReceiver = receiverId || socket.receiverId;

    if (wantCaller || wantReceiver) {
      for (const [rid, info] of activeCalls.entries()) {
        const callerMatch = wantCaller && info.callerId === wantCaller;
        const receiverMatch = wantReceiver && info.receiverId === wantReceiver;
        if (callerMatch || receiverMatch) return rid;
      }
    }
    return explicitRoomId || socket.roomId || undefined;
  };

  // ---- Presence ----
  socket.on("register_user", async ({ userId }) => {
    if (!userId) return;
    const cleanUserId = userId.toString();
    onlineUsers.set(cleanUserId, socket.id);
    socket.userId = cleanUserId;
    try {
      const user = await User.findById(cleanUserId);
      if (user) {
        user.socketId = socket.id;
        user.isOnline = true;
        await user.save();
        console.log(
          `🟢 [register_user] User ${cleanUserId} is now ONLINE (socket ${socket.id})`
        );
      }
    } catch (err) {
      console.error("[register_user] DB update failed:", err);
    }
  });

  // ---- Family chat core ----
  socket.on("join_room", async (data) => {
    console.log(
      "📥 [join_room] REQUEST RECEIVED:",
      JSON.stringify(data, null, 2)
    );

    const { uuid, userId } = data;
    if (!uuid) {
      console.log("⚠️ [join_room] FAILED: Missing uuid in payload");
      return;
    }

    socket.join(uuid);
    console.log(`🏠 [join_room] Socket ${socket.id} joined room: ${uuid}`);

    try {
      console.log(
        `⏳ [join_room] Marking unread messages as read for receiverId: ${userId} in room: ${uuid}`
      );
      const updateResult = await Message.updateMany(
        { roomUuid: uuid, receiverId: userId, isRead: false },
        { $set: { isRead: true } }
      );
      console.log(
        "📖 [join_room] MESSAGES MARKED READ:",
        JSON.stringify(updateResult, null, 2)
      );

      console.log(`⏳ [join_room] Fetching message history...`);
      const history = await Message.find({ roomUuid: uuid })
        .sort({ timestamp: 1 })
        .lean();

      const mappedHistory = history.map((msg) => {
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
          imageuri: isImage
            ? msg.imageuri || msg.mediaUri || undefined
            : undefined,
          audioUri: isVoice
            ? msg.audioUri || msg.mediaUri || undefined
            : undefined,
          videouri: msg.videouri || "",
          duration: msg.duration || 0,
          status: "sent",
          isRead: msg.isRead || false,
        };
      });

      console.log(
        `📤 [join_room] EMITTING LOAD_MESSAGES (Count: ${mappedHistory.length}) to socket.`
      );
      socket.emit("load_messages", mappedHistory);

      const readUpdate = { roomUuid: uuid, readerId: userId };
      io.to(uuid).emit("messages_marked_read", readUpdate);
      console.log(
        `✅ [join_room] Broadcasted 'messages_marked_read' to room: ${uuid}`
      );
    } catch (err) {
      console.error("❌ [join_room] Error joining room:", err);
    }
  });

  socket.on("send_message", async (data) => {
    console.log(
      "📥 [send_message] Received message payload from:",
      data.userId,
      "to room:",
      data.uuid
    );

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
      console.error(`❌ [send_message] Missing required fields in payload.`);
      return socket.emit("error", { message: "Missing required fields" });
    }

    try {
      let imageuri = "",
        videouri = "",
        audioUri = "";

      if (base64Media && messageType !== "text") {
        console.log(
          `⏳ [send_message] Processing base64 media upload for type: ${messageType}...`
        );
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

        console.log(
          "✅ [send_message] MEDIA UPLOADED:",
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

      console.log(`⏳ [send_message] Saving new general chat message to DB...`);
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
      console.log(`✅ [send_message] Message saved with ID: ${newMessage._id}`);

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

      console.log(
        "📤 [send_message] OUTGOING MESSAGE PAYLOAD:",
        JSON.stringify(messageToSend, null, 2)
      );

      io.to(roomUuid).emit("receive_message", messageToSend);
      console.log(
        `✅ [send_message] Broadcasted 'receive_message' to room: ${roomUuid}`
      );

      console.log(
        `⏳ [send_message] Calculating unread count for receiver: ${receiverId}...`
      );
      const unreadCount = await Message.countDocuments({
        receiverId,
        isRead: false,
      });

      io.to(roomUuid).emit("unread_update", {
        roomUuid,
        unreadCount,
        lastMessage: newMessage.message,
      });
      console.log(
        `✅ [send_message] Broadcasted 'unread_update' with count: ${unreadCount}`
      );
    } catch (err) {
      console.error(
        "❌ [send_message] Error processing voice/media message:",
        err
      );
      socket.emit("message_error", {
        messageUuid,
        error: "Media upload failed or message processing error",
      });
    }
  });

  socket.on(
    "edit_message",
    async ({ uuid, messageUuid, newMessage, userId }) => {
      console.log(
        `📥 [edit_message] Received edit request for message: ${messageUuid} from user: ${userId}`
      );
      try {
        const msg = await Message.findOne({ messageUuid, senderId: userId });
        if (!msg) {
          console.error(
            `❌ [edit_message] Message not found or access denied.`
          );
          return socket.emit("error", { message: "Access denied" });
        }

        const minutesPassed =
          (Date.now() - new Date(msg.timestamp).getTime()) / 60000;
        if (minutesPassed > 5) {
          console.error(
            `❌ [edit_message] Time limit exceeded. (${minutesPassed.toFixed(
              2
            )} mins)`
          );
          return socket.emit("error", { message: "Time limit exceeded" });
        }

        msg.message = newMessage.trim();
        await msg.save();

        io.to(uuid).emit("message_edited", {
          uuid: messageUuid,
          newMessage: msg.message,
        });
        console.log(
          `✅ [edit_message] Message edited and broadcasted successfully: ${messageUuid}`
        );
      } catch (err) {
        console.error("❌ [edit_message] Edit failed:", err);
      }
    }
  );

  socket.on("mark_messages_read", async ({ uuid, userId }) => {
    if (!uuid || !userId) return;
    try {
      const result = await Message.updateMany(
        { roomUuid: uuid, receiverId: userId, isRead: false },
        { $set: { isRead: true } }
      );
      if (result.modifiedCount > 0) {
        io.to(uuid).emit("messages_marked_read", {
          roomUuid: uuid,
          readerId: userId,
        });
        console.log(
          `📖 [mark_messages_read] Marked ${result.modifiedCount} message(s) read for ${userId} in ${uuid}`
        );
      }
    } catch (err) {
      console.error("❌ [mark_messages_read]", err);
    }
  });

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
        console.error("❌ [delete_message] Delete failed:", err);
      }
    }
  );

  socket.on("typing", (data) => {
    socket.to(data.uuid).emit("user_typing", {
      roomUuid: data.uuid,
      name: data.fullName,
      isTyping: true,
    });
  });

  socket.on("stop_typing", (data) => {
    socket.to(data.uuid).emit("user_typing", {
      roomUuid: data.uuid,
      isTyping: false,
    });
  });

  // ---- Calls ----
  socket.on("kookohor-join-room", async (data) => {
    const roomId = typeof data === "object" ? data.roomId : data;
    const callerId = data?.callerId ? data.callerId.toString() : undefined;
    const receiverId = data?.receiverId
      ? data.receiverId.toString()
      : undefined;

    if (!roomId) return;
    socket.join(roomId);
    socket.roomId = roomId;
    socket.callerId = callerId;
    socket.receiverId = receiverId;

    try {
      const userIds = [callerId, receiverId].filter(Boolean);
      if (userIds.length > 0) {
        await User.updateMany(
          { _id: { $in: userIds } },
          { $set: { isOncall: true } }
        );
      }

      const [callerUser, receiverUser] = await Promise.all([
        callerId
          ? User.findById(callerId).select(
              "firstName lastName fullName profilePicture"
            )
          : null,
        receiverId
          ? User.findById(receiverId).select(
              "firstName lastName fullName profilePicture"
            )
          : null,
      ]);

      const callerName = callerUser
        ? `${callerUser.firstName || ""} ${callerUser.lastName || ""}`.trim() ||
          callerUser.fullName ||
          "Someone"
        : "Someone";

      const receiverName = receiverUser
        ? `${receiverUser.firstName || ""} ${
            receiverUser.lastName || ""
          }`.trim() ||
          receiverUser.fullName ||
          "Someone"
        : "Someone";

      if (roomId && callerId && !activeCalls.has(roomId)) {
        activeCalls.set(roomId, {
          answered: false,
          startTime: Date.now(),
          callerId,
          receiverId: receiverId || "room-participant",
          callerName,
        });
      }

      if (receiverId) {
        const targetSocketId = onlineUsers.get(receiverId.toString());
        const callPayload = {
          roomId,
          callerId,
          receiverId,
          callerName,
          callerProfilePicture: callerUser?.profilePicture || "",
          receiverName,
          receiverProfilePicture: receiverUser?.profilePicture || "",
          isCaller: false,
        };

        if (targetSocketId) {
          io.to(targetSocketId).emit("incoming-call", callPayload);
        } else {
          const receiverUserDoc = await User.findById(receiverId);
          if (receiverUserDoc?.socketId) {
            io.to(receiverUserDoc.socketId).emit("incoming-call", callPayload);
          }
        }
      }

      socket.to(roomId).emit("kookohor-user-connected", {
        socketId: socket.id,
        callerId,
        receiverId,
        callerName,
        callerProfilePicture: callerUser?.profilePicture || "",
        receiverName,
        receiverProfilePicture: receiverUser?.profilePicture || "",
      });
    } catch (err) {
      console.error("❌ [kookohor-join-room] error:", err);
    }
  });

  socket.on("kookohor-offer", ({ offer, roomId, targetSocketId }) => {
    const target = targetSocketId || roomId || socket.roomId;
    if (target)
      socket
        .to(target)
        .emit("kookohor-offer", { offer, senderSocketId: socket.id });
  });

  socket.on("kookohor-answer", ({ answer, roomId, targetSocketId }) => {
    const target = targetSocketId || roomId || socket.roomId;
    if (target)
      socket
        .to(target)
        .emit("kookohor-answer", { answer, senderSocketId: socket.id });

    const activeRoomId = roomId || socket.roomId;
    if (activeRoomId && activeCalls.has(activeRoomId)) {
      const info = activeCalls.get(activeRoomId);
      if (!info.answered) {
        info.answered = true;
        info.answerTime = Date.now();
      }
    }
  });

  socket.on(
    "kookohor-ice-candidate",
    ({ candidate, roomId, targetSocketId }) => {
      const target = targetSocketId || roomId || socket.roomId;
      if (target)
        socket.to(target).emit("kookohor-ice-candidate", {
          candidate,
          senderSocketId: socket.id,
        });
    }
  );

  socket.on("kookohor-switch-to-video", ({ roomId }) => {
    const targetRoom = roomId || socket.roomId;
    if (targetRoom) {
      socket
        .to(targetRoom)
        .emit("peer-switched-to-video", { senderSocketId: socket.id });
    }
  });

  socket.on("kookohor-switch-to-audio", ({ roomId }) => {
    const targetRoom = roomId || socket.roomId;
    if (targetRoom) {
      socket
        .to(targetRoom)
        .emit("peer-switched-to-audio", { senderSocketId: socket.id });
    }
  });

  socket.on("kookohor-end-call", async (data) => {
    const roomId = data?.roomId || socket.roomId;
    if (!roomId) return;
    await finalizeCall(roomId);
    io.to(roomId).emit("call-ended", { roomId });

    const room = io.sockets.adapter.rooms.get(roomId);
    if (room) {
      for (const sid of room) {
        const s = io.sockets.sockets.get(sid);
        if (s) s.leave(roomId);
      }
    }
  });

  // ---- Inbox / Calls list ----
  socket.on("get_calls", async ({ userId }) => {
    try {
      const calls = await Message.aggregate([
        {
          $match: {
            messageType: "call",
            $or: [{ senderId: userId }, { receiverId: userId }],
          },
        },
        { $sort: { timestamp: -1 } },
        {
          $addFields: {
            otherUserId: {
              $cond: [
                { $eq: ["$senderId", userId] },
                "$receiverId",
                "$senderId",
              ],
            },
          },
        },
        { $addFields: { otherUserObjectId: { $toObjectId: "$otherUserId" } } },
        {
          $lookup: {
            from: "users",
            localField: "otherUserObjectId",
            foreignField: "_id",
            as: "userDetails",
          },
        },
        { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            uuid: { $ifNull: ["$messageUuid", "$uuid"] },
            roomUuid: 1,
            message: 1,
            senderId: 1,
            receiverId: 1,
            otherUserId: 1,
            timestamp: { $ifNull: ["$timestamp", "$$NOW"] },
            messageType: { $literal: "call" },
            callStatus: { $ifNull: ["$callStatus", "ended"] },
            duration: { $ifNull: ["$duration", 0] },
            isCaller: { $eq: ["$senderId", userId] },
            roomId: "$roomUuid",
            callerId: { $literal: userId },
            receiverId: "$otherUserId",
            receiverName: {
              $cond: [
                { $ifNull: ["$userDetails", false] },
                {
                  $concat: [
                    "$userDetails.firstName",
                    " ",
                    "$userDetails.lastName",
                  ],
                },
                "$senderName",
              ],
            },
            receiverProfilePicture: {
              $ifNull: ["$userDetails.profilePicture", ""],
            },
          },
        },
        { $sort: { timestamp: -1 } },
      ]);

      const mappedCalls = calls.map((call) => ({
        ...call,
        timestamp:
          call.timestamp instanceof Date
            ? call.timestamp.toISOString()
            : new Date(call.timestamp).toISOString(),
        isCaller: "true",
      }));

      socket.emit("calls_list", mappedCalls);
    } catch (err) {
      console.error("❌ [get_calls] Error:", err);
    }
  });

  // Get conversations + mark the requester ONLINE
  socket.on("get_conversations", async ({ userId }) => {
    console.log(
      `📥 [get_conversations] Fetching inbox conversations for user: ${userId}`
    );
    try {
      // Force requester ONLINE
      if (userId) {
        const cleanUserId = userId.toString();
        onlineUsers.set(cleanUserId, socket.id);
        socket.userId = cleanUserId;
        try {
          await User.findByIdAndUpdate(cleanUserId, {
            $set: { isOnline: true, socketId: socket.id },
          });
          console.log(
            `🟢 [get_conversations] User ${cleanUserId} marked ONLINE`
          );
        } catch (onlineErr) {
          console.error(
            "[get_conversations] Failed to set isOnline:",
            onlineErr
          );
        }
      }

      const conversations = await Message.aggregate([
        { $match: { $or: [{ senderId: userId }, { receiverId: userId }] } },
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: "$roomUuid",
            lastMessage: { $first: "$message" },
            timestamp: { $first: "$timestamp" },
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
        {
          $addFields: {
            otherPersonObjectId: { $toObjectId: "$otherPersonId" },
          },
        },
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
        {
          $project: {
            _id: 1,
            lastMessage: 1,
            timestamp: 1,
            unreadCount: 1,
            profilePicture: {
              $ifNull: ["$userDetails.profilePicture", null],
            },
            isOnline: {
              $ifNull: ["$userDetails.isOnline", false],
            },
            senderId: "$otherPersonId",
            receiverId: { $literal: userId },
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
                "$latestSenderName",
              ],
            },
          },
        },
        { $sort: { timestamp: -1 } },
      ]);

      console.log(
        "📂 [get_conversations] UPDATED INBOX DATA EXTRACTED SUCCESSFULLY:",
        JSON.stringify(conversations, null, 2)
      );

      socket.emit("conversations_list", conversations);
      console.log(
        `✅ [get_conversations] Emitted 'conversations_list' to socket ${socket.id}`
      );
    } catch (err) {
      console.error(
        "❌ [get_conversations] Error fetching conversations:",
        err
      );
    }
  });

  // Disconnect → mark OFFLINE
  socket.on("disconnect", async () => {
    console.log(`👋 [disconnect] Socket ${socket.id} disconnected`);

    if (socket.userId) {
      onlineUsers.delete(socket.userId);
      try {
        const user = await User.findById(socket.userId);
        if (user && user.socketId === socket.id) {
          user.isOnline = false;
          user.socketId = null;
          await user.save();
          console.log(`🔴 [disconnect] User ${socket.userId} marked OFFLINE`);
        }
      } catch (err) {
        console.error("[disconnect] DB update failed:", err);
      }
    }

    const roomId = resolveActiveRoomId(socket, socket.roomId);
    if (!roomId) return;

    const room = io.sockets.adapter.rooms.get(roomId);
    const roomEmpty = !room || room.size === 0;

    if (activeCalls.has(roomId)) {
      await finalizeCall(roomId);
    } else if (roomEmpty) {
      const userIds = [socket.callerId, socket.receiverId].filter(Boolean);
      if (userIds.length > 0) {
        try {
          await User.updateMany(
            { _id: { $in: userIds } },
            { $set: { isOncall: false } }
          );
        } catch (err) {
          console.error("[disconnect] isOncall reset failed:", err);
        }
      }
    }

    if (!roomEmpty) {
      socket.to(roomId).emit("call-ended", { reason: "peer-disconnected" });
    }
  });
});

// --- DATABASE & SERVER START ---
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("🟢 [Server] MongoDB Connected Successfully"))
  .catch((err) => console.error("🔴 [Server] MongoDB Connection Error:", err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 [Server] Kindred Auth Server running on port ${PORT}`);
});
