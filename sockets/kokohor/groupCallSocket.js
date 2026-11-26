const crypto = require("crypto");
const Family = require("../../models/kokohor/Family");
const { userRoom, familyRoom, groupCallRoom } = require("../../config/kokohor/socketRooms");
const { sendGroupCallRingingPush } = require("../../services/kokohor/pushService");
const { isFamilyMember } = require("../../middlewares/kokohor/familyAccess");
const GroupCallLog = require("../../models/kokohor/GroupCallLog");
const UnifiedContent = require("../../models/kokohor/UnifiedContent");
const User = require("../../models/kokohor/User");
const Notification = require("../../models/kokohor/Notification");
const { sendPushNotificationToUser } = require("../../utils/notifyUser");
const { filterUnmuted } = require("../../utils/kokohor/moderation");
const { authUserId } = require("../../middlewares/kokohor/socketAuth");

/**
 * Dedicated Socket.IO namespace for Kokohor Group Calls, separate from the
 * existing 1-1 "kookohor-*" call events already wired directly into
 * index.js's main-namespace connection handler. Supports 1-on-1,
 * single-family, and multi-family audio/video calls.
 *
 * Clients connect to `${SERVER_URL}/kokohor-group-calls` for the signaling
 * itself, while incoming-call *notification* ("kokohor:group-call:incoming")
 * is emitted on the main "/" namespace's existing per-user room
 * (`user:<id>`, see config/kokohor/socketRooms.js) so a client doesn't have
 * to pre-connect to this namespace just to find out it's being called.
 *
 * In-memory only (activeCalls Map) — acceptable for a single-process
 * deployment; a multi-instance deployment would need this backed by Redis
 * (out of scope here, flagged in the Phase 3 verification notes).
 *
 * --- Bug-fix pass (this turn) -------------------------------------------
 * 1. Duplicate join/ringing: a retried "group-call:start" from the same
 *    caller while their previous call is still active used to spin up a
 *    SECOND call record and ring everyone a second time. `initiatorActiveCall`
 *    now de-dupes per-caller and just returns the existing callId.
 * 2. Stale participants on disconnect/reconnect: if a user's socket drops
 *    and reconnects (new socket.id) before the old one's "disconnect" event
 *    is processed, "group-call:join"/"start" used to leave BOTH entries in
 *    `participants`, so everyone else saw a ghost duplicate participant.
 *    `upsertParticipant()` now removes any existing entry for that userId in
 *    the call before adding the new socket.
 * 3. Missing media-state sync for a participant who joins mid-call: already
 *    covered (the join ack returns the full current `participants` list with
 *    live audioMuted/videoOff/screenSharing), kept as-is, documented so this
 *    isn't "fixed" into something it wasn't.
 * 4. Malformed/unauthorized offer/answer/ice-candidate routing: these used
 *    to blindly relay to any `targetSocketId` string a client sent, with no
 *    check that the target was actually a participant in that call (or that
 *    the call even existed) — a typo'd id silently no-op'd, and a malicious
 *    client could probe/relay to arbitrary sockets in the namespace.
 *    `relayToParticipant()` now validates both.
 * 5. Broken call cleanup: "group-call:end" deleted the call record but never
 *    forced lingering sockets out of its room, and never cleared
 *    `initiatorActiveCall`, so a new call from the same initiator right after
 *    ending one could be mistaken for still-active. Both are cleared now,
 *    and `nsp.in(room).socketsLeave(room)` forcibly evicts stragglers.
 */

/**
 * callId -> { callId, familyIds: string[], callType, initiatorId,
 *   participants: Map<socketId, {userId, audioMuted, videoOff, screenSharing}>,
 *   startedAt: Date, connectedAt: Date|null, invitedIds: string[], joinedIds: Set<string>,
 *   logged: boolean }
 */
const activeCalls = new Map();

/** callerId -> callId, so a retried "start" from the same caller is idempotent. */
const initiatorActiveCall = new Map();

async function memberUserIdsForFamilies(familyIds) {
  const families = await Family.find({ _id: { $in: familyIds } }).select("owner members").lean();
  // `owner` is schema'd as an array, but some older Family documents were
  // written back when it was a single ObjectId — normalize either shape.
  const toIdArray = (v) => (v === null || v === undefined ? [] : Array.isArray(v) ? v : [v]);
  const ids = new Set();
  for (const f of families) {
    toIdArray(f.owner).forEach((id) => ids.add(id.toString()));
    toIdArray(f.members).forEach((id) => ids.add(id.toString()));
  }
  return [...ids];
}

