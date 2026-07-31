const mongoose = require("mongoose");
const Requesting = require("../../models/padiman_utility_models/Requesting");
const RequestingMessage = require("../../models/padiman_utility_models/RequestingMessage");
const PRUtility = require("../../models/padiman_utility_models/PRUtility");

let Wallet = require("../../models/padiman_utility_models/Wallet");
if (Wallet && Wallet.Wallet) Wallet = Wallet.Wallet;

let PruPayment = require("../../models/padiman_utility_models/PruPayment");
if (PruPayment && PruPayment.PruPayment) PruPayment = PruPayment.PruPayment;

// ── date helpers ──
function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 Sun
  const diff = day === 0 ? 6 : day - 1; // Monday start
  x.setDate(x.getDate() - diff);
  return x;
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function isWorkmanUser(user) {
  return !!(
    user?.isWorkman ||
    user?.role === "workman" ||
    user?.userType === "workman"
  );
}

/**
 * Build per-status breakdown for a list of Requesting docs.
 * Returns: { status, count, ids: [] }[]
 */
function buildStatusBreakdown(requests) {
  const map = new Map();
  for (const r of requests) {
    const status = r.status || "pending";
    if (!map.has(status)) {
      map.set(status, { status, count: 0, ids: [] });
    }
    const entry = map.get(status);
    entry.count += 1;
    entry.ids.push(r._id);
  }
  return Array.from(map.values());
}

/**
 * Split by itemType: work | hireEquipment
 */
function splitByItemType(requests) {
  const work = [];
  const hireEquipment = [];
  for (const r of requests) {
    if (r.itemType === "hireEquipment") hireEquipment.push(r);
    else work.push(r); // default "work"
  }
  return { work, hireEquipment };
}

function sumEarningsInRange(earnings, from, to) {
  if (!Array.isArray(earnings)) return 0;
  return earnings.reduce((sum, e) => {
    if (!e || e.status === "failed") return sum;
    const t = e.createdAt ? new Date(e.createdAt).getTime() : 0;
    if (t >= from.getTime() && t <= to.getTime()) {
      return sum + Number(e.amount || 0);
    }
    return sum;
  }, 0);
}

