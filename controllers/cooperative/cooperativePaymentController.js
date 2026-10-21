const axios = require("axios");
const CooperativeLoan = require("../../models/cooperative/CooperativeLoan");
const CooperativeSavings = require("../../models/cooperative/CooperativeSavings");
const CooperativeWallet = require("../../models/cooperative/CooperativeWallet");
const CooperativeDividend = require("../../models/cooperative/CooperativeDividend");
const CooperativeNotification = require("../../models/cooperative/CooperativeNotification");

const PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY ||
  "sk_test_14dce601e7eb9845ed6fcf46fd67e7c27e8070a8";

/**
 * Helper: Create cooperative notification
 */
const createNotification = async ({
  userId,
  title,
  message,
  type,
  metadata,
}) => {
  try {
    const notification = await CooperativeNotification.create({
      userId,
      title,
      message,
      type: type || "payment",
      metadata: metadata || {},
    });
    console.log(`🔔 [NOTIFICATION_CREATED] for user ${userId}: ${title}`);
    return notification;
  } catch (error) {
    console.error(
      "❌ [NOTIFICATION_ERROR] Failed to create notification:",
      error.message
    );
  }
};

// =============================================================================
// 1. INITIALIZE PAYSTACK TRANSACTION
// =============================================================================
exports.initializePayment = async (req, res) => {
  console.log("==================================================");
  console.log("🚀 [INITIALIZE_PAYMENT] Request received", req.body);
  try {
    const { email, amount, type, loanId, description } = req.body;
    const userId = req.user?._id || req.user?.id || req.body.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication identifier is missing.",
      });
    }

    if (!email || !amount || !type) {
      return res.status(400).json({
        success: false,
        message:
          "Email, amount, and payment type ('savings' or 'loan') are required.",
      });
    }

    if (type === "loan" && !loanId) {
      return res.status(400).json({
        success: false,
        message: "Loan ID is required when paying for a loan.",
      });
    }

    const amountInKobo = Math.round(Number(amount) * 100);
    const finalDescription =
      description ||
      (type === "savings"
        ? "Savings deposit via Paystack"
        : "Loan repayment via Paystack");

    const reference = `COOP-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const paystackPayload = {
      email,
      amount: amountInKobo,
      reference,
      callback_url: "https://standard.paystack.co/close",
      metadata: {
        userId: userId.toString(),
        type,
        loanId: loanId ? loanId.toString() : null,
        description: finalDescription,
      },
    };

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      paystackPayload,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data?.status) {
      console.log("✅ [INITIALIZE_PAYMENT] Initialized successfully");
      return res.status(200).json({
        success: true,
        message: "Payment initialized successfully",
        data: {
          ...response.data.data,
          reference,
        },
      });
    }

    return res.status(400).json({
      success: false,
      message: "Paystack initialization was rejected",
    });
  } catch (error) {
    console.error(
      "❌ [INITIALIZE_PAYMENT_ERROR]",
      error.response?.data || error.message
    );
    return res.status(500).json({
      success: false,
      message:
        error.response?.data?.message ||
        "Failed to initialize Paystack payment",
    });
  }
};

// =============================================================================
// 2. VERIFY PAYSTACK TRANSACTION & UPDATE RECORDS
// =============================================================================
exports.verifyPayment = async (req, res) => {
  console.log("==================================================");
  console.log("🔍 [VERIFY_PAYMENT] Request received");
  try {
    const { reference } = req.params;

    if (!reference || reference === ":reference" || reference === "undefined") {
      return res.status(400).json({
        success: false,
        message: "Valid transaction reference is required.",
      });
    }

    const paystackResponse = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const transactionData = paystackResponse.data?.data;

    if (!transactionData || transactionData.status !== "success") {
      return res.status(400).json({
        success: false,
        message: `Transaction verification failed with status: ${
          transactionData?.status || "unknown"
        }`,
      });
    }

    const {
      metadata,
      amount: amountInKobo,
      reference: txRef,
    } = transactionData;
    const actualAmount = amountInKobo / 100;
    const { userId, type, loanId, description } = metadata || {};

    if (!userId || !type) {
      return res.status(400).json({
        success: false,
        message: "Invalid transaction metadata found.",
      });
    }

    const txDescription =
      description ||
      (type === "savings"
        ? "Savings deposit via Paystack"
        : "Loan repayment via Paystack");
    const formattedAmount = `₦${actualAmount.toLocaleString()}`;

    // ==================== SAVINGS ====================
    if (type === "savings") {
      let savings = await CooperativeSavings.findOne({ userId });

      if (!savings) {
        savings = new CooperativeSavings({
          userId,
          balance: 0,
          transactions: [],
        });
      }

      const alreadyExists = savings.transactions.some(
        (tx) => tx.reference === txRef
      );

      if (!alreadyExists) {
        savings.balance += actualAmount;
        savings.transactions.unshift({
          amount: actualAmount,
          type: "deposit",
          description: txDescription,
          reference: txRef,
          date: new Date(),
        });

        await savings.save();
        console.log(
          `💰 [SAVINGS_UPDATED] Added ₦${actualAmount} to user ${userId}`
        );

        await createNotification({
          userId,
          title: "Savings Deposit Successful",
          message:
            txDescription ||
            `Your deposit of ${formattedAmount} has been credited to your savings.`,
          type: "savings",
          metadata: { reference: txRef, amount: actualAmount },
        });
      } else {
        console.log(`⚠️ Reference ${txRef} already processed for savings`);
      }
    }
    // ==================== LOAN ====================
    else if (type === "loan") {
      if (!loanId) {
        return res.status(400).json({
          success: false,
          message: "Loan ID missing from transaction metadata.",
        });
      }

      const loan = await CooperativeLoan.findById(loanId);
      if (!loan) {
        return res.status(404).json({
          success: false,
          message: "Target loan record not found.",
        });
      }

      const alreadyExists = loan.transactions.some(
        (tx) => tx.reference === txRef
      );

      if (!alreadyExists) {
        loan.balance = Math.max(0, loan.balance - actualAmount);
        if (loan.balance === 0) {
          loan.status = "completed";
        }

        loan.transactions.unshift({
          amount: actualAmount,
          type: "repayment",
          description: txDescription,
          reference: txRef,
          date: new Date(),
        });

        await loan.save();
        console.log(
          `🏦 [LOAN_UPDATED] Deducted ₦${actualAmount} from loan ${loanId}`
        );

        await createNotification({
          userId,
          title: "Loan Repayment Successful",
          message:
            txDescription ||
            `Your payment of ${formattedAmount} towards your loan has been applied successfully.`,
          type: "loan",
          metadata: { reference: txRef, amount: actualAmount, loanId },
        });
      } else {
        console.log(`⚠️ Reference ${txRef} already processed for loan`);
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Unknown payment type specified in metadata.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified and records updated successfully.",
      data: {
        reference: txRef,
        amount: actualAmount,
        type,
        status: transactionData.status,
      },
    });
  } catch (error) {
    console.error(
      "❌ [VERIFY_PAYMENT_ERROR]",
      error.response?.data || error.message
    );
    return res.status(500).json({
      success: false,
      message: error.response?.data?.message || "Payment verification failed",
    });
  }
};

// =============================================================================
// 3. FETCH ALL BANKS FROM PAYSTACK
// =============================================================================
exports.getBanks = async (req, res) => {
  console.log("==================================================");
  console.log("🏦 [GET_BANKS] Request received");
  try {
    const response = await axios.get("https://api.paystack.co/bank", {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      },
    });

    if (response.data?.status) {
      console.log("✅ [GET_BANKS] Banks fetched successfully");
      return res.status(200).json({
        success: true,
        message: "Banks fetched successfully",
        data: response.data.data,
      });
    }

    return res.status(400).json({
      success: false,
      message: "Failed to fetch banks from Paystack",
    });
  } catch (error) {
    console.error(
      "❌ [GET_BANKS_ERROR]",
      error.response?.data || error.message
    );
    return res.status(500).json({
      success: false,
      message: error.response?.data?.message || "Failed to fetch banks",
    });
  }
};

// =============================================================================
// 3b. VERIFY BANK ACCOUNT DETAILS VIA PAYSTACK
// =============================================================================
exports.verifyBankAccount = async (req, res) => {
  console.log("==================================================");
  console.log("🔍 [VERIFY_BANK_ACCOUNT] Request received", req.query);
  try {
    const { accountNumber, bankCode } = req.query;

    if (!accountNumber || !bankCode) {
      return res.status(400).json({
        success: false,
        message: "Account number and bank code are required.",
      });
    }

    const response = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    if (response.data?.status) {
      console.log("✅ [VERIFY_BANK_ACCOUNT] Account resolved successfully");
      return res.status(200).json({
        success: true,
        message: "Account resolved successfully",
        data: response.data.data,
      });
    }

    return res.status(400).json({
      success: false,
      message: "Could not resolve bank account details.",
    });
  } catch (error) {
    console.error(
      "❌ [VERIFY_BANK_ACCOUNT_ERROR]",
      error.response?.data || error.message
    );
    return res.status(400).json({
      success: false,
      message:
        error.response?.data?.message ||
        "Failed to verify bank account details.",
    });
  }
};

// =============================================================================
// 4. SUBMIT WITHDRAWAL REQUEST (Savings, Dividends, or Loan)
// =============================================================================
// =============================================================================
exports.submitWithdrawalRequest = async (req, res) => {
  console.log("==================================================");
  console.log("💸 [SUBMIT_WITHDRAWAL] Request received", req.body);
  try {
    const { amount, type, bankCode, accountNumber, accountName, description } =
      req.body;
    const userId = req.user?._id || req.user?.id || req.body.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication identifier is missing.",
      });
    }

    if (!amount || !type || !bankCode || !accountNumber || !accountName) {
      return res.status(400).json({
        success: false,
        message:
          "Amount, type ('savings', 'dividends', 'loan'), bankCode, accountNumber, and accountName are required.",
      });
    }

    if (!["savings", "dividends", "loan"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Must be 'savings', 'dividends', or 'loan'.",
      });
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid withdrawal amount specified.",
      });
    }

    // Optional safety check: Verify account name with Paystack before logging withdrawal
    try {
      const resolveCheck = await axios.get(
        `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        {
          headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
        }
      );
      if (resolveCheck.data?.status && resolveCheck.data.data?.account_name) {
        console.log(
          `✅ [SUBMIT_WITHDRAWAL] Verified beneficiary: ${resolveCheck.data.data.account_name}`
        );
      }
    } catch (verifyErr) {
      console.warn(
        "⚠️ [SUBMIT_WITHDRAWAL] Live account verification warning:",
        verifyErr.response?.data?.message || verifyErr.message
      );
    }

    const reference = `WDL-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const txDescription =
      description ||
      `${
        type.charAt(0).toUpperCase() + type.slice(1)
      } withdrawal request to ${accountNumber}`;

    if (type === "savings") {
      let savings = await CooperativeSavings.findOne({ userId });
      if (!savings || savings.balance < numericAmount) {
        return res
          .status(400)
          .json({ success: false, message: "Insufficient savings balance." });
      }

      savings.balance -= numericAmount;
      savings.transactions.unshift({
        type: "withdrawal",
        amount: numericAmount,
        reference,
        description: txDescription,
        date: new Date(),
      });
      await savings.save();
    } else if (type === "dividends") {
      // 1. Check CooperativeWallet if it exists
      let wallet = await CooperativeWallet.findOne({ userId });
      if (wallet) {
        if (wallet.balance < numericAmount) {
          return res.status(400).json({
            success: false,
            message: "Insufficient dividend/wallet balance.",
          });
        }
        wallet.balance -= numericAmount;
        wallet.transactions.unshift({
          type: "withdrawal",
          amount: numericAmount,
          reference,
          description: txDescription,
          date: new Date(),
        });
        await wallet.save();
      }

      // 2. Fetch distributed dividends to log the pending withdrawal request
      const distributedDividends = await CooperativeDividend.find({
        status: "distributed",
        $or: [
          { "transactions.userId": userId },
          { adminId: { $exists: true } },
        ],
      });

      if (!wallet && distributedDividends.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Insufficient dividend balance.",
        });
      }

      // Append withdrawal log with "pending" status into the relevant CooperativeDividend transaction arrays
      for (const divDoc of distributedDividends) {
        if (divDoc.transactions) {
          divDoc.transactions.push({
            userId,
            amount: numericAmount,
            type: "withdrawal",
            status: "pending", // Set withdrawal status to pending until admin confirms
            description: txDescription,
            date: new Date(),
          });
          await divDoc.save();
        }
      }
    } else if (type === "loan") {
      const { loanId } = req.body;
      if (!loanId) {
        return res.status(400).json({
          success: false,
          message: "Loan ID is required for loan withdrawals.",
        });
      }

      const loan = await CooperativeLoan.findOne({ _id: loanId, userId });
      if (!loan) {
        return res
          .status(404)
          .json({ success: false, message: "Loan account not found." });
      }

      loan.transactions.unshift({
        type: "disbursement",
        amount: numericAmount,
        reference,
        description: txDescription,
        date: new Date(),
      });
      await loan.save();
    }

    await createNotification({
      userId,
      title: `${
        type.charAt(0).toUpperCase() + type.slice(1)
      } Withdrawal Request Pending`,
      message: `Your withdrawal request of ₦${numericAmount.toLocaleString()} has been submitted and is pending admin approval.`,
      type: "withdrawal",
      metadata: { reference, amount: numericAmount, type },
    });

    return res.status(201).json({
      success: true,
      message:
        "Withdrawal request submitted successfully and is pending admin approval.",
      data: {
        reference,
        amount: numericAmount,
        type,
        bankCode,
        accountNumber,
        accountName,
        status: "pending",
      },
    });
  } catch (error) {
    console.error("❌ [SUBMIT_WITHDRAWAL_ERROR]", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to process withdrawal request",
    });
  }
};
// =============================================================================
// 5. GET ALL WITHDRAWAL REQUESTS ACROSS MODELS
// =============================================================================
exports.getAllWithdrawalRequests = async (req, res) => {
  console.log("==================================================");
  console.log("📋 [GET_ALL_WITHDRAWALS] Request received", req.query);
  try {
    const queryUserId = req.query.userId;
    const userId =
      req.user?.role === "admin"
        ? queryUserId
        : req.user?._id || req.user?.id || req.body.userId || queryUserId;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User identifier is required." });
    }

    let savingsWithdrawals = [];
    let dividendWithdrawals = [];
    let loanDisbursements = [];

    const savingsRecord = await CooperativeSavings.findOne({ userId });
    if (savingsRecord && savingsRecord.transactions) {
      savingsWithdrawals = savingsRecord.transactions
        .filter((tx) => tx.type === "withdrawal")
        .map((tx) => ({ ...tx.toObject(), type: "savings" }));
    }

    const walletRecord = await CooperativeWallet.findOne({ userId });
    if (walletRecord && walletRecord.transactions) {
      dividendWithdrawals = walletRecord.transactions
        .filter((tx) => tx.type === "withdrawal" || tx.type === "dividends")
        .map((tx) => ({ ...tx.toObject(), type: "dividends" }));
    }

    // Pull and aggregate dividend withdrawals logged directly inside CooperativeDividend documents
    const dividendRecords = await CooperativeDividend.find({
      status: "distributed",
    });

    dividendRecords.forEach((div) => {
      if (div.transactions && Array.isArray(div.transactions)) {
        const matchingTx = div.transactions.filter(
          (tx) =>
            tx.userId?.toString() === userId?.toString() &&
            (tx.type === "withdrawal" ||
              tx.description?.toLowerCase().includes("withdrawal"))
        );
        matchingTx.forEach((tx) => {
          dividendWithdrawals.push({
            _id: tx._id || div._id,
            amount: tx.amount,
            type: "dividends",
            description: tx.description || div.title || "Dividend Withdrawal",
            reference: div._id.toString(),
            date: tx.date || div.distributedAt || div.createdAt,
          });
        });
      }
    });

    // Fallback if no specific withdrawal transaction was found yet
    if (dividendWithdrawals.length === 0 && dividendRecords.length > 0) {
      dividendWithdrawals = dividendRecords.map((div) => ({
        _id: div._id,
        amount: div.totalAmount,
        type: "dividends",
        description: div.title || "Dividend Payout",
        reference: div._id.toString(),
        date: div.distributedAt || div.createdAt,
      }));
    }

    const loanRecords = await CooperativeLoan.find({ userId });
    loanRecords.forEach((loan) => {
      if (loan.transactions) {
        const filtered = loan.transactions
          .filter((tx) => tx.type === "disbursement" || tx.type === "loan")
          .map((tx) => ({ ...tx.toObject(), type: "loan", loanId: loan._id }));
        loanDisbursements.push(...filtered);
      }
    });

    const allWithdrawals = [
      ...savingsWithdrawals,
      ...dividendWithdrawals,
      ...loanDisbursements,
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    return res.status(200).json({
      success: true,
      message: "Withdrawal records fetched successfully.",
      count: allWithdrawals.length,
      data: allWithdrawals,
    });
  } catch (error) {
    console.error("❌ [GET_ALL_WITHDRAWALS_ERROR]", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch withdrawal requests",
    });
  }
};
