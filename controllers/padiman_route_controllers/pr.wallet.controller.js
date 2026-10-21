const mongoose = require("mongoose");
const { Wallet } = require("../../models/padiman_route_models/Wallet");
const Request = require("../../models/padiman_route_models/Request");
const Negotiation = require("../../models/padiman_route_models/Negotiation");
const axios = require("axios");
const { sendNotification } = require("../../utils/pr/pr_push");

const PAYSTACK_HEADERS = {
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  "Content-Type": "json",
};

// ====================== STRICT OBJECT ID VALIDATOR ======================
const isStrictObjectId = (id) => {
  if (!id) return true;
  return /^[0-9a-fA-F]{24}$/.test(id.toString());
};

// ====================== HELPER: SAFE NEGOTIATION & SERVICE FILTERING ======================
const attachNegotiationsToEarnings = async (earnings) => {
  if (!earnings || earnings.length === 0) return earnings;

  // Enforce strict check before pushing to the array
  const negotiationIds = [
    ...new Set(
      earnings
        .filter((e) => e.negotiationId && isStrictObjectId(e.negotiationId))
        .map((e) => e.negotiationId.toString())
    ),
  ];

  if (negotiationIds.length === 0) return earnings;

  // 1. Fetch negotiations safely without populating bad reference fields
  const populatedNegotiations = await Negotiation.find({
    _id: { $in: negotiationIds },
  })
    .populate("negotiator", "-password -__v")
    .populate("serviceProvider", "-password -__v")
    .lean();

  // 2. Extract valid Request IDs from 'service' and 'negotiatorService'
  const validRequestIds = [];

  populatedNegotiations.forEach((neg) => {
    if (neg.service) {
      const sId = neg.service.toString();
      if (isStrictObjectId(sId)) {
        validRequestIds.push(sId);
      } else {
        neg.service = null;
      }
    }

    if (neg.negotiatorService) {
      const nsId = neg.negotiatorService.toString();
      if (isStrictObjectId(nsId)) {
        validRequestIds.push(nsId);
      } else {
        neg.negotiatorService = null;
      }
    }
  });

  // 3. Manually fetch the valid Requests
  let requestMap = new Map();
  if (validRequestIds.length > 0) {
    const requests = await Request.find({
      _id: { $in: validRequestIds },
    }).lean();
    requestMap = new Map(requests.map((r) => [r._id.toString(), r]));
  }

  // 4. Attach fetched Requests back to the negotiations
  populatedNegotiations.forEach((neg) => {
    if (neg.service && isStrictObjectId(neg.service.toString())) {
      neg.service = requestMap.get(neg.service.toString()) || null;
    }
    if (
      neg.negotiatorService &&
      isStrictObjectId(neg.negotiatorService.toString())
    ) {
      neg.negotiatorService =
        requestMap.get(neg.negotiatorService.toString()) || null;
    }
  });

  const negotiationMap = new Map(
    populatedNegotiations.map((neg) => [neg._id.toString(), neg])
  );

  // 5. Map earnings and ENSURE we drop any item where the negotiation has NO valid service object
  const processedEarnings = earnings.map((earning) => {
    if (earning.negotiationId && isStrictObjectId(earning.negotiationId)) {
      const negotiation =
        negotiationMap.get(earning.negotiationId.toString()) || null;

      return {
        ...earning,
        negotiation,
      };
    }
    return earning;
  });

  // FILTER OUT: Drop any earning tied to a negotiation that lacks a valid service/negotiatorService object
  return processedEarnings.filter((earning) => {
    // If it's a direct wallet funding / non-negotiation earning, keep it
    if (!earning.negotiationId) return true;

    const neg = earning.negotiation;
    // If negotiation document doesn't exist or doesn't have a valid service object, filter it out completely
    if (!neg) return false;
    const hasValidService = neg.service || neg.negotiatorService;
    return Boolean(hasValidService);
  });
};

