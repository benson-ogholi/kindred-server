const mongoose = require("mongoose");
const axios = require("axios");
const { Wallet } = require("../../models/padiman_utility_models/Wallet");
const Requesting = require("../../models/padiman_utility_models/Requesting");
const PruPayment = require("../../models/padiman_utility_models/PruPayment");
const { sendNotification } = require("../../utils/pru/pru_push");

const PAYSTACK_HEADERS = {
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  "Content-Type": "application/json",
};

// ====================== STRICT OBJECT ID VALIDATOR ======================
const isStrictObjectId = (id) => {
  if (!id) return false;
  return (
    mongoose.Types.ObjectId.isValid(id) &&
    /^[0-9a-fA-F]{24}$/.test(id.toString())
  );
};

// ====================== HELPER: ATTACH REQUESTING DOCS TO EARNINGS ======================
const attachRequestingsToEarnings = async (earnings = []) => {
  if (!earnings.length) return [];

  const requestingIds = [
    ...new Set(
      earnings
        .flatMap((e) => [e.negotiationId, e.serviceId])
        .filter((id) => id && isStrictObjectId(id))
        .map((id) => id.toString())
    ),
  ];

  if (requestingIds.length === 0) {
    return earnings.map((e) => ({ ...e, negotiation: null, service: null }));
  }

  const requestings = await Requesting.find({ _id: { $in: requestingIds } })
    .populate("requester", "-password -__v")
    .populate("requested", "-password -__v")
    .lean();

  const requestingMap = new Map(requestings.map((r) => [r._id.toString(), r]));

  return earnings.map((earning) => {
    const negotiation =
      earning.negotiationId && isStrictObjectId(earning.negotiationId)
        ? requestingMap.get(earning.negotiationId.toString()) || null
        : null;

    const service =
      earning.serviceId && isStrictObjectId(earning.serviceId)
        ? requestingMap.get(earning.serviceId.toString()) || null
        : null;

    return {
      ...earning,
      negotiation,
      service,
    };
  });
};

// ====================== HELPER: POPULATE PAYMENT QUERY ======================
const paymentPopulate = {
  path: "requestingId",
  select:
    "status amount itemType requester requested isPaid isConfirmed serviceProvider",
  populate: [
    {
      path: "requester",
      select: "fullName username profilePicture email phone",
    },
    {
      path: "requested",
      select: "fullName username profilePicture email phone",
    },
  ],
};

// ====================== 1. GET WALLET (Main) ======================
exports.getWallet = async (req, res) => {
  try {
    const userId = req.user.id || req.user;

    let wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      wallet = await Wallet.create({
        user: userId,
        balance: 0,
        withdrawableBalance: 0,
        earnings: [],
        withdrawals: [],
      });
    }

    // ---------- CLEANUP: remove corrupt / invalid earnings ----------
    const originalCount = wallet.earnings.length;

    wallet.earnings = wallet.earnings.filter((earning) => {
      const idsToCheck = [
        earning.payment,
        earning.negotiationId,
        earning.serviceId,
        earning._id,
      ];

      for (const id of idsToCheck) {
        if (id && !isStrictObjectId(id)) return false;
      }
      return true;
    });

    if (wallet.earnings.length !== originalCount) {
      console.warn(
        `[WALLET CLEANUP] Removed ${
          originalCount - wallet.earnings.length
        } corrupt earning(s)`
      );
      await wallet.save();
    }

    // ---------- ESCROW AUTO-RELEASE ----------
    let requiresSave = false;

    for (const earning of wallet.earnings) {
      if (earning.status === "pending") {
        let associatedRequesting = null;

        if (earning.serviceId && isStrictObjectId(earning.serviceId)) {
          associatedRequesting = await Requesting.findById(earning.serviceId);
        } else if (
          earning.negotiationId &&
          isStrictObjectId(earning.negotiationId)
        ) {
          associatedRequesting = await Requesting.findById(
            earning.negotiationId
          );
        }

        if (
          associatedRequesting &&
          associatedRequesting.status === "confirmed"
        ) {
          earning.status = "success";

          if (typeof wallet.balance !== "number") wallet.balance = 0;
          if (typeof wallet.withdrawableBalance !== "number")
            wallet.withdrawableBalance = 0;

          wallet.balance += earning.amount || 0;
          wallet.withdrawableBalance += earning.amount || 0;
          requiresSave = true;
        }
      }
    }

    if (requiresSave) await wallet.save();

    const walletObj = wallet.toObject();
    walletObj.earnings = await attachRequestingsToEarnings(walletObj.earnings);

    return res.status(200).json({
      success: true,
      wallet: walletObj,
    });
  } catch (error) {
    console.error("[GET WALLET ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching wallet",
      error: error.message,
    });
  }
};

// ====================== 2. GET EARNINGS HISTORY ======================
exports.getEarnings = async (req, res) => {
  try {
    const userId = req.user.id || req.user;

    let wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      wallet = await Wallet.create({
        user: userId,
        balance: 0,
        withdrawableBalance: 0,
        earnings: [],
        withdrawals: [],
      });
    }

    const earnings = await attachRequestingsToEarnings(wallet.earnings || []);

    return res.status(200).json({
      success: true,
      earnings,
    });
  } catch (error) {
    console.error("[GET EARNINGS ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching earnings",
      error: error.message,
    });
  }
};