// =============================================================================
// 1. HOME DASHBOARD
//    Workman  → request counts/list (as requested/provider), earnings periods, recent payments (payer or receiver)
//    Non-workman → own requests (as requester), amount spent, recent payments (payer or receiver)
// =============================================================================
exports.getHomeDashboard = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.user;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const user = await PRUtility.findById(userId)
      .select("fullName username email isWorkman role userType profilePicture")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const workman = isWorkmanUser(user);

    // ─────────────────────────────────────────────
    // WORKMAN HOME
    // ─────────────────────────────────────────────
    if (workman) {
      // Requests where this user is the provider (requested)
      const providerRequests = await Requesting.find({ requested: userId })
        .select(
          "_id targetItem status itemType amount isPaid isConfirmed createdAt requester"
        )
        .populate("requester", "fullName username profilePicture email")
        .sort({ createdAt: -1 })
        .lean();

      const { work, hireEquipment } = splitByItemType(providerRequests);

      const workByStatus = buildStatusBreakdown(work);
      const equipmentByStatus = buildStatusBreakdown(hireEquipment);
      const allByStatus = buildStatusBreakdown(providerRequests);

      // Wallet earnings
      let wallet = await Wallet.findOne({ user: userId }).lean();
      const earnings = wallet?.earnings || [];

      const now = new Date();
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yStart = startOfDay(yesterday);
      const yEnd = endOfDay(yesterday);
      const weekStart = startOfWeek(now);
      const monthStart = startOfMonth(now);

      const earned = {
        today: sumEarningsInRange(earnings, todayStart, todayEnd),
        yesterday: sumEarningsInRange(earnings, yStart, yEnd),
        thisWeek: sumEarningsInRange(earnings, weekStart, todayEnd),
        thisMonth: sumEarningsInRange(earnings, monthStart, todayEnd),
        total: earnings
          .filter((e) => e.status !== "failed")
          .reduce((s, e) => s + Number(e.amount || 0), 0),
      };

      // Recent payments (as receiver or payer) — last 5
      let recentPayments = [];
      if (PruPayment && typeof PruPayment.find === "function") {
        recentPayments = await PruPayment.find({
          user: userId,
        })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate({
            path: "requestingId",
            select:
              "_id targetItem status itemType amount isPaid isConfirmed createdAt requester requested",
            populate: [
              {
                path: "requester",
                select: "fullName username profilePicture email",
              },
              {
                path: "requested",
                select: "fullName username profilePicture email",
              },
            ],
          })
          .populate("counterpartUser", "fullName username profilePicture email")
          .lean();
      }

      return res.status(200).json({
        success: true,
        role: "workman",
        user: {
          _id: user._id,
          fullName: user.fullName,
          username: user.username,
          profilePicture: user.profilePicture,
        },
        requests: {
          total: providerRequests.length,
          work: {
            total: work.length,
            byStatus: workByStatus,
            ids: work.map((r) => r._id),
            list: work,
          },
          hireEquipment: {
            total: hireEquipment.length,
            byStatus: equipmentByStatus,
            ids: hireEquipment.map((r) => r._id),
            list: hireEquipment,
          },
          allByStatus,
          list: providerRequests,
        },
        earnings: earned,
        wallet: {
          balance: wallet?.balance ?? 0,
          withdrawableBalance: wallet?.withdrawableBalance ?? 0,
        },
        recentPayments,
      });
    }

    // ─────────────────────────────────────────────
    // NON-WORKMAN HOME
    // ─────────────────────────────────────────────
    const myRequests = await Requesting.find({ requester: userId })
      .select(
        "_id targetItem status itemType amount isPaid isConfirmed isAgreed createdAt requested"
      )
      .populate("requested", "fullName username profilePicture email")
      .sort({ createdAt: -1 })
      .lean();

    const { work, hireEquipment } = splitByItemType(myRequests);

    const workByStatus = buildStatusBreakdown(work);
    const equipmentByStatus = buildStatusBreakdown(hireEquipment);
    const allByStatus = buildStatusBreakdown(myRequests);

    // Amount spent (successful payments as payer)
    let amountSpent = 0;
    let recentPayments = [];
    if (PruPayment && typeof PruPayment.find === "function") {
      const paid = await PruPayment.find({
        user: userId,
        role: "payer",
        status: "success",
      })
        .select("amount status createdAt")
        .lean();

      amountSpent = paid.reduce((s, p) => s + Number(p.amount || 0), 0);

      recentPayments = await PruPayment.find({
        user: userId,
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate({
          path: "requestingId",
          select:
            "_id targetItem status itemType amount isPaid isConfirmed createdAt requester requested",
          populate: [
            {
              path: "requester",
              select: "fullName username profilePicture email",
            },
            {
              path: "requested",
              select: "fullName username profilePicture email",
            },
          ],
        })
        .populate("counterpartUser", "fullName username profilePicture email")
        .lean();
    }

    // Fallback: sum isPaid request amounts if no PruPayment rows
    if (amountSpent === 0) {
      amountSpent = myRequests
        .filter((r) => r.isPaid)
        .reduce((s, r) => s + Number(r.amount || 0), 0);
    }

    return res.status(200).json({
      success: true,
      role: "client",
      user: {
        _id: user._id,
        fullName: user.fullName,
        username: user.username,
        profilePicture: user.profilePicture,
      },
      requests: {
        total: myRequests.length,
        work: {
          total: work.length,
          byStatus: workByStatus,
          ids: work.map((r) => r._id),
          list: work,
        },
        hireEquipment: {
          total: hireEquipment.length,
          byStatus: equipmentByStatus,
          ids: hireEquipment.map((r) => r._id),
          list: hireEquipment,
        },
        allByStatus,
        list: myRequests,
      },
      spending: {
        totalSpent: amountSpent,
      },
      recentPayments,
    });
  } catch (error) {
    console.error("[GET HOME DASHBOARD ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching home dashboard",
      error: error.message,
    });
  }
};

// =============================================================================
// 2. GET ALL PAYMENTS FOR USER (Whether Receiver or Payer)
// =============================================================================
exports.getMyPayments = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.user;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!PruPayment || typeof PruPayment.find !== "function") {
      return res.status(500).json({
        success: false,
        message: "PruPayment model not initialized",
      });
    }

    // Fetches all payments where the user is either payer or receiver
    const payments = await PruPayment.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate({
        path: "requestingId",
        select:
          "_id targetItem status itemType amount isPaid isConfirmed createdAt requester requested",
        populate: [
          {
            path: "requester",
            select: "fullName username profilePicture email",
          },
          {
            path: "requested",
            select: "fullName username profilePicture email",
          },
        ],
      })
      .populate("counterpartUser", "fullName username profilePicture email")
      .lean();

    return res.status(200).json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    console.error("[GET MY PAYMENTS ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching payments",
      error: error.message,
    });
  }
};