async function userBelongsToAnyFamily(userId, familyIds) {
  for (const fid of familyIds) {
    // eslint-disable-next-line no-await-in-loop
    if (await isFamilyMember(userId, fid)) return true;
  }
  return false;
}

function participantList(call) {
  return [...call.participants.entries()].map(([socketId, p]) => ({ socketId, ...p }));
}

/** Removes any existing participant entry for this userId (stale socket from a drop/reconnect) before adding the new one. */
function upsertParticipant(call, socketId, userId, extra = {}) {
  for (const [sid, p] of call.participants.entries()) {
    if (sid !== socketId && p.userId === userId) call.participants.delete(sid);
  }
  call.participants.set(socketId, {
    userId,
    audioMuted: false,
    videoOff: false,
    screenSharing: false,
    ...extra,
  });
}

function broadcastActiveStatus(io, call, active) {
  for (const familyId of call.familyIds) {
    io.to(familyRoom(familyId)).emit("kokohor:group-call:active-status", {
      callId: call.callId,
      familyId,
      active,
      callType: call.callType,
    });
  }
}

function formatDuration(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const parts = [];
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0 || hrs > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(" ");
}

/**
 * Persists a finished call (GroupCallLog), posts a `group_call` card into
 * the family chat timeline, records missed-call notifications for invitees
 * who never joined, and pings everyone involved so their Calls tab refreshes.
 * Best-effort: never throws.
 */
async function logGroupCall(io, call) {
  if (call.logged) return;
  call.logged = true;
  try {
    const endedAt = new Date();
    const startedAt = call.startedAt || endedAt;
    const joinedIds = [...(call.joinedIds || new Set([call.initiatorId]))];
    const invitedIds = (call.invitedIds || []).filter((id) => id !== call.initiatorId);
    const someoneAnswered = joinedIds.some((id) => id !== call.initiatorId);
    const status = someoneAnswered ? "ended" : "missed";
    const duration = someoneAnswered && call.connectedAt
      ? Math.max(0, Math.floor((endedAt.getTime() - call.connectedAt.getTime()) / 1000))
      : 0;
    const missedIds = invitedIds.filter((id) => !joinedIds.includes(id));

    await GroupCallLog.create({
      callId: call.callId,
      familyIds: call.familyIds,
      callType: call.callType === "video" ? "video" : "audio",
      initiator: call.initiatorId,
      invited: invitedIds,
      joined: joinedIds,
      status,
      startedAt,
      connectedAt: call.connectedAt || null,
      endedAt,
      duration,
    });

    const initiator = await User.findById(call.initiatorId).select("firstName lastName").lean();
    const initiatorName =
      `${initiator?.firstName || ""} ${initiator?.lastName || ""}`.trim() || "A family member";
    const kind = call.callType === "video" ? "video" : "voice";
    const title = status === "missed" ? `Missed group ${kind} call` : `Group ${kind} call`;
    const body = status === "missed"
      ? `${initiatorName} started a group ${kind} call — no one joined`
      : `${joinedIds.length} joined · ${formatDuration(duration)}`;

    // One chat card, visible in every family the call was placed in.
    const [homeFamily, ...otherFamilies] = call.familyIds;
    if (homeFamily) {
      const content = await UnifiedContent.create({
        type: "group_call",
        family: homeFamily,
        author: call.initiatorId,
        visibility: otherFamilies.length ? "family_group" : "family",
        familyGroupIds: otherFamilies.length ? call.familyIds : [],
        title,
        body,
        meta: {
          callId: call.callId,
          callType: call.callType,
          status,
          duration,
          familyIds: call.familyIds,
          initiatorId: call.initiatorId,
          invitedIds,
          joinedIds,
          missedIds,
        },
      });
      await content.populate("author", "firstName lastName profilePicture");
      for (const fid of call.familyIds) io.to(familyRoom(fid)).emit("kokohor:feed:created", content);
    }

    // Missed-call notices for everyone who was rung but never joined.
    await Promise.all(
      missedIds.map(async (uid) => {
        try {
          await Notification.create({
            recipient: uid,
            familyId: homeFamily,
            type: "GROUP_CALL_MISSED",
            title: `Missed group ${kind} call`,
            message: `You missed a group ${kind} call from ${initiatorName}`,
          });
          await sendPushNotificationToUser(uid, {
            title: `Missed group ${kind} call`,
            body: `You missed a group ${kind} call from ${initiatorName}`,
            router: "/(tabs)/inbox",
          });
        } catch (e) {
          console.error("[groupCallSocket] missed-call notice failed:", e.message);
        }
      })
    );

    const involved = [...new Set([call.initiatorId, ...invitedIds, ...joinedIds])];
    io.to(involved.map(userRoom)).emit("kokohor:group-call:logged", {
      callId: call.callId,
      familyIds: call.familyIds,
      status,
    });
  } catch (err) {
    console.error("[groupCallSocket] logGroupCall failed:", err.message);
  }
}

