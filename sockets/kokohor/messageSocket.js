const Message = require("../../models/kokohor/Message");
const User = require("../../models/kokohor/User");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");
const { sendPushNotificationToUser } = require("../../utils/notifyUser");
const { userRoom } = require("../../config/kokohor/socketRooms");
const { isBlockedBetween } = require("../../utils/kokohor/moderation");
const { authUserId } = require("../../middlewares/kokohor/socketAuth");

/**
 * A user may only read/write a DM room they belong to: the room id is built
 * from both user ids (members screen) or they already have messages in it.
 */
async function canAccessRoom(userId, roomUuid) {
  if (!userId || !roomUuid) return false;
  if (String(roomUuid).includes(String(userId))) return true;
  try {
    return !!(await Message.exists({
      roomUuid,
      $or: [{ senderId: String(userId) }, { receiverId: String(userId) }],
    }));
  } catch {
    return false;
  }
}

/**
 * Dedicated Kokohor 1-1 chat module, extracted verbatim (same event names,
 * same payload shapes, same DB/push side effects) from index.js's single
 * giant `io.on("connection", ...)` handler, where this used to live
 * interleaved with the PR-module chat handlers and the 1-1 call signaling.
 *
 * Deliberately NOT moved here (left in index.js): `get_calls`,
 * `get_conversations`, and `disconnect` — those three are entangled with
 * both messaging AND the 1-1 "kookohor-*" call presence/online-status logic
 * (`onlineUsers`, `User.isOnline`/`socketId`), so extracting them separately
 * from the call code they share state with was judged higher-risk than
 * reward for this pass. `onlineUsers` itself also stays owned by index.js
 * and is passed in by reference (same Map instance) so "who's online"
 * bookkeeping for calls and messaging never drifts apart.
 *
 * No event names, payloads, or behavior changed — this is a pure extraction.
 */
