const Requesting = require("../../models/padiman_utility_models/Requesting");
const Work = require("../../models/padiman_utility_models/Work");
const HireEquipment = require("../../models/padiman_utility_models/HireEquipment");
const PRUtility = require("../../models/padiman_utility_models/PRUtility");

// Optional: import escrow helper from payment controller
let releaseEscrowForRequesting = null;
try {
  const payCtrl = require("./pru.payments.controller"); // adjust path to your payment controller file
  releaseEscrowForRequesting = payCtrl.releaseEscrowForRequesting;
} catch (_) {
  // fallback inline if path differs — see release block inside updateRequestStatus
}

// ==========================================
// 1. CREATE REQUEST
// ==========================================
const createRequest = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { targetItemId, itemType, amount, meta } = req.body;

    if (!targetItemId || !itemType) {
      return res.status(400).json({
        success: false,
        message: "Target item ID and item type are required",
      });
    }

    let targetItemDoc;
    let itemTypeModel;
    let providerId;

    if (itemType === "work") {
      targetItemDoc = await Work.findById(targetItemId);
      itemTypeModel = "Work";
      if (targetItemDoc) providerId = targetItemDoc.workman;
    } else if (itemType === "hireEquipment") {
      targetItemDoc = await HireEquipment.findById(targetItemId);
      itemTypeModel = "HireEquipment";
      if (targetItemDoc) providerId = targetItemDoc.owner;
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid item type. Must be 'work' or 'hireEquipment'",
      });
    }

    if (!targetItemDoc) {
      return res.status(404).json({
        success: false,
        message: "Target item not found",
      });
    }

    if (providerId.toString() === userId.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot request your own service or equipment",
      });
    }

    const newRequest = await Requesting.create({
      targetItem: targetItemId,
      itemType,
      itemTypeModel,
      requester: userId,
      requested: providerId,
      amount: amount !== undefined ? Number(amount) : 0,
      meta: meta || {},
    });

    const populatedRequest = await Requesting.findById(newRequest._id)
      .populate("requester", "fullName username email phone profilePicture")
      .populate("requested", "fullName username email phone profilePicture")
      .populate("targetItem");

    return res.status(201).json({
      success: true,
      message: "Request sent successfully",
      request: populatedRequest,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================================
// 2. GET USER REQUESTS
// ==========================================
const getUserRequests = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const requests = await Requesting.find({
      $or: [{ requester: userId }, { requested: userId }],
    })
      .populate("requester", "fullName username email phone profilePicture")
      .populate("requested", "fullName username email phone profilePicture")
      .populate("targetItem")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================================
// 3. GET SINGLE REQUEST
// ==========================================
const getRequestById = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const request = await Requesting.findById(req.params.id)
      .populate("requester", "-password")
      .populate("requested", "-password")
      .populate("targetItem");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    const isParticipant =
      request.requester._id.toString() === userId.toString() ||
      request.requested._id.toString() === userId.toString();

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to this request",
      });
    }

    return res.status(200).json({
      success: true,
      request,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================================
// 4. UPDATE REQUEST STATUS
// When isConfirmed / status "confirmed" → release escrow to withdrawable
// ==========================================
const updateRequestStatus = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;
    const {
      status,
      isPaid,
      isAgreed,
      isOngoing,
      isDoneOrCompleted,
      isConfirmed,
      rating,
      review,
    } = req.body;

    const request = await Requesting.findById(id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    const isParticipant =
      request.requester.toString() === userId.toString() ||
      request.requested.toString() === userId.toString();

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to update this request",
      });
    }

    const wasConfirmed =
      request.isConfirmed === true || request.status === "confirmed";

    if (status) request.status = status;
    if (typeof isPaid !== "undefined") request.isPaid = isPaid;
    if (typeof isAgreed !== "undefined") request.isAgreed = isAgreed;
    if (typeof isOngoing !== "undefined") request.isOngoing = isOngoing;
    if (typeof isDoneOrCompleted !== "undefined")
      request.isDoneOrCompleted = isDoneOrCompleted;
    if (typeof isConfirmed !== "undefined") request.isConfirmed = isConfirmed;
    if (rating !== undefined) request.rating = rating;
    if (review !== undefined) request.review = review;

    await request.save();

    // ── Release escrow when newly confirmed ──
    const nowConfirmed =
      request.isConfirmed === true || request.status === "confirmed";

    let escrowResult = null;
    if (nowConfirmed && !wasConfirmed) {
      try {
        if (typeof releaseEscrowForRequesting === "function") {
          escrowResult = await releaseEscrowForRequesting(request._id);
        } else {
          // Inline fallback
          let Wallet = require("../../models/padiman_utility_models/Wallet");
          if (Wallet && Wallet.Wallet) Wallet = Wallet.Wallet;

          const wallet = await Wallet.findOne({
            "earnings.negotiationId": request._id,
          });

          if (wallet) {
            const idx = wallet.earnings.findIndex(
              (e) =>
                e.negotiationId &&
                e.negotiationId.toString() === request._id.toString() &&
                e.status === "pending"
            );
            if (idx !== -1) {
              const e = wallet.earnings[idx];
              e.status = "success";
              wallet.balance = (wallet.balance || 0) + (e.amount || 0);
              wallet.withdrawableBalance =
                (wallet.withdrawableBalance || 0) + (e.amount || 0);
              await wallet.save();
              escrowResult = {
                released: true,
                amount: e.amount,
                balance: wallet.balance,
                withdrawableBalance: wallet.withdrawableBalance,
              };
              console.log(
                `✅ Escrow released on confirm: ₦${e.amount} → withdrawable`
              );
            }
          }
        }
      } catch (escrowErr) {
        console.error(
          "⚠️ Escrow release on confirm failed:",
          escrowErr.message
        );
      }
    }

    const updatedRequest = await Requesting.findById(id)
      .populate("requester", "fullName username email phone profilePicture")
      .populate("requested", "fullName username email phone profilePicture")
      .populate("targetItem");

    return res.status(200).json({
      success: true,
      message: "Request updated successfully",
      request: updatedRequest,
      escrow: escrowResult,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  createRequest,
  getUserRequests,
  getRequestById,
  updateRequestStatus,
};
