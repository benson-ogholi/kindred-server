require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

// --- PUSH NOTIFICATIONS AUDIT FIX (objective #7) ---
// This used to also `require("firebase-admin")` and initialize it here
// (admin.initializeApp({ credential: admin.credential.cert({...}) })) purely
// to support the `sendCallPush` helper below. Two separate problems with
// that, found during this audit:
//   1. `sendCallPush` read `user.fcmToken` and sent through firebase-admin's
//      messaging API, but the User schema (models/kokohor/User.js) has no
//      `fcmToken` field at all — only `expoPushToken`/`voipPushToken` — so
//      this lookup was always undefined and every incoming-call ringing
//      push silently no-op'd.
//   2. Separately, with the firebase-admin version that satisfies this
//      project's package.json range (^13.10.0, no lockfile pins it), the
//      credential helper has moved: `admin.credential` is no longer an
//      exported namespace, so `admin.credential.cert(...)` throws
//      `Cannot read properties of undefined (reading 'cert')` at module load
//      — i.e. the ENTIRE server (all 4 sub-servers in this codebase, not
//      just kokohor) crashes on `node index.js` before it can even start
//      listening, on a completely fresh `npm install`.
// Since nothing else in this codebase uses firebase-admin, the fix is to
// drop the dependency here entirely rather than patch its init call, and
// use services/kokohor/pushService.js instead, which is Expo-based (same
// proven mechanism as utils/notificationHelper.js / utils/notifyUser.js) and
// the real `expoPushToken` field.
const { sendCallRingingPush } = require("./services/kokohor/pushService");
// Preserves the original (userId, data, ttlMs) call signature used at every
// existing call site below — pushService's ttl parameter is in seconds.
const sendCallPush = (userId, data, ttlMs = 40000) => sendCallRingingPush(userId, data, Math.round(ttlMs / 1000));

const RequestingMessage = require("./models/padiman_utility_models/RequestingMessage");
const authRoutes = require("./routes/kokohor/auth");
const familiesRoutes = require("./routes/kokohor/family");
const featuresRoutes = require("./routes/kokohor/features");
const newsRoutes = require("./routes/kokohor/news.routes");
const taskRoutes = require("./routes/kokohor/task");
const reportsRoutes = require("./routes/kokohor/report");
const suggestionsRoutes = require("./routes/kokohor/suggestionRoutes");
const pollRoutes = require("./routes/kokohor/poll");
const notificationsRoutes = require("./routes/kokohor/notificationRoutes");
const userRoutes = require("./routes/kokohor/userRoutes");
const donationsRoutes = require("./routes/kokohor/donationCampaign.routes");
const Message = require("./models/kokohor/Message");
const contentRoutes = require("./routes/kokohor/familyContent");
const { uploadToBackblaze } = require("./utils/uploadToBackblaze");
const familyMembers = require("./routes/kokohor/familyMembers");
const aiAnalysisRoutes = require("./routes/kokohor/aiAnalysis");
const SafetyNet = require("./routes/kokohor/safetyNet");
const adminRoutes = require("./routes/kokohor/adminRoutes");
const dashboardRouter = require("./routes/kokohor/dashboardRoutes");
const adminUserRoutes = require("./routes/kokohor/adminUserRoutes");
const adminFamilyRoutes = require("./routes/kokohor/adminFamilyRoutes");
const adminFinanceRoutes = require("./routes/kokohor/adminFinanceRoutes");
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
const {
  sendNotification: sendSocketNotification,
} = require("./utils/pr/pr_push");
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
const { protect, checkStatus } = require("./middlewares/kokohor/authMiddleware");
const cooperative_auth = require("./routes/cooperative/authRoutes");
const cooperative_admin = require("./routes/cooperative/adminRoutes");
const cooperative_dividends = require("./routes/cooperative/dividendRoutes");
const cooperative_loans = require("./routes/cooperative/loanRoutes");
const cooperative_savings = require("./routes/cooperative/savingsRoutes");
const cooperative_wallet = require("./routes/cooperative/walletRoutes");
const cooperative_payments = require("./routes/cooperative/cooperativePaymentRouter");
const cooperative_requests = require("./routes/cooperative/cooperativeRequestRoutes");
const User = require("./models/kokohor/User");
const pru_verify = require("./routes/pr/pr.verify");

