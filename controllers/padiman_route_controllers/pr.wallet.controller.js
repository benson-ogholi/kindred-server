const Wallet = require("../../models/padiman_route_models/Wallet");
const axios = require("axios");
const { sendNotification } = require("../../utils/pr/pr_push");

const PAYSTACK_HEADERS = {
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  "Content-Type": "application/json",
};

// 1. Get User Wallet
// 1. Get User Wallet
exports.getWallet = async (req, res) => {
  console.log(
    `🔍 [GET WALLET START] Fetching wallet for User ID: ${req.user.id}`
  );

  try {
    // Log the search criteria
    console.log(
      `📝 [DB QUERY] Finding wallet with: { user: '${req.user.id}' }`
    );

    const wallet = await Wallet.findOne({ user: req.user });

    if (!wallet) {
      console.log(
        `⚠️ [WALLET NOT FOUND] No wallet record exists for User: ${req.user.id}`
      );
      return res.status(404).json({ message: "Wallet not found" });
    }

    console.log(
      "✅ [GET WALLET SUCCESS] Wallet found:",
      JSON.stringify(wallet, null, 2)
    );
    res.status(200).json(wallet);
  } catch (error) {
    console.error("💥 [GET WALLET CRITICAL ERROR]:", error.message);
    // Log the full error stack for better debugging
    console.error(error);

    res.status(500).json({
      message: "Error fetching wallet",
      error: error.message,
    });
  }
};

// 2. Get Earnings History
exports.getEarnings = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user }, "earnings");
    res.status(200).json(wallet.earnings);
  } catch (error) {
    res.status(500).json({ message: "Error fetching earnings", error });
  }
};