function registerMessageSocketHandlers(io, socket, { onlineUsers }) {
  socket.on("register_user", async ({ userId: claimedUserId } = {}) => {
    const userId = authUserId(socket, claimedUserId);
    if (!userId) return;
    const cleanUserId = userId.toString();
    onlineUsers.set(cleanUserId, socket.id);
    socket.userId = cleanUserId;
    socket.join(userRoom(cleanUserId));
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

  socket.on("join_room", async (data) => {

    const { uuid } = data || {};
    const userId = authUserId(socket, data?.userId);
    if (!uuid) {
      console.log("⚠️ [join_room] FAILED: Missing uuid in payload");
      return;
    }
    if (!userId || !(await canAccessRoom(userId, uuid))) {
      return socket.emit("error", { message: "Not allowed to open this conversation" });
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
      console.log(`📖 [join_room] marked ${updateResult.modifiedCount || 0} read`);

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
          ...(msg.messageType === "call" && {
            callStatus: msg.callStatus || "ended",
            callType: msg.callType || "audio",
          }),
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

    const senderId = authUserId(socket, data?.userId);
    if (!senderId) {
      return socket.emit("message_error", { messageUuid: data?.messageUuid, error: "unauthorized" });
    }
    const {
      uuid: roomUuid,
      message: textMessage,
      fullName: senderName,
      receiverId,
      messageUuid,
      messageType = "text",
      mediaUri: base64Media,
      duration = 0,
      receiverProfilePicture = "",
      senderProfilePicture = "",
    } = data;

    if (!roomUuid || !senderId || !receiverId || !messageUuid) {
      console.error(`❌ [send_message] Missing required fields in payload.`);
      return socket.emit("error", { message: "Missing required fields" });
    }

    if (!(await canAccessRoom(senderId, roomUuid))) {
      return socket.emit("message_error", { messageUuid, error: "unauthorized" });
    }
    if (String(receiverId) === String(senderId)) {
      return socket.emit("message_error", { messageUuid, error: "invalid receiver" });
    }

    // Block check: either side blocked the other → don't deliver.
    if (await isBlockedBetween(senderId, receiverId)) {
      return socket.emit("message_error", {
        messageUuid,
        error: "blocked",
        message: "You can't message this user.",
      });
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
            { messageType, url: uploadedUrl, room: roomUuid },
            null,
            2
          )
        );
      }

      console.log(`⏳ [send_message] Saving new general chat message to DB...`);
      const newMessage = new Message({
        roomUuid,
        message:
          textMessage ||
          (messageType === "image"
            ? "Sent a photo"
            : messageType === "video"
            ? "Sent a video"
            : messageType === "voice"
            ? "Sent a voice message"
            : "New message"),
        senderName: senderName || "User",
        senderId,
        receiverId,
        messageUuid,
        messageType,
        imageuri,
        videouri,
        audioUri,
        duration,
        receiverProfilePicture,
        senderProfilePicture,
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
        senderProfilePicture: newMessage.senderProfilePicture,
        receiverProfilePicture: newMessage.receiverProfilePicture,
      };


      io.to(roomUuid).emit("receive_message", messageToSend);
      console.log(
        `✅ [send_message] Broadcasted 'receive_message' to room: ${roomUuid}`
      );

      try {
        let notificationBody = newMessage.message;
        if (messageType === "image") notificationBody = "Sent a photo";
        else if (messageType === "video") notificationBody = "Sent a video";
        else if (messageType === "voice")
          notificationBody = "Sent a voice message";

        await sendPushNotificationToUser(receiverId, {
          title: senderName || "New Message",
          body: notificationBody,
          router: "/messages/chat",
          data: {
            type: "chat_message",
            uuid: roomUuid,
            messageUuid,
            senderId,
            senderName: newMessage.senderName,
            receiverId,
            receiverName: data.receiverName || "",
            receiverProfilePicture: newMessage.receiverProfilePicture,
            senderProfilePicture: newMessage.receiverProfilePicture,
            messageType,
          },
          sound: "default",
        });

        console.log(
          `🔔 [send_message] Push notification sent to receiver: ${receiverId}`
        );
      } catch (notifErr) {
        console.error(
          "❌ [send_message] Failed to send push notification:",
          notifErr
        );
      }

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

      io.to(receiverId).emit(`latest_msg_${receiverId}`, {
        roomUuid,
        lastMessage: newMessage.message,
        timestamp: newMessage.timestamp,
        senderId,
        senderName: newMessage.senderName,
        receiverId,
        unreadCount,
        profilePicture: newMessage.senderProfilePicture,
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
    async ({ uuid, messageUuid, newMessage, userId: claimedUserId }) => {
      const userId = authUserId(socket, claimedUserId);
      if (!userId) return socket.emit("error", { message: "Access denied" });
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

        io.to(msg.roomUuid || uuid).emit("message_edited", {
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

  socket.on("mark_messages_read", async ({ uuid, userId: claimedUserId } = {}) => {
    const userId = authUserId(socket, claimedUserId);
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
    async ({ uuid, messageUuid, userId: claimedUserId, forEveryone }) => {
      const userId = authUserId(socket, claimedUserId);
      if (!userId) return;
      try {
        const msg = await Message.findOne({ messageUuid });
        if (!msg) return;

        if (forEveryone && msg.senderId === userId) {
          await Message.deleteOne({ messageUuid });
          io.to(msg.roomUuid || uuid).emit("message_deleted", { uuid: messageUuid });
        } else {
          socket.emit("message_deleted", { uuid: messageUuid });
        }
      } catch (err) {
        console.error("❌ [delete_message] Delete failed:", err);
      }
    }
  );

  socket.on("typing", (data) => {
    if (!data?.uuid || !socket.rooms.has(data.uuid)) return; // only rooms you joined
    socket.to(data.uuid).emit("user_typing", {
      roomUuid: data.uuid,
      name: data.fullName,
      isTyping: true,
    });
  });

  socket.on("stop_typing", (data) => {
    if (!data?.uuid || !socket.rooms.has(data.uuid)) return;
    socket.to(data.uuid).emit("user_typing", {
      roomUuid: data.uuid,
      isTyping: false,
    });
  });
}

module.exports = { registerMessageSocketHandlers };