// =============================================================================
// 3. MESSAGES PER REQUEST (everyone)
//    Returns an array of { requestId, request, unreadCount, lastMessage, messages }
//    for every Requesting the user is part of (requester or requested).
// =============================================================================
exports.getMessagesPerRequest = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.user;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const limitPerRequest = Math.min(Number(req.query.limit) || 50, 100);
    const onlyWithMessages = req.query.onlyWithMessages === "true";

    // All requests involving this user
    const requests = await Requesting.find({
      $or: [{ requester: userId }, { requested: userId }],
    })
      .select(
        "_id targetItem status itemType amount isPaid isAgreed isConfirmed requester requested createdAt updatedAt"
      )
      .populate("requester", "fullName username profilePicture email")
      .populate("requested", "fullName username profilePicture email")
      .sort({ updatedAt: -1 })
      .lean();

    if (!requests.length) {
      return res.status(200).json({
        success: true,
        count: 0,
        threads: [],
      });
    }

    const requestIds = requests.map((r) => r._id);

    // All messages for those requests
    const allMessages = await RequestingMessage.find({
      request: { $in: requestIds },
    })
      .sort({ createdAt: -1 })
      .populate("sender", "fullName username profilePicture email")
      .lean();

    // Group by request
    const byRequest = new Map();
    for (const msg of allMessages) {
      const key = msg.request?.toString?.() || String(msg.request);
      if (!byRequest.has(key)) byRequest.set(key, []);
      byRequest.get(key).push(msg);
    }

    const threads = [];

    for (const reqDoc of requests) {
      const key = reqDoc._id.toString();
      const msgs = byRequest.get(key) || [];

      if (onlyWithMessages && msgs.length === 0) continue;

      // newest first already from sort; limit
      const limited = msgs.slice(0, limitPerRequest);

      const unreadCount = msgs.filter(
        (m) =>
          !m.isRead &&
          m.sender &&
          String(m.sender._id || m.sender) !== String(userId)
      ).length;

      const lastMessage = msgs[0]
        ? {
            _id: msgs[0]._id,
            text: msgs[0].text,
            type: msgs[0].type,
            isPriceSet: msgs[0].isPriceSet,
            price: msgs[0].price,
            sender: msgs[0].sender,
            createdAt: msgs[0].createdAt,
          }
        : null;

      threads.push({
        requestId: reqDoc._id,
        request: reqDoc,
        messageCount: msgs.length,
        unreadCount,
        lastMessage,
        messages: limited,
      });
    }

    // Sort threads by last message time (or request updatedAt)
    threads.sort((a, b) => {
      const ta = a.lastMessage?.createdAt
        ? new Date(a.lastMessage.createdAt).getTime()
        : a.request?.updatedAt
        ? new Date(a.request.updatedAt).getTime()
        : 0;
      const tb = b.lastMessage?.createdAt
        ? new Date(b.lastMessage.createdAt).getTime()
        : b.request?.updatedAt
        ? new Date(b.request.updatedAt).getTime()
        : 0;
      return tb - ta;
    });

    return res.status(200).json({
      success: true,
      count: threads.length,
      threads,
    });
  } catch (error) {
    console.error("[GET MESSAGES PER REQUEST ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching messages per request",
      error: error.message,
    });
  }
};

// =============================================================================
// 4. MESSAGES FOR A SINGLE REQUEST
// =============================================================================
exports.getMessagesByRequestId = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.user;
    const { requestId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request ID",
      });
    }

    const requestDoc = await Requesting.findById(requestId)
      .populate("requester", "fullName username profilePicture email")
      .populate("requested", "fullName username profilePicture email")
      .lean();

    if (!requestDoc) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    const isParticipant =
      String(requestDoc.requester?._id || requestDoc.requester) ===
        String(userId) ||
      String(requestDoc.requested?._id || requestDoc.requested) ===
        String(userId);

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to this request chat",
      });
    }

    const messages = await RequestingMessage.find({ request: requestId })
      .sort({ createdAt: 1 }) // chronological for chat UI
      .populate("sender", "fullName username profilePicture email")
      .lean();

    // Mark as read for this user (optional side-effect)
    await RequestingMessage.updateMany(
      {
        request: requestId,
        sender: { $ne: userId },
        isRead: false,
      },
      {
        $set: { isRead: true },
        $addToSet: { readBy: userId },
      }
    );

    return res.status(200).json({
      success: true,
      request: requestDoc,
      count: messages.length,
      messages,
    });
  } catch (error) {
    console.error("[GET MESSAGES BY REQUEST ID ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching messages",
      error: error.message,
    });
  }
};