// 3. Get Withdrawal History
exports.getWithdrawals = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user }, "withdrawals");
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
// 5. Request a Withdrawal
exports.requestWithdrawal = async (req, res) => {
  const { amount, bankDetails } = req.body;
  const targetUserId = req.user?.id || req.user; // Normalizing safety check for the User ID

  try {
    const wallet = await Wallet.findOne({ user: req.user });

    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    if (wallet.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    wallet.balance -= amount;

    // Create new withdrawal object layout to capture system ID reference arrays
    const withdrawalEntry = {
      amount,
      bankDetails,
      status: "pending",
    };

    wallet.withdrawals.push(withdrawalEntry);
    await wallet.save();

    // Grab the exact sub-document record to access its structural DB _id reference string
    const savedWithdrawal = wallet.withdrawals[wallet.withdrawals.length - 1];

    // ====================== SEND WITHDRAWAL QUEUED NOTIFICATION ======================
    // Enriched with localized bank recipient payloads, values, and matching explicit app scopes
    try {
      await sendNotification(targetUserId, {
        title: "Withdrawal Queued ⏳",
        body: `Your withdrawal request of ₦${amount.toLocaleString()} is processing and has been queued.`,
        type: "WITHDRAWAL",
        router: "/(tabs)/wallet", // Adjust path matching layout schemas
        data: {
          withdrawalId: savedWithdrawal?._id
            ? savedWithdrawal._id.toString()
            : null,
          amount: amount,
          status: "pending",
          bankName: bankDetails.bankName,
          accountNumber: bankDetails.accountNumber,
          accountName: bankDetails.accountName,
          timeOfRequest: new Date().toISOString(),
        },
      });
      console.log("✅ [PUSH NOTIFICATION] Withdrawal queued alert dispatched.");
    } catch (pushError) {
      // Caught independently to ensure server processes the network action even if push channels drop offline
      console.error(
        "⚠️ [PUSH ERROR] Failed to deliver withdrawal alert thread:",
        pushError.message
      );
    }
    // =================================================================================

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
  console.log("Request User Data Context ID:", req.user?.id);

  const { amount, email } = req.body;

  console.log("Extracted Amount:", amount);
  console.log("Extracted Email Target:", email);

  if (!amount || amount < 100) {
    console.log("❌ Validation Failed: Invalid or too low amount");
    return res.status(400).json({
      message: "Minimum funding amount is ₦100",
    });
  }

  try {
    console.log("Preparing Paystack request...");
    console.log("Paystack Amount (in Kobo):", amount * 100);

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: email,
        amount: amount * 100,
      },
      { headers: PAYSTACK_HEADERS }
    );

    console.log("✅ Paystack API Response Status:", response.status);
    console.log("✅ Reference Generated:", response.data.data.reference);

    console.log("=== INITIALIZE FUNDING CONTROLLER SUCCESS ===");
    res.status(200).json(response.data.data);
  } catch (error) {
    console.log("❌ Paystack Request Failed");
    if (error.response) {
      console.log("Error Status:", error.response.status);
      console.log("Error Data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.log("❌ Error setting up request:", error.message);
    }
    console.log("=== INITIALIZE FUNDING CONTROLLER FAILED ===");
    res.status(500).json({
      message: "Failed to initialize payment",
      error: error.message,
    });
  }
};

// 7. Verify Payment & Top-up Wallet (FIXED & FULLY LOGGED)
exports.verifyAndTopUp = async (req, res) => {
  console.log("=== VERIFY AND TOP UP CONTROLLER STARTED ===");
  const { reference } = req.params;
  const userId = req.user?.id;

  console.log(`🔍 Target Reference Token: "${reference}"`);
  console.log(`👤 Request Executing User ID: "${userId}"`);

  try {
    // 1. Fetch user wallet first to check for duplicates
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      console.log("❌ Wallet record lookup returned null for user:", userId);
      return res
        .status(404)
        .json({ message: "Wallet data structure not found." });
    }

    // 2. Prevent duplicate allocation loops (Idempotency check)
    const isAlreadyProcessed = wallet.earnings.some(
      (earning) => earning.reference === reference
    );

    if (isAlreadyProcessed) {
      console.log(
        `⚠️ Reference "${reference}" has already been processed and credited before. Exiting early.`
      );
      return res.status(200).json({
        message: "This transaction has already been credited to your balance.",
        balance: wallet.balance,
      });
    }

    console.log(`📡 Reaching out to Paystack Endpoint to audit reference...`);
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: PAYSTACK_HEADERS }
    );

    console.log(
      "✅ Paystack Verification Network Status Code:",
      response.status
    );

    const transaction = response.data?.data;
    if (!transaction) {
      console.log(
        "❌ Paystack verification did not return transaction body object data details."
      );
      return res
        .status(400)
        .json({ message: "Invalid response from gateway verifier." });
    }

    console.log(`📊 Gateway Status Returned: "${transaction.status}"`);
    console.log(`📊 Gateway Computed Amount (Kobo):`, transaction.amount);

    if (transaction.status !== "success") {
      console.log(
        `❌ Transaction verification rejected. Status is not "success".`
      );
      return res
        .status(400)
        .json({ message: "Transaction was not completely successful." });
    }

    const amountAdded = transaction.amount / 100;
    console.log(
      `💰 Converting Kobo units to Naira values. Crediting: ₦${amountAdded}`
    );

    // 3. Update memory ledger entries
    wallet.balance += amountAdded;
    wallet.earnings.push({
      amount: amountAdded,
      source: "Wallet Funding",
      reference: reference,
      createdAt: new Date(),
    });

    console.log(
      "💾 Persisting adjustments into MongoDB instance database layout..."
    );
    await wallet.save();

    console.log(
      `✅ Wallet balance saved successfully. New Total: ₦${wallet.balance}`
    );
    console.log("=== VERIFY AND TOP UP CONTROLLER SUCCESS ===");

    return res.status(200).json({
      message: "Wallet funded successfully",
      balance: wallet.balance,
    });
  } catch (error) {
    console.log("❌ VERIFICATION RUNTIME EXCEPTION INTERCEPTED ❌");

    if (error.response) {
      console.error(
        "Paystack Gateway Response Error Body Status:",
        error.response.status
      );
      console.error(
        "Paystack Gateway Response Error Body Data:",
        JSON.stringify(error.response.data, null, 2)
      );
    } else {
      console.error(
        "Local Thread Processing Core Error message:",
        error.message
      );
      console.error("Stack Trace Analysis:", error);
    }

    console.log("=== VERIFY AND TOP UP CONTROLLER FAILED ===");
    return res.status(500).json({
      message: "Verification failed to compile processing details.",
      error: error.message,
    });
  }
};

exports.resolveAccount = async (req, res) => {
  // Extract from req.body instead of req.query
  const { accountNumber, bankCode } = req.body;

  console.log(
    `🔍 [RESOLVE ACCOUNT START] Body received -> Account: ${accountNumber}, Bank Code: ${bankCode}`
  );

  if (!accountNumber || !bankCode) {
    console.log(
      "⚠️ [RESOLVE ACCOUNT VALIDATION FAILED] Missing body parameters"
    );
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

    // Still use GET for the external Paystack request
    const response = await axios.get(url, { headers: PAYSTACK_HEADERS });

    console.log("✅ [GATEWAY SUCCESS]");

    return res.status(200).json({
      message: "Account details resolved successfully",
      accountName: response.data.data.account_name,
      accountNumber: response.data.data.account_number,
    });
  } catch (error) {
    console.error(
      "❌ [RESOLVE ACCOUNT ERROR]:",
      error.response?.data || error.message
    );

    return res.status(error.response?.status || 500).json({
      message:
        error.response?.data?.message || "Could not resolve account details.",
    });
  }
};