// --- Unified content/feed (Phase 2: objective #2) + Gamification (objective #5) ---
const unifiedContentRoutes = require("./routes/kokohor/unifiedContent.routes");
const gamificationRoutes = require("./routes/kokohor/gamification.routes");
const { registerFeedSocketHandlers } = require("./sockets/kokohor/feedSocket");
const { registerGroupCallNamespace } = require("./sockets/kokohor/groupCallSocket");
const { registerMessageSocketHandlers } = require("./sockets/kokohor/messageSocket");
const { startSafetyNetCron } = require("./cron/kokohor/safetyNetCrons");
const GroupCallLog = require("./models/kokohor/GroupCallLog");
const { isBlockedBetween } = require("./utils/kokohor/moderation");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 5e7,
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Socket auth (JWT in the handshake) for the main namespace and the group
// call namespace — see middlewares/kokohor/socketAuth.js.
const { socketAuthMiddleware, authUserId, SOCKET_AUTH_MODE } = require("./middlewares/kokohor/socketAuth");
io.use(socketAuthMiddleware);
io.of("/kokohor-group-calls").use(socketAuthMiddleware);

// Lets REST controllers (e.g. unifiedContentController, which isn't part of
// this file's giant io.on("connection", ...) closure) reach the same socket
// server to broadcast feed events: `req.app.get("io")`.
app.set("io", io);

app.disable("x-powered-by");
app.set("trust proxy", 1); // Render terminates TLS in front of the app
// Baseline security headers (HSTS only applies once served over HTTPS).
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  });
  next();
});
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/families", familiesRoutes);
// NOTE: /api/v1/features, /api/v1/news, /api/v1/tasks, /api/v1/reports,
// /api/v1/suggestions, /api/v1/polls, /api/v1/donations and
// /api/v1/family-content below are the pre-existing fragmented per-type
// routes (now with their imports fixed — see Phase 1). They are left mounted
// and fully working so existing clients keep working unmodified. The new
// consolidated surface lives at /api/v1/feed (objective #2) and is the
// recommended path for new client work — see the Phase 3 notes for the
// suggested deprecation path for the routes below.
app.use("/api/v1/feed", unifiedContentRoutes);
app.use("/api/v1/calls", require("./routes/kokohor/callConfig"));
// Share links / deep-link landing pages / .well-known (kokokorcircle.com)
app.use(require("./routes/kokohor/shareLinks"));
app.use("/api/v1/gamification", gamificationRoutes);
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
app.use("/api/v1/padiman_route/driver/verify", pru_verify);
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

const rooms = new Map();
const onlineUsers = new Map();
const activeCalls = new Map();

const userRoom = (id) => `user:${id}`;
const callRoom = (roomId) => `call:${roomId}`;

const sendNotification = async (userId, payload) => {
  try {
    await sendSocketNotification(userId, payload);
  } catch (err) {
    console.error(`❌ [sendNotification] Failed for user ${userId}:`, err);
  }
};

const sendChatNotification = async (
  negotiationId,
  populatedMessage,
  senderId
) => {
  try {
    const negotiationDoc = await Negotiation.findById(negotiationId)
      .populate("negotiator", "fullName")
      .populate("serviceProvider", "fullName")
      .lean();
    if (!negotiationDoc) return;

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
      await sendNotification(receiverId, {
        title: "New Message",
        body: `${senderName}: ${messagePreview}`,
        type: "CHAT",
        router: "/(features)/chat",
        data: {
          negotiationId,
          messageId: populatedMessage._id.toString(),
          senderId,
          isPriceOffer: populatedMessage.isPriceSet,
        },
      });
    }
  } catch (err) {
    console.error("❌ [sendChatNotification] Error:", err);
  }
};