// ====================== 3. GET WITHDRAWALS ======================
exports.getWithdrawals = async (req, res) => {
  try {
    const userId = req.user.id || req.user;

    let wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      wallet = await Wallet.create({
        user: userId,
        balance: 0,
        withdrawableBalance: 0,
        earnings: [],
        withdrawals: [],
      });
    }

    return res.status(200).json({
      success: true,
      withdrawals: wallet.withdrawals || [],
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching withdrawals",
      error: error.message,
    });
  }
};

// ====================== 4. LIST BANKS ======================
exports.getBankList = async (req, res) => {
  try {
    const response = await axios.get(
      "https://api.paystack.co/bank?country=nigeria",
      { headers: PAYSTACK_HEADERS }
    );

    return res.status(200).json({
      success: true,
      banks: response.data.data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch banks",
      error: error.response?.data?.message || error.message,
    });
  }
};

// ====================== 5. REQUEST A WITHDRAWAL ======================
exports.requestWithdrawal = async (req, res) => {
  const { amount, bankDetails } = req.body;
  const userId = req.user?.id || req.user;

  try {
    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid amount" });
    }

    if (
      !bankDetails?.accountNumber ||
      !bankDetails?.bankName ||
      !bankDetails?.accountName
    ) {
      return res.status(400).json({
        success: false,
        message: "Complete bank details are required",
      });
    }

    const wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      return res
        .status(404)
        .json({ success: false, message: "Wallet not found" });
    }

    if (typeof wallet.balance !== "number") wallet.balance = 0;
    if (typeof wallet.withdrawableBalance !== "number")
      wallet.withdrawableBalance = 0;

    if (wallet.balance < amount || wallet.withdrawableBalance < amount) {
      return res.status(400).json({
        success: false,
        message:
          "Insufficient clear balance. Some funds may still be locked in escrow.",
      });
    }

    wallet.balance -= amount;
    wallet.withdrawableBalance -= amount;

    const withdrawalEntry = {
      amount,
      bankDetails: {
        accountName: bankDetails.accountName,
        accountNumber: bankDetails.accountNumber,
        bankName: bankDetails.bankName,
      },
      status: "pending",
      createdAt: new Date(),
    };

    wallet.withdrawals.push(withdrawalEntry);
    await wallet.save();

    const savedWithdrawal = wallet.withdrawals[wallet.withdrawals.length - 1];

    try {
      await sendNotification(userId, {
        title: "Withdrawal Queued ⏳",
        body: `Your withdrawal request of ₦${Number(
          amount
        ).toLocaleString()} is being processed.`,
        type: "WITHDRAWAL",
        data: {
          router: "/(tabs)/wallet",
          withdrawalId: savedWithdrawal._id?.toString(),
          amount,
          status: "pending",
          bankName: bankDetails.bankName,
          accountNumber: bankDetails.accountNumber,
          accountName: bankDetails.accountName,
          timeOfRequest: new Date().toISOString(),
        },
      });
    } catch (pushErr) {
      console.error("[PUSH ERROR - Withdrawal]:", pushErr.message);
    }

    return res.status(200).json({
      success: true,
      message: "Withdrawal request submitted",
      wallet,
    });
  } catch (error) {
    console.error("[REQUEST WITHDRAWAL ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Withdrawal request failed",
      error: error.message,
    });
  }
};