// ====================== 1. GET WALLET (Main) ======================
exports.getWallet = async (req, res) => {
  console.log(`🔍 [GET WALLET START] User ID: ${req.user.id || req.user}`);

  try {
    const userId = req.user.id || req.user;

    let wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    // ==================== CLEANUP: DEEP REMOVE CORRUPT EARNINGS ====================
    const originalEarningsCount = wallet.earnings.length;

    wallet.earnings = wallet.earnings.filter((earning) => {
      const sId = earning.serviceId ? earning.serviceId.toString() : null;
      const nId = earning.negotiationId
        ? earning.negotiationId.toString()
        : null;
      const pId = earning.payment ? earning.payment.toString() : null;
      const eId = earning._id ? earning._id.toString() : null;

      const badString = "Parcel Delivery Negotiation";

      if (
        sId === badString ||
        nId === badString ||
        pId === badString ||
        eId === badString
      ) {
        return false;
      }

      if (sId && !isStrictObjectId(sId)) return false;
      if (nId && !isStrictObjectId(nId)) return false;
      if (pId && !isStrictObjectId(pId)) return false;

      return true;
    });

    if (wallet.earnings.length !== originalEarningsCount) {
      console.warn(
        `⚠️ [WALLET CLEANUP] Removed ${
          originalEarningsCount - wallet.earnings.length
        } corrupt earning(s).`
      );
      await wallet.save();
    }
    // ============================================================

    // ==================== ESCROW AUTO-RELEASE ====================
    let requiresSave = false;

    for (const earning of wallet.earnings) {
      if (earning.status === "pending" || earning.status === "escrow") {
        let associatedRequest = null;

        if (earning.serviceId && isStrictObjectId(earning.serviceId)) {
          associatedRequest = await Request.findById(earning.serviceId);
        } else if (
          earning.negotiationId &&
          isStrictObjectId(earning.negotiationId)
        ) {
          associatedRequest = await Request.findOne({
            negotiation: earning.negotiationId,
          });
        }

        if (associatedRequest && associatedRequest.status === "confirmed") {
          earning.status = "success";
          if (typeof wallet.withdrawableBalance !== "number")
            wallet.withdrawableBalance = 0;

          wallet.balance += earning.amount;
          wallet.withdrawableBalance += earning.amount;
          requiresSave = true;
        }
      }
    }

    if (requiresSave) await wallet.save();
    // ============================================================

    // ==================== ATTACH & FILTER EARNINGS ====================
    const walletObj = wallet.toObject();
    walletObj.earnings = await attachNegotiationsToEarnings(walletObj.earnings);
    // ============================================================

    console.log("✅ [GET WALLET SUCCESS] Wallet with full details returned.");

    return res.status(200).json({
      success: true,
      wallet: walletObj,
    });
  } catch (error) {
    console.error("💥 [GET WALLET ERROR]:", error.message);
    return res.status(500).json({
      message: "Error fetching wallet",
      error: error.message,
    });
  }
};

// ====================== 2. GET EARNINGS HISTORY ======================
exports.getEarnings = async (req, res) => {
  try {
    const userId = req.user.id || req.user;

    const wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    const walletObj = wallet.toObject();
    const earnings = await attachNegotiationsToEarnings(walletObj.earnings);

    res.status(200).json({
      success: true,
      earnings,
    });
  } catch (error) {
    console.error("Get Earnings Error:", error);
    res
      .status(500)
      .json({ message: "Error fetching earnings", error: error.message });
  }
};

// ====================== 3. GET WITHDRAWALS ======================
exports.getWithdrawals = async (req, res) => {
  try {
    const userId = req.user.id || req.user;
    const wallet = await Wallet.findOne({ user: userId }, "withdrawals");
    res
      .status(200)
      .json({ success: true, withdrawals: wallet?.withdrawals || [] });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching withdrawals", error: error.message });
  }
};

