const { Wallet } = require("../../models/padiman_route_models/Wallet");
const Request = require("../../models/padiman_route_models/Request");
const axios = require("axios");
const { sendNotification } = require("../../utils/pr/pr_push");

const PAYSTACK_HEADERS = {
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  "Content-Type": "application/json",
};

// 1. Get User Wallet (With Auto Escrow Release)
exports.getWallet = async (req, res) => {
  console.log(
    `🔍 [GET WALLET START] Fetching wallet for User ID: ${
      req.user.id || req.user
    }`
  );

  try {
    const userId = req.user.id || req.user;
    console.log(`📝 [DB QUERY] Finding wallet with: { user: '${userId}' }`);

    const wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      console.log(
        `⚠️ [WALLET NOT FOUND] No wallet record exists for User: ${userId}`
      );
      return res.status(404).json({ message: "Wallet not found" });
    }

    // =========================================================================
    // ESCROW AUTO-RELEASE LOGIC
    // Check pending earnings to see if their requests have been confirmed
    // =========================================================================
    let requiresSave = false;

    if (wallet.earnings && wallet.earnings.length > 0) {
      for (const earning of wallet.earnings) {
        // Target earnings that are currently held in escrow
        if (earning.status === "pending" || earning.status === "escrow") {
          let associatedRequest = null;

          // Attempt to locate the request via serviceId or negotiationId
          if (earning.serviceId) {
            associatedRequest = await Request.findById(earning.serviceId);
          } else if (earning.negotiationId) {
            associatedRequest = await Request.findOne({
              negotiation: earning.negotiationId,
            });
          }

          // If the request is confirmed, clear the funds from escrow
          if (associatedRequest && associatedRequest.status === "confirmed") {
            earning.status = "success";

            // Ensure withdrawable balance is initialized if it's somehow missing
            if (typeof wallet.withdrawableBalance !== "number") {
              wallet.withdrawableBalance = 0;
            }

            wallet.balance += earning.amount;
            wallet.withdrawableBalance += earning.amount;
            requiresSave = true;

            console.log(
              `✅ [ESCROW AUTO-RELEASE] ₦${earning.amount} cleared to balance from confirmed request ${associatedRequest._id}.`
            );
          }
        }
      }
    }

    if (requiresSave) {
      await wallet.save();
    }
    // =========================================================================

    console.log("✅ [GET WALLET SUCCESS] Wallet found and escrow synced.");
    res.status(200).json(wallet);
  } catch (error) {
    console.error("💥 [GET WALLET CRITICAL ERROR]:", error.message);
    res
      .status(500)
      .json({ message: "Error fetching wallet", error: error.message });
  }
};

// 2. Get Earnings History
exports.getEarnings = async (req, res) => {
  try {
    const userId = req.user.id || req.user;
    const wallet = await Wallet.findOne({ user: userId }, "earnings").populate(
      "earnings.payment earnings.negotiationId earnings.serviceId"
    );
    res.status(200).json(wallet.earnings);
  } catch (error) {
    res.status(500).json({ message: "Error fetching earnings", error });
  }
};

// 3. Get Withdrawal History
exports.getWithdrawals = async (req, res) => {
  try {
    const userId = req.user.id || req.user;
    const wallet = await Wallet.findOne({ user: userId }, "withdrawals");
    res.status(200).json(wallet.withdrawals);
  } catch (error) {
    res.status(500).json({ message: "Error fetching withdrawals", error });
  }
};

// 4. List Banks (From Paystack)
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

// 5. Request a Withdrawal
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

    // Matches the new schema's withdrawals array perfectly
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
        router: "/(tabs)/wallet",
        data: {
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

// 6. Initialize Wallet Funding
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

// 7. Verify Payment & Top-up Wallet
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

    // Add funds to both total balance and withdrawable balance since it's a direct user top-up
    wallet.balance += amountAdded;
    wallet.withdrawableBalance += amountAdded;

    // Matches the newly added properties inside the schema's earnings array
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

// 8. Resolve Account
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