const sendPriceAgreedNotification = async (negotiationId, price) => {
  try {
    const negotiationDoc = await Negotiation.findById(negotiationId)
      .populate("negotiator", "fullName")
      .populate("serviceProvider", "fullName")
      .lean();
    if (!negotiationDoc) return;

    const receivers = [
      negotiationDoc.negotiator?._id,
      negotiationDoc.serviceProvider?._id,
    ].filter(Boolean);

    for (const receiverId of receivers) {
      await sendNotification(receiverId, {
        title: "Price Agreed! 🎉",
        body: `The price of ₦${Number(
          price
        ).toLocaleString()} has been accepted.`,
        type: "NEGOTIATION",
        router: "/(features)/chat",
        data: {
          negotiationId,
          price,
          status: "price_agreed",
        },
      });
    }
  } catch (err) {
    console.error("❌ [sendPriceAgreedNotification] Error:", err);
  }
};

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
  callType = "audio",
}) => {
  try {
    const messageUuid = `call-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    let text = "";
    const isVideo = callType === "video";
    if (status === "missed") {
      text = `Missed ${isVideo ? "video" : "voice"} call`;
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
      callStatus: ["missed", "ended", "rejected"].includes(status) ? status : "ended",
      callType: isVideo ? "video" : "audio",
      duration,
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

const resolveActiveRoomId = (socket, explicitRoomId, callerId, receiverId) => {
  if (explicitRoomId && activeCalls.has(explicitRoomId)) return explicitRoomId;
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

const RING_TIMEOUT_MS = 40_000;
const ringTimers = new Map(); // module-level, shared by all sockets

// A phone switching Wi-Fi <-> mobile data drops its socket for a few
// seconds while the WebRTC media often survives (or recovers with an ICE
// restart). Instead of ending an answered call the moment a socket drops,
// wait this long for the same user to reconnect and "kookohor-rejoin-room".
const CALL_RECONNECT_GRACE_MS =
  (Number(process.env.CALL_RECONNECT_GRACE_SECONDS) || 20) * 1000;
const reconnectTimers = new Map(); // roomId -> timeout

const clearReconnectTimer = (roomId) => {
  const t = reconnectTimers.get(roomId);
  if (t) clearTimeout(t);
  reconnectTimers.delete(roomId);
};

/** True if `userId` still has a live socket inside the call room. */
const userStillInCall = async (roomId, userId, exceptSocketId) => {
  if (!userId) return false;
  const members = await io.in(callRoom(roomId)).fetchSockets();
  return members.some(
    (m) => m.id !== exceptSocketId && String(m.data?.callUserId || "") === String(userId)
  );
};

const clearRingTimer = (roomId) => {
  const t = ringTimers.get(roomId);
  if (t) clearTimeout(t);
  ringTimers.delete(roomId);
};

const displayName = (u) =>
  u
    ? `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
      u.fullName ||
      "Someone"
    : "Someone";

const finalizeCall = async (roomId, statusOverride) => {
  const callInfo = activeCalls.get(roomId);
  if (!callInfo) return;
  activeCalls.delete(roomId); // delete FIRST, before any await, so a quick redial isn't wiped
  clearRingTimer(roomId);
  clearReconnectTimer(roomId);

  const isAnswered = callInfo.answered || Boolean(callInfo.answerTime);
  const duration = isAnswered
    ? Math.floor(
        (Date.now() - (callInfo.answerTime || callInfo.startTime)) / 1000
      )
    : 0;
  const status = statusOverride || (isAnswered ? "ended" : "missed");

  await createCallMessage({
    roomUuid: roomId,
    callerId: callInfo.callerId,
    receiverId: callInfo.receiverId,
    callerName: callInfo.callerName,
    status,
    duration,
    callType: callInfo.callType,
  });

  try {
    const busy = new Set();
    for (const c of activeCalls.values()) {
      busy.add(c.callerId);
      busy.add(c.receiverId);
    }
    const free = [callInfo.callerId, callInfo.receiverId].filter(
      (id) => id && id !== "room-participant" && !busy.has(id)
    );
    if (free.length) {
      await User.updateMany(
        { _id: { $in: free } },
        { $set: { isOncall: false } }
      );
    }
  } catch (err) {
    console.error("[CALL-FINALIZE:DB-ERROR]", err);
  }
};

const emitCallEnded = (roomId, info, { exceptSocketId, reason } = {}) => {
  const targets = [callRoom(roomId)];
  [info?.callerId, info?.receiverId].forEach((id) => {
    if (id && id !== "room-participant") targets.push(userRoom(id));
  });
  let op = io.to(targets);
  if (exceptSocketId) op = op.except(exceptSocketId);
  op.emit("call-ended", { roomId, callKey: info?.callKey, reason });
};

const endCallOnServer = async (
  roomId,
  { exceptSocketId, reason, statusOverride } = {}
) => {
  const info = activeCalls.get(roomId);
  if (!info) return; // idempotent

  // 1. tell the other side immediately
  emitCallEnded(roomId, info, { exceptSocketId, reason });

  // 1b. Send FCM push cancellation to the receiver to dismiss pending notifications
  if (info.receiverId && info.receiverId !== "room-participant") {
    sendCallPush(info.receiverId, { type: "call_cancelled", roomId }, 60000);
  }

  // 2. persist (this deletes activeCalls synchronously)
  const done = finalizeCall(roomId, statusOverride);

  // 3. empty the signalling room so nothing leaks into the next call
  const members = await io.in(callRoom(roomId)).fetchSockets();
  members.forEach((s) => {
    s.leave(callRoom(roomId));
    if (s.roomId === roomId) s.roomId = undefined;
  });

  await done;
};

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

  // ==================== PR NEGOTIATION CHAT ====================
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
        `✅ [u-update-request-progress] Emitted 'request-progress-updated' event.`
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

  registerMessageSocketHandlers(io, socket, { onlineUsers });

  // ---- 1-1 call authorization helpers ----
  // Signaling is only relayed between sockets that joined the same call
  // room, and only the two people on a call can accept/end it.
  const relayTarget = (roomId, targetSocketId) => {
    const rid = roomId || socket.roomId;
    if (!rid || !socket.rooms.has(callRoom(rid))) return null;
    if (targetSocketId) {
      const t = io.sockets.sockets.get(targetSocketId);
      return t && t.rooms.has(callRoom(rid)) ? targetSocketId : null;
    }
    return callRoom(rid);
  };
  const isCallParty = (info) => {
    const me = socket.data?.kokohorUserId;
    if (!me || !info) return true; // unauthenticated (rollout mode) → legacy behaviour
    return me === String(info.callerId) || me === String(info.receiverId);
  };

  socket.on("kookohor-join-room", async (data) => {
    const roomId = typeof data === "object" ? data.roomId : data;
    const isCaller = data?.isCaller !== false && data?.isCaller !== "false";
    // The caller must be the authenticated user; the callee joins as itself.
    const authed = socket.data?.kokohorUserId;
    const claimedSelf = isCaller ? data?.callerId : data?.receiverId;
    if (authed && claimedSelf && String(claimedSelf) !== authed) {
      socket.emit("call-ended", { roomId, reason: "unauthorized" });
      return; // impersonation attempt
    }
    if (!authed && SOCKET_AUTH_MODE === "enforce") {
      socket.emit("call-ended", { roomId, reason: "unauthorized" });
      return;
    }
    const callerId = isCaller ? authed || data?.callerId?.toString() : data?.callerId?.toString();
    const receiverId = isCaller ? data?.receiverId?.toString() : authed || data?.receiverId?.toString();
    if (roomId && callerId && receiverId && callerId === receiverId) return;
    const callType = data?.callType === "video" ? "video" : "audio";
    if (!roomId) return;

    // Block check: either side blocked the other → refuse the call.
    if (isCaller && callerId && receiverId && (await isBlockedBetween(callerId, receiverId))) {
      socket.emit("call-ended", { roomId, reason: "blocked" });
      socket.emit("kookohor-call-blocked", { roomId, message: "You can't call this user." });
      return;
    }

    if (isCaller) {
      // brand-new outgoing call: wipe anything left from a previous call on this room
      clearRingTimer(roomId);
      activeCalls.delete(roomId);
      io.in(callRoom(roomId)).socketsLeave(callRoom(roomId));
    }

    const sentAt = Date.now();
    let call = activeCalls.get(roomId);
    if (!call && callerId) {
      call = {
        answered: false,
        startTime: sentAt,
        callerId,
        receiverId: receiverId || "room-participant",
        callerName: "Someone",
        callType,
        callKey: String(sentAt), // unique per call attempt
      };
      activeCalls.set(roomId, call);
    }

    socket.join(roomId);
    socket.join(callRoom(roomId));
    socket.roomId = roomId;
    socket.callerId = callerId;
    socket.receiverId = receiverId;
    socket.data.callUserId = isCaller ? callerId : receiverId;
    clearReconnectTimer(roomId);

    // Tell the peer NOW so the offer can start. No DB work before this.
    socket.to(callRoom(roomId)).emit("kookohor-user-connected", {
      socketId: socket.id,
      callerId,
      receiverId,
    });

    if (isCaller && call) {
      socket.emit("kookohor-call-started", { roomId, callKey: call.callKey });
    }

    const userIds = [callerId, receiverId].filter(Boolean);
    const markBusy = userIds.length
      ? User.updateMany({ _id: { $in: userIds } }, { $set: { isOncall: true } })
      : Promise.resolve();

    if (!isCaller) {
      clearRingTimer(roomId);
      markBusy.catch((e) => console.error("[join] isOncall failed:", e));
      return; // callee doesn't need names/pictures
    }

    try {
      const sel = "firstName lastName fullName profilePicture";
      const [callerUser, receiverUser] = await Promise.all([
        callerId ? User.findById(callerId).select(sel).lean() : null,
        receiverId ? User.findById(receiverId).select(sel).lean() : null,
        markBusy,
      ]);

      // caller hung up / call replaced while we were waiting on the DB
      if (!call || activeCalls.get(roomId) !== call) return;
      if (!callerId || !receiverId) return;

      call.callerName = displayName(callerUser);

      io.to(userRoom(receiverId)).emit("incoming-call", {
        roomId,
        callerId,
        receiverId,
        callerName: call.callerName,
        callerProfilePicture: callerUser?.profilePicture || "",
        receiverName: displayName(receiverUser),
        receiverProfilePicture: receiverUser?.profilePicture || "",
        isCaller: false,
        callType,
        sentAt, // doubles as the unique call key on the client
      });

      // --- INTEGRATED: send FCM background push notification ---
      sendCallPush(receiverId, {
        type: "incoming_call",
        roomId,
        callerId,
        receiverId,
        callerName: call.callerName,
        callerProfilePicture: callerUser?.profilePicture || "",
        receiverName: displayName(receiverUser),
        receiverProfilePicture: receiverUser?.profilePicture || "",
        callType,
        sentAt,
      });

      clearRingTimer(roomId);
      ringTimers.set(
        roomId,
        setTimeout(() => {
          ringTimers.delete(roomId);
          const c = activeCalls.get(roomId);
          if (c && c.callKey === call.callKey && !c.answered) {
            endCallOnServer(roomId, { reason: "no-answer" }).catch((e) =>
              console.error("❌ [ring-timeout]", e)
            );
          }
        }, RING_TIMEOUT_MS)
      );
    } catch (err) {
      console.error("❌ [kookohor-join-room] error:", err);
    }
  });

  // The app's socket reconnected (network switch / app resumed) during a
  // call: put the new socket back in the call room so signaling (ICE
  // restart) flows again. Ack tells the app whether the call still exists,
  // so a call that ended while it was offline doesn't linger as a ghost.
  socket.on("kookohor-rejoin-room", async ({ roomId } = {}, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    const info = roomId ? activeCalls.get(roomId) : null;
    if (!info) return reply({ ok: false, reason: "ended" });
    const me = socket.data?.kokohorUserId || socket.userId;
    if (!me && SOCKET_AUTH_MODE === "enforce") return reply({ ok: false, reason: "unauthorized" });
    if (me && me !== String(info.callerId) && me !== String(info.receiverId)) {
      return reply({ ok: false, reason: "unauthorized" });
    }
    clearReconnectTimer(roomId);
    socket.join(roomId);
    socket.join(callRoom(roomId));
    socket.roomId = roomId;
    socket.data.callUserId = me || socket.data.callUserId;
    socket.to(callRoom(roomId)).emit("kookohor-peer-rejoined", { roomId, socketId: socket.id });
    reply({ ok: true, answered: !!info.answered, callKey: info.callKey });
  });

  // Lightweight "is this call still on?" check (e.g. an incoming call that
  // was ringing while the app's socket was offline).
  socket.on("kookohor-call-alive", ({ roomId, callKey } = {}, ack) => {
    if (typeof ack !== "function") return;
    const info = roomId ? activeCalls.get(roomId) : null;
    const alive = !!info && (!callKey || String(info.callKey) === String(callKey));
    ack({ alive, answered: !!info?.answered });
  });

  socket.on("kookohor-accept-call", ({ roomId } = {}) => {
    const info = activeCalls.get(roomId);
    if (!info || info.answered) return;
    const me = socket.data?.kokohorUserId;
    if (me && me !== String(info.receiverId)) return; // only the callee can accept

    info.answered = true;
    info.answerTime = Date.now();
    clearRingTimer(roomId);

    // --- INTEGRATED: clear notification on any other device/session the receiver has ---
    if (info.receiverId && info.receiverId !== "room-participant") {
      sendCallPush(info.receiverId, { type: "call_cancelled", roomId }, 60000);
    }

    // userRoom() for both people, so it reaches them even if they haven't joined the call room yet
    io.to([
      callRoom(roomId),
      userRoom(info.callerId),
      userRoom(info.receiverId),
    ]).emit("call-accepted", { roomId, callKey: info.callKey });
  });

  socket.on("kookohor-offer", ({ offer, roomId, targetSocketId } = {}) => {
    const target = relayTarget(roomId, targetSocketId);
    if (target)
      socket
        .to(target)
        .emit("kookohor-offer", { offer, senderSocketId: socket.id });
  });

  socket.on("kookohor-answer", ({ answer, roomId, targetSocketId } = {}) => {
    // (SDP is no longer logged — it contains network addresses/fingerprints.)
    const target = relayTarget(roomId, targetSocketId);
    if (!target) return;
    socket.to(target).emit("kookohor-answer", {
      answer,
      senderSocketId: socket.id,
    });

    const activeRoomId = roomId || socket.roomId;
    if (activeRoomId) {
      console.log(
        `[kookohor-answer] Clearing ring timer for active room: ${activeRoomId}`
      );
      clearRingTimer(activeRoomId);

      const info = activeCalls.get(activeRoomId);
      if (info && !info.answered) {
        info.answered = true;
        info.answerTime = Date.now();
        console.log(
          `[kookohor-answer] Call marked as answered for room ${activeRoomId} at timestamp: ${info.answerTime}`
        );
      } else if (!info) {
        console.warn(
          `[kookohor-answer] Warning: Active call info not found in map for room ${activeRoomId}`
        );
      }
    }
  });

  socket.on(
    "kookohor-ice-candidate",
    ({ candidate, roomId, targetSocketId } = {}) => {
      const target = relayTarget(roomId, targetSocketId);
      if (target)
        socket.to(target).emit("kookohor-ice-candidate", {
          candidate,
          senderSocketId: socket.id,
        });
    }
  );

  socket.on("kookohor-switch-to-video", ({ roomId }) => {
    const targetRoom = roomId || socket.roomId;
    const target =
      targetRoom && socket.rooms.has(callRoom(targetRoom)) ? callRoom(targetRoom) : null;
    if (target) {
      socket
        .to(target)
        .emit("peer-switched-to-video", { senderSocketId: socket.id });
    }
  });

  socket.on("kookohor-switch-to-audio", ({ roomId }) => {
    const targetRoom = roomId || socket.roomId;
    const target =
      targetRoom && socket.rooms.has(callRoom(targetRoom)) ? callRoom(targetRoom) : null;
    if (target) {
      socket
        .to(target)
        .emit("peer-switched-to-audio", { senderSocketId: socket.id });
    }
  });

  socket.on("kookohor-end-call", async (data) => {
    const roomId = data?.roomId || socket.roomId;
    if (!roomId) return;
    const info = activeCalls.get(roomId);
    if (info && !isCallParty(info)) return; // not your call
    if (socket.roomId === roomId) socket.roomId = undefined;
    try {
      const declined =
        info &&
        !info.answered &&
        socket.userId &&
        info.receiverId === socket.userId;
      await endCallOnServer(roomId, {
        exceptSocketId: socket.id,
        reason: declined ? "declined" : "ended",
        statusOverride: declined ? "rejected" : undefined,
      });
    } catch (e) {
      console.error("❌ [kookohor-end-call] error:", e);
    }
  });

  socket.on("get_calls", async ({ userId: claimedUserId } = {}) => {
    const userId = authUserId(socket, claimedUserId);
    if (!userId) return;
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

      // Group calls (sockets/kokohor/groupCallSocket.js) — merged into the
      // same list. Per viewer: the initiator sees an outgoing call, anyone
      // who joined sees it as answered, anyone rung who never joined sees
      // it as missed.
      let groupCalls = [];
      if (mongoose.Types.ObjectId.isValid(userId)) {
        try {
          const logs = await GroupCallLog.find({
            $or: [{ initiator: userId }, { invited: userId }, { joined: userId }],
          })
            .sort({ endedAt: -1 })
            .limit(100)
            .populate("familyIds", "familyName")
            .populate("initiator", "firstName lastName profilePicture")
            .lean();

          groupCalls = logs.map((log) => {
            const uid = String(userId);
            const initiatorId = String(log.initiator?._id || log.initiator);
            const isInitiator = initiatorId === uid;
            const joined = (log.joined || []).map(String).includes(uid);
            const families = (log.familyIds || []).filter(Boolean);
            const familyName =
              families.map((f) => f.familyName).filter(Boolean).join(", ") || "Family";
            const callStatus = isInitiator
              ? log.status === "missed" ? "missed" : "ended"
              : joined ? "ended" : "missed";
            const kind = log.callType === "video" ? "video" : "voice";
            return {
              _id: String(log._id),
              uuid: `group-${log.callId}`,
              roomUuid: log.callId,
              roomId: log.callId,
              isGroup: true,
              callType: log.callType,
              familyIds: families.map((f) => String(f._id)),
              familyName,
              message:
                callStatus === "missed"
                  ? `Missed group ${kind} call`
                  : `Group ${kind} call`,
              senderId: initiatorId,
              senderName: `${log.initiator?.firstName || ""} ${log.initiator?.lastName || ""}`.trim(),
              receiverId: families[0] ? String(families[0]._id) : "",
              receiverName: familyName,
              receiverProfilePicture: "",
              participantsCount: (log.joined || []).length,
              timestamp: new Date(log.endedAt || log.createdAt).toISOString(),
              messageType: "call",
              callStatus,
              duration: callStatus === "missed" ? 0 : log.duration || 0,
              isCaller: isInitiator ? "true" : "false",
            };
          });
        } catch (groupErr) {
          console.error("❌ [get_calls] group call logs failed:", groupErr);
        }
      }

      const allCalls = [...mappedCalls, ...groupCalls].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      socket.emit("calls_list", allCalls);
    } catch (err) {
      console.error("❌ [get_calls] Error:", err);
    }
  });

  socket.on("get_conversations", async ({ userId: claimedUserId } = {}) => {
    const userId = authUserId(socket, claimedUserId);
    if (!userId) return;
    console.log(
      `📥 [get_conversations] Fetching inbox conversations for user: ${userId}`
    );
    try {
      if (userId) {
        const cleanUserId = userId.toString();
        onlineUsers.set(cleanUserId, socket.id);
        socket.userId = cleanUserId;
        socket.join(userRoom(cleanUserId));
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

      console.log(`📂 [get_conversations] ${conversations.length} conversation(s)`);

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

  socket.on("disconnect", async () => {
    console.log(`👋 [disconnect] Socket ${socket.id} disconnected`);

    const roomId = socket.roomId;
    const callInfo = roomId ? activeCalls.get(roomId) : null;
    if (callInfo) {
      const userId = socket.data?.callUserId;
      try {
        if (await userStillInCall(roomId, userId, socket.id)) {
          // An old socket timing out after the phone already reconnected.
        } else if (callInfo.answered) {
          // Answered call: give the phone time to reconnect.
          io.to(callRoom(roomId)).emit("kookohor-peer-reconnecting", { roomId });
          clearReconnectTimer(roomId);
          reconnectTimers.set(
            roomId,
            setTimeout(async () => {
              reconnectTimers.delete(roomId);
              if (activeCalls.get(roomId) !== callInfo) return;
              if (await userStillInCall(roomId, userId)) return;
              endCallOnServer(roomId, { reason: "peer-disconnected" }).catch((e) =>
                console.error("[disconnect] endCall failed:", e)
              );
            }, CALL_RECONNECT_GRACE_MS)
          );
        } else {
          await endCallOnServer(roomId, { reason: "peer-disconnected" });
        }
      } catch (e) {
        console.error("[disconnect] endCall failed:", e);
      }
    }

    if (socket.userId) {
      if (onlineUsers.get(socket.userId) === socket.id) {
        onlineUsers.delete(socket.userId);
      }
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
  });
});

// --- Kokohor feed sockets (Phase 2b) + group calls (Phase 2d) ---
// Additive: Socket.IO allows multiple "connection" listeners, each invoked
// with the same socket, so this cannot interfere with the handler above.
io.on("connection", (socket) => registerFeedSocketHandlers(io, socket));
registerGroupCallNamespace(io);

// --- DATABASE & SERVER START ---
mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("🟢 [Server] MongoDB Connected Successfully");

    // Safety Net vault release job (was defined but never started before).
    startSafetyNetCron(io);

    // (Removed: a startup dump of every user's email and push token.)
  })
  .catch((err) => console.error("🔴 [Server] MongoDB Connection Error:", err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 [Server] Kindred Auth Server running on port ${PORT}`);
});