function endCallRecord(io, nsp, call) {
  activeCalls.delete(call.callId);
  logGroupCall(io, call);
  if (initiatorActiveCall.get(call.initiatorId) === call.callId) {
    initiatorActiveCall.delete(call.initiatorId);
  }
  broadcastActiveStatus(io, call, false);
  const room = groupCallRoom(call.callId);
  nsp.to(room).emit("group-call:ended", { callId: call.callId });
  nsp.in(room).socketsLeave(room);
}

function registerGroupCallNamespace(io) {
  const nsp = io.of("/kokohor-group-calls");

  /** Validates callId + targetSocketId before relaying a signaling message. */
  function relayToParticipant(event, { callId, targetSocketId, senderSocketId, ...rest }) {
    const call = activeCalls.get(callId);
    if (!call) return; // call already ended — drop late signaling silently
    if (!call.participants.has(targetSocketId)) return; // not a real participant of this call
    nsp.to(targetSocketId).emit(event, { callId, senderSocketId, ...rest });
  }

  nsp.on("connection", (socket) => {
    socket.on("group-call:start", async ({ familyIds, callerId: claimedCallerId, callType = "audio", targetUserIds } = {}, ack) => {
      try {
        const callerId = authUserId(socket, claimedCallerId);
        if (!Array.isArray(familyIds) || familyIds.length === 0 || !callerId) {
          return ack?.({ ok: false, message: "familyIds[] and an authenticated caller are required" });
        }
        // The caller must belong to every family they're calling.
        for (const fid of familyIds) {
          // eslint-disable-next-line no-await-in-loop
          if (!(await isFamilyMember(callerId, fid))) {
            return ack?.({ ok: false, message: "Not a member of one of these families" });
          }
        }

        const existingCallId = initiatorActiveCall.get(callerId);
        if (existingCallId && activeCalls.has(existingCallId)) {
          const existing = activeCalls.get(existingCallId);
          socket.join(groupCallRoom(existingCallId));
          socket.data.callId = existingCallId;
          socket.data.userId = callerId;
          upsertParticipant(existing, socket.id, callerId, { videoOff: existing.callType === "audio" });
          return ack?.({ ok: true, callId: existingCallId, participants: participantList(existing), deduped: true });
        }

        const callId = crypto.randomUUID();
        const call = {
          callId,
          familyIds: familyIds.map(String),
          callType,
          initiatorId: callerId,
          participants: new Map(),
          startedAt: new Date(),
          connectedAt: null,
          invitedIds: [],
          joinedIds: new Set([String(callerId)]),
          logged: false,
        };
        activeCalls.set(callId, call);
        initiatorActiveCall.set(callerId, callId);

        socket.join(groupCallRoom(callId));
        socket.data.callId = callId;
        socket.data.userId = callerId;
        upsertParticipant(call, socket.id, callerId, { videoOff: callType === "audio" });

        const memberIds = await memberUserIdsForFamilies(call.familyIds);
        // Optional subset — "just a few people" instead of the whole family —
        // always intersected with real membership so a client can't ring
        // someone who isn't actually a member of these families.
        const eligibleIds = Array.isArray(targetUserIds) && targetUserIds.length > 0
          ? memberIds.filter((id) => targetUserIds.map(String).includes(id))
          : memberIds;
        // Skip anyone who blocked/snoozed the caller or one of these families.
        let targetIds = eligibleIds.filter((id) => id !== callerId);
        for (const fid of call.familyIds) {
          // eslint-disable-next-line no-await-in-loop
          targetIds = await filterUnmuted(targetIds, { senderId: callerId, familyId: fid });
        }
        call.invitedIds = targetIds;

        const payload = { callId, callerId, callType, familyIds: call.familyIds };
        io.to(targetIds.map(userRoom)).emit("kokohor:group-call:incoming", payload);
        sendGroupCallRingingPush(targetIds, { type: "group_call_incoming", ...payload }).catch((e) =>
          console.error("[groupCallSocket] ringing push failed:", e.message)
        );

        broadcastActiveStatus(io, call, true);
        ack?.({ ok: true, callId, participants: participantList(call) });
      } catch (err) {
        console.error("[groupCallSocket] start error:", err);
        ack?.({ ok: false, message: "Failed to start group call" });
      }
    });

    socket.on("group-call:join", async ({ callId, userId: claimedUserId } = {}, ack) => {
      const userId = authUserId(socket, claimedUserId);
      try {
        const call = activeCalls.get(callId);
        if (!call) return ack?.({ ok: false, message: "Call not found or already ended" });
        if (!userId) return ack?.({ ok: false, message: "userId is required" });

        const authorized = await userBelongsToAnyFamily(userId, call.familyIds);
        if (!authorized) return ack?.({ ok: false, message: "Not authorized to join this call" });

        socket.join(groupCallRoom(callId));
        socket.data.callId = callId;
        socket.data.userId = userId;
        upsertParticipant(call, socket.id, userId);
        if (call.joinedIds) call.joinedIds.add(String(userId));
        if (!call.connectedAt && String(userId) !== String(call.initiatorId)) {
          call.connectedAt = new Date();
        }

        nsp.to(groupCallRoom(callId)).emit("group-call:participant-joined", {
          callId,
          socketId: socket.id,
          userId,
          participants: participantList(call),
        });

        ack?.({ ok: true, participants: participantList(call), callType: call.callType });
      } catch (err) {
        console.error("[groupCallSocket] join error:", err);
        ack?.({ ok: false, message: "Failed to join group call" });
      }
    });

    socket.on("group-call:media-state", ({ callId, audioMuted, videoOff, screenSharing }) => {
      const call = activeCalls.get(callId);
      if (!call) return;
      const participant = call.participants.get(socket.id);
      if (!participant) return;
      Object.assign(participant, {
        ...(audioMuted !== undefined && { audioMuted }),
        ...(videoOff !== undefined && { videoOff }),
        ...(screenSharing !== undefined && { screenSharing }),
      });
      nsp.to(groupCallRoom(callId)).emit("group-call:participant-media-updated", {
        callId,
        socketId: socket.id,
        userId: participant.userId,
        audioMuted: participant.audioMuted,
        videoOff: participant.videoOff,
        screenSharing: participant.screenSharing,
      });
    });

    // ---- WebRTC signaling relay (mesh topology — fine for small group calls) ----
    // Each relay now validates the call is still active and the target is an
    // actual participant of it before forwarding (see fix #4 above).
    socket.on("group-call:offer", (payload) => relayToParticipant("group-call:offer", { ...payload, senderSocketId: socket.id }));
    socket.on("group-call:answer", (payload) => relayToParticipant("group-call:answer", { ...payload, senderSocketId: socket.id }));
    socket.on("group-call:ice-candidate", (payload) => relayToParticipant("group-call:ice-candidate", { ...payload, senderSocketId: socket.id }));

    function leaveCall(callId) {
      const call = activeCalls.get(callId);
      if (!call) return;
      const participant = call.participants.get(socket.id);
      call.participants.delete(socket.id);
      socket.leave(groupCallRoom(callId));

      nsp.to(groupCallRoom(callId)).emit("group-call:participant-left", {
        callId,
        socketId: socket.id,
        userId: participant?.userId,
        participants: participantList(call),
      });

      if (call.participants.size === 0) {
        endCallRecord(io, nsp, call);
      }
    }

    socket.on("group-call:leave", ({ callId }) => leaveCall(callId));

    socket.on("group-call:end", ({ callId } = {}) => {
      const call = activeCalls.get(callId);
      if (!call) return;
      // Only the person who started it can end it for everyone.
      const me = socket.data.userId;
      if (!me || String(me) !== String(call.initiatorId)) return;
      endCallRecord(io, nsp, call);
    });

    socket.on("disconnect", () => {
      if (socket.data.callId) leaveCall(socket.data.callId);
    });
  });

  return nsp;
}

module.exports = { registerGroupCallNamespace, activeCalls };