// ====================== 4. LIST BANKS ======================
exports.getBankList = async (req, res) => {
  try {
    const response = await axios.get(
      "https://api.paystack.co/bank?country=nigeria",
      {
        headers: PAYSTACK_HEADERS,
      }
    );
    res.status(200).json(response.data.data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch banks", error });
  }
};

// ====================== 5. REQUEST A WITHDRAWAL ======================
exports.requestWithdrawal = async (req, res) => {
  const { amount, bankDetails } = req.body;
  const targetUserId = req.user?.id || req.user;

  try {
    const wallet = await Wallet.findOne({ user: targetUserId });

    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    if (typeof wallet.withdrawableBalance !== "number") {
      wallet.withdrawableBalance = 0;
    }

    if (wallet.balance < amount || wallet.withdrawableBalance < amount) {
      return res.status(400).json({
        message:
          "Insufficient clear balance available for withdrawal. Please confirm some funds are not still locked in escrow.",
      });
    }

    wallet.balance -= amount;
    wallet.withdrawableBalance -= amount;

    const withdrawalEntry = {
      amount,
      bankDetails: {
        accountName: bankDetails?.accountName,
        accountNumber: bankDetails?.accountNumber,
        bankName: bankDetails?.bankName,
      },
      status: "pending",
    };

    wallet.withdrawals.push(withdrawalEntry);
    await wallet.save();

    const savedWithdrawal = wallet.withdrawals[wallet.withdrawals.length - 1];

    try {
      await sendNotification(targetUserId, {
        title: "Withdrawal Queued ⏳",
        body: `Your withdrawal request of ₦${amount.toLocaleString()} is processing and has been queued.`,
        type: "WITHDRAWAL",
        data: {
          router: "/(tabs)/wallet",
          withdrawalId: savedWithdrawal?._id
            ? savedWithdrawal._id.toString()
            : null,
          amount: amount,
          status: "pending",
          bankName: bankDetails?.bankName || "N/A",
          accountNumber: bankDetails?.accountNumber || "N/A",
          accountName: bankDetails?.accountName || "N/A",
          timeOfRequest: new Date().toISOString(),
        },
      });
      console.log("✅ [PUSH NOTIFICATION] Withdrawal queued alert dispatched.");
    } catch (pushError) {
      console.error(
        "⚠️ [PUSH ERROR] Failed to deliver withdrawal alert thread:",
        pushError.message
      );
    }

    res.status(200).json({ message: "Withdrawal request submitted", wallet });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Withdrawal request failed", error: error.message });
  }
};

// ====================== 6. INITIALIZE FUNDING ======================
exports.initializeFunding = async (req, res) => {
  console.log("=== INITIALIZE FUNDING CONTROLLER STARTED ===");
  const { amount, email } = req.body;

  if (!amount || amount < 100) {
    return res.status(400).json({ message: "Minimum funding amount is ₦100" });
  }

  try {
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      { email, amount: amount * 100 },
      { headers: PAYSTACK_HEADERS }
    );
    res.status(200).json(response.data.data);
  } catch (error) {
    res.status(500).json({
      message: "Failed to initialize payment",
      error: error.message,
    });
  }
};

// ====================== 7. VERIFY AND TOP UP ======================
exports.verifyAndTopUp = async (req, res) => {
  console.log("=== VERIFY AND TOP UP CONTROLLER STARTED ===");
  const { reference } = req.params;
  const userId = req.user?.id || req.user;

  try {
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      return res
        .status(404)
        .json({ message: "Wallet data structure not found." });
    }

    const isAlreadyProcessed = wallet.earnings.some(
      (earning) => earning.reference === reference
    );
    if (isAlreadyProcessed) {
      return res.status(200).json({
        message: "This transaction has already been credited to your balance.",
        balance: wallet.balance,
      });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: PAYSTACK_HEADERS,
      }
    );

    const transaction = response.data?.data;
    if (!transaction || transaction.status !== "success") {
      return res
        .status(400)
        .json({ message: "Transaction was not completely successful." });
    }

    const amountAdded = transaction.amount / 100;

    wallet.balance += amountAdded;
    wallet.withdrawableBalance += amountAdded;

    wallet.earnings.push({
      amount: amountAdded,
      source: "Wallet Funding",
      reference: reference,
      payerEmail: transaction.customer?.email || "",
      status: "success",
      createdAt: new Date(),
    });

    await wallet.save();

    return res.status(200).json({
      message: "Wallet funded successfully",
      balance: wallet.balance,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Verification failed to compile processing details.",
      error: error.message,
    });
  }
};


// ====================== 8. RESOLVE ACCOUNT ======================
exports.resolveAccount = async (req, res) => {
  const { accountNumber, bankCode } = req.body;

  if (!accountNumber || !bankCode) {
    return res.status(400).json({
      message: "accountNumber and bankCode are required in the request body.",
    });
  }

  if (accountNumber.length !== 10) {
    return res.status(400).json({
      message: "Nigerian NUBAN account number must be exactly 10 digits.",
    });
  }

  try {
    const url = `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`;
    const response = await axios.get(url, { headers: PAYSTACK_HEADERS });

    return res.status(200).json({
      message: "Account details resolved successfully",
      accountName: response.data.data.account_name,
      accountNumber: response.data.data.account_number,
    });
  } catch (error) {
    return res.status(error.response?.status || 500).json({
      message:
        error.response?.data?.message || "Could not resolve account details.",
    });
  }
};