// ====================== 6. INITIALIZE FUNDING ======================
exports.initializeFunding = async (req, res) => {
  const { amount, email } = req.body;
  const userId = req.user?.id || req.user;

  if (!amount || amount < 100) {
    return res.status(400).json({
      success: false,
      message: "Minimum funding amount is ₦100",
    });
  }

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required",
    });
  }

  try {
    const reference = `FUND-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: Math.round(amount * 100),
        reference,
        metadata: {
          userId: String(userId),
          purpose: "wallet_funding",
        },
      },
      { headers: PAYSTACK_HEADERS }
    );

    if (response.data?.status) {
      // Pending PruPayment for this funding (payer / self top-up)
      await PruPayment.findOneAndUpdate(
        {
          reference,
          user: userId,
          role: "payer",
        },
        {
          reference,
          user: userId,
          role: "payer",
          amount: Number(amount),
          status: "pending",
          itemType: "wallet_funding",
          description: "Wallet funding",
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    return res.status(200).json({
      success: true,
      data: response.data.data,
      reference,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to initialize payment",
      error: error.response?.data?.message || error.message,
    });
  }
};

// ====================== 7. VERIFY AND TOP UP ======================
exports.verifyAndTopUp = async (req, res) => {
  const { reference } = req.params;
  const userId = req.user?.id || req.user;

  try {
    let wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      wallet = await Wallet.create({
        user: userId,
        balance: 0,
        withdrawableBalance: 0,
        earnings: [],
        withdrawals: [],
      });
    }

    // Prevent double-crediting on wallet earnings
    const alreadyProcessed = wallet.earnings.some(
      (e) => e.reference === reference
    );

    if (alreadyProcessed) {
      return res.status(200).json({
        success: true,
        message: "This transaction has already been credited",
        balance: wallet.balance,
      });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      { headers: PAYSTACK_HEADERS }
    );

    const transaction = response.data?.data;

    if (!transaction || transaction.status !== "success") {
      // Mark PruPayment failed if it exists
      await PruPayment.findOneAndUpdate(
        { reference, user: userId, role: "payer" },
        {
          status: "failed",
          paystackRawResponse: transaction || null,
        },
        { upsert: true, setDefaultsOnInsert: true }
      );

      return res.status(400).json({
        success: false,
        message: "Transaction was not successful",
      });
    }

    const amountAdded = transaction.amount / 100;
    const paidAt = transaction.paid_at
      ? new Date(transaction.paid_at)
      : new Date();

    // Upsert success PruPayment for the funder
    const paymentDoc = await PruPayment.findOneAndUpdate(
      {
        reference,
        user: userId,
        role: "payer",
      },
      {
        reference,
        user: userId,
        role: "payer",
        amount: amountAdded,
        status: "success",
        itemType: "wallet_funding",
        description: "Wallet funding",
        paystackRawResponse: transaction,
        paidAt,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    wallet.balance = (wallet.balance || 0) + amountAdded;
    wallet.withdrawableBalance =
      (wallet.withdrawableBalance || 0) + amountAdded;

    wallet.earnings.push({
      payment: paymentDoc?._id || null,
      amount: amountAdded,
      source: "Wallet Funding",
      reference,
      payerEmail: transaction.customer?.email || "",
      status: "success",
      createdAt: paidAt,
    });

    await wallet.save();

    try {
      await sendNotification(userId, {
        title: "Wallet Funded 💰",
        body: `₦${Number(
          amountAdded
        ).toLocaleString()} has been added to your wallet.`,
        type: "PAYMENT",
        data: {
          router: "/(tabs)/wallet",
          reference,
          amount: amountAdded,
          status: "success",
        },
      });
    } catch (pushErr) {
      console.error("[PUSH ERROR - TopUp]:", pushErr.message);
    }

    return res.status(200).json({
      success: true,
      message: "Wallet funded successfully",
      balance: wallet.balance,
      payment: paymentDoc,
    });
  } catch (error) {
    console.error("[VERIFY & TOP-UP ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Verification failed",
      error: error.response?.data?.message || error.message,
    });
  }
};

// ====================== 8. RESOLVE ACCOUNT ======================
exports.resolveAccount = async (req, res) => {
  const { accountNumber, bankCode } = req.body;

  if (!accountNumber || !bankCode) {
    return res.status(400).json({
      success: false,
      message: "accountNumber and bankCode are required",
    });
  }

  if (String(accountNumber).length !== 10) {
    return res.status(400).json({
      success: false,
      message: "Nigerian NUBAN account number must be exactly 10 digits",
    });
  }

  try {
    const url = `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`;
    const response = await axios.get(url, { headers: PAYSTACK_HEADERS });

    return res.status(200).json({
      success: true,
      message: "Account details resolved successfully",
      accountName: response.data.data.account_name,
      accountNumber: response.data.data.account_number,
    });
  } catch (error) {
    return res.status(error.response?.status || 500).json({
      success: false,
      message:
        error.response?.data?.message || "Could not resolve account details",
    });
  }
};

// ====================== GET MY PAYMENTS ======================
// Uses schema field `user` (not userId). Returns both payer & receiver rows for this user.
exports.getMyPayments = async (req, res) => {
  try {
    const userId = req.user.id || req.user;

    const payments = await PruPayment.find({ user: userId })
      .populate(paymentPopulate)
      .populate("counterpartUser", "fullName username profilePicture")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
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

// ====================== GET SINGLE PAYMENT ======================
exports.getPaymentById = async (req, res) => {
  try {
    const userId = req.user.id || req.user;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment ID",
      });
    }

    const payment = await PruPayment.findOne({ _id: id, user: userId })
      .populate(paymentPopulate)
      .populate(
        "counterpartUser",
        "fullName username profilePicture email phone"
      )
      .lean();

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    return res.status(200).json({
      success: true,
      payment,
    });
  } catch (error) {
    console.error("[GET PAYMENT BY ID ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching payment",
      error: error.message,
    });
  }
};

// ====================== GET PAYMENTS BY REQUESTING ID ======================
exports.getPaymentsByRequesting = async (req, res) => {
  try {
    const userId = req.user.id || req.user;
    const { requestingId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(requestingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid requesting ID",
      });
    }

    const payments = await PruPayment.find({
      requestingId,
      user: userId,
    })
      .populate(paymentPopulate)
      .populate("counterpartUser", "fullName username profilePicture")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      payments,
    });
  } catch (error) {
    console.error("[GET PAYMENTS BY REQUESTING ERROR]:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching payments",
      error: error.message,
    });
  }
};
