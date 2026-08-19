const { default: mongoose } = require("mongoose");
const CooperativeRequest = require("../../models/cooperative/CooperativeRequest");
const CooperativeUser = require("../../models/cooperative/CooperativeUser");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");
const sendWatalopiaEmail = require("../../utils/cooperative/sendWatalopiaEmail");

// ==================== 1. SUBMIT REQUEST ====================
exports.submitCooperativeRequest = async (req, res) => {
  console.log("==================================================");
  console.log("🚀 [COOP_REQUEST] Incoming submission request");
  console.log("Body:", req.body);
  console.log("User from token:", req.user?._id || req.user?.id);

  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. User not found from token.",
      });
    }

    const {
      title,
      type,
      transactionType,
      amount,
      description,
      accountName,
      accountNumber,
      bankName,
      // Loan fields
      principalAmount,
      interestRate,
      durationMonths,
    } = req.body;

    const file = req.file || req.files?.proof?.[0] || null;
    const files = req.files || {};

    if (!title || !type || !transactionType || !amount) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: title, type, transactionType, or amount.",
      });
    }

    if (!["loan", "savings", "dividends"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Must be 'loan', 'savings', or 'dividends'.",
      });
    }

    if (
      !["credit", "withdrawal", "transfer", "repay"].includes(transactionType)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid transactionType. Must be 'credit', 'withdrawal', 'transfer', or 'repay'.",
      });
    }

    let proofUrl = null;
    let finalBankDetails = null;
    let meta = undefined;

    // ── Loan meta ────────────────────────────────────────────
    if (type === "loan" && transactionType !== "repay") {
      const principal = Number(principalAmount || amount);
      const rate = Number(interestRate) || 20;
      const months = Number(durationMonths) || 12;
      const interest = (principal * rate) / 100;
      const payable = principal + interest;
      const balance = payable;
      const dueDate = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000);

      let form1Url = "";
      let form2Url = "";

      if (files.form1?.[0]) {
        form1Url = await uploadToBackblaze(
          files.form1[0].buffer,
          files.form1[0].originalname,
          `cooperative-surety/${userId}`
        );
      }
      if (files.form2?.[0]) {
        form2Url = await uploadToBackblaze(
          files.form2[0].buffer,
          files.form2[0].originalname,
          `cooperative-surety/${userId}`
        );
      }
      if (!form1Url && file) {
        form1Url = await uploadToBackblaze(
          file.buffer,
          file.originalname,
          `cooperative-surety/${userId}`
        );
      }

      meta = {
        principalAmount: principal,
        interestRate: rate,
        durationMonths: months,
        interest,
        payable,
        balance,
        dueDate,
        suretyForms: {
          form1: form1Url,
          form2: form2Url,
        },
        loanStatus: "pending",
      };
    }

    // ── Credit (savings deposit needs proof) ─────────────────
    if (transactionType === "credit" && type === "savings") {
      if (!file) {
        return res.status(400).json({
          success: false,
          message: "Proof of payment picture is required for credit requests.",
        });
      }
      proofUrl = await uploadToBackblaze(
        file.buffer,
        file.originalname,
        `cooperative-proofs/${type}-credit`
      );
    }

    // ── Repay (loan repayment needs proof) ───────────────────
    if (transactionType === "repay") {
      if (!file) {
        return res.status(400).json({
          success: false,
          message: "Proof of payment is required for loan repayment requests.",
        });
      }
      proofUrl = await uploadToBackblaze(
        file.buffer,
        file.originalname,
        `cooperative-proofs/loan-repay`
      );
    }

    // ── Withdrawal ───────────────────────────────────────────
    if (transactionType === "withdrawal") {
      if (type === "savings") {
        if (!accountName || !accountNumber || !bankName) {
          return res.status(400).json({
            success: false,
            message:
              "Bank details (accountName, accountNumber, bankName) are required for withdrawals.",
          });
        }
        finalBankDetails = { accountName, accountNumber, bankName };
      }
      if (type === "loan" && file) {
        proofUrl = await uploadToBackblaze(
          file.buffer,
          file.originalname,
          `cooperative-proofs/loan-repayment`
        );
      }
    }

    // ── Transfer ─────────────────────────────────────────────
    if (transactionType === "transfer") {
      if (!accountName || !accountNumber || !bankName) {
        return res.status(400).json({
          success: false,
          message:
            "Bank details (accountName, accountNumber, bankName) are required for transfers.",
        });
      }
      finalBankDetails = { accountName, accountNumber, bankName };
      if (file) {
        proofUrl = await uploadToBackblaze(
          file.buffer,
          file.originalname,
          `cooperative-proofs/${type}-transfer`
        );
      }
    }

    const requestPayload = {
      userId,
      title,
      type,
      transactionType,
      amount: Number(amount),
      proofUrl,
      bankDetails: finalBankDetails,
      status: "pending",
      description:
        description || `${type.toUpperCase()} ${transactionType} request`,
    };

    if (meta) {
      requestPayload.meta = meta;
    }

    const newRequest = await CooperativeRequest.create(requestPayload);
    console.log("✅ [COOP_REQUEST] Saved successfully:", newRequest._id);

    // Send submission confirmation email
    try {
      const user = await CooperativeUser.findById(userId).select(
        "firstName email"
      );
      if (user && user.email) {
        await sendWatalopiaEmail({
          to: user.email,
          subject: "Request Submitted Successfully",
          template: "requestSubmitted",
          data: {
            firstName: user.firstName,
            request: {
              title: newRequest.title,
              type: newRequest.type,
              transactionType: newRequest.transactionType,
              amount: newRequest.amount,
            },
          },
        });
      }
    } catch (emailErr) {
      console.error(
        "Failed to send request submitted email:",
        emailErr.message
      );
    }

    return res.status(201).json({
      success: true,
      message: `${
        type.charAt(0).toUpperCase() + type.slice(1)
      } ${transactionType} request submitted successfully and is pending approval.`,
      data: newRequest,
    });
  } catch (error) {
    console.error("❌ [COOP_REQUEST_ERROR]:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to submit request.",
    });
  }
};

// ==================== 2. UPDATE REQUEST STATUS ====================
exports.updateRequestStatus = async (req, res) => {
  console.log("==================================================");
  console.log(
    "🔄 [COOP_STATUS_UPDATE] Updating request status for ID:",
    req.params.id
  );

  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be either 'approved' or 'rejected'.",
      });
    }

    const requestItem = await CooperativeRequest.findById(id);
    if (!requestItem) {
      return res.status(404).json({
        success: false,
        message: "Cooperative request not found.",
      });
    }

    if (requestItem.status === "approved") {
      return res.status(400).json({
        success: false,
        message: "This request has already been approved.",
      });
    }

    requestItem.status = status;

    // ── Handle Repay / Withdrawal loan balance reductions on approval ──
    if (status === "approved" && requestItem.transactionType === "repay") {
      const repayAmount = Number(requestItem.amount);
      const activeLoanReq = await CooperativeRequest.findOne({
        userId: requestItem.userId,
        type: "loan",
        status: "approved",
        "meta.loanStatus": "active",
      }).sort({ createdAt: -1 });

      if (!activeLoanReq || !activeLoanReq.meta) {
        return res.status(400).json({
          success: false,
          message: "No active loan found for this user to apply repayment.",
        });
      }

      if (repayAmount > (activeLoanReq.meta.balance || 0)) {
        return res.status(400).json({
          success: false,
          message: `Repayment amount exceeds outstanding balance (${activeLoanReq.meta.balance}).`,
        });
      }

      activeLoanReq.meta.balance =
        (activeLoanReq.meta.balance || 0) - repayAmount;
      if (activeLoanReq.meta.balance <= 0) {
        activeLoanReq.meta.balance = 0;
        activeLoanReq.meta.loanStatus = "completed";
      }
      activeLoanReq.markModified("meta");
      await activeLoanReq.save();
      console.log(
        "💸 Loan balance reduced via 'repay' approval. New balance:",
        activeLoanReq.meta.balance
      );
    }

    // ── Loan-specific meta updates on approve/reject ──
    if (requestItem.type === "loan" && requestItem.meta) {
      if (status === "approved") {
        if (requestItem.transactionType === "credit") {
          requestItem.meta.loanStatus = "active";
        } else if (
          requestItem.transactionType === "withdrawal" ||
          requestItem.transactionType === "transfer"
        ) {
          const repayAmount = Number(requestItem.amount);
          const activeLoanReq = await CooperativeRequest.findOne({
            userId: requestItem.userId,
            type: "loan",
            transactionType: "credit",
            status: "approved",
            "meta.loanStatus": "active",
          }).sort({ createdAt: -1 });

          if (!activeLoanReq || !activeLoanReq.meta) {
            return res.status(400).json({
              success: false,
              message: "No active loan found for this user to apply repayment.",
            });
          }

          if (repayAmount > (activeLoanReq.meta.balance || 0)) {
            return res.status(400).json({
              success: false,
              message: `Repayment amount exceeds outstanding balance (${activeLoanReq.meta.balance}).`,
            });
          }

          activeLoanReq.meta.balance =
            (activeLoanReq.meta.balance || 0) - repayAmount;
          if (activeLoanReq.meta.balance <= 0) {
            activeLoanReq.meta.balance = 0;
            activeLoanReq.meta.loanStatus = "completed";
          }
          activeLoanReq.markModified("meta");
          await activeLoanReq.save();
          console.log(
            "💸 Loan repayment applied via request. New balance:",
            activeLoanReq.meta.balance
          );
        }
      } else if (status === "rejected") {
        if (requestItem.transactionType === "credit") {
          requestItem.meta.loanStatus = "rejected";
        }
      }
    }

    requestItem.markModified("meta");
    await requestItem.save();

    // Send approval / rejection email
    try {
      const user = await CooperativeUser.findById(requestItem.userId).select(
        "firstName email"
      );
      if (user && user.email) {
        await sendWatalopiaEmail({
          to: user.email,
          subject: `Request ${status === "approved" ? "Approved" : "Rejected"}`,
          template: "requestStatus",
          data: {
            firstName: user.firstName,
            request: requestItem,
            status,
          },
        });
      }
    } catch (emailErr) {
      console.error("Failed to send request status email:", emailErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Request successfully ${status}.`,
      data: requestItem,
    });
  } catch (error) {
    console.error("❌ [COOP_STATUS_UPDATE_ERROR]:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update request status.",
    });
  }
};

// ==================== 3. GET ALL REQUESTS ====================
exports.getCooperativeRequests = async (req, res) => {
  try {
    const { status, type, transactionType, userId } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (type) filter.type = type;
    if (transactionType) filter.transactionType = transactionType;
    if (userId) filter.userId = userId;

    const requests = await CooperativeRequest.find(filter)
      .populate("userId", "name firstName lastName email phone countryCode")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error("❌ [GET_REQUESTS_ERROR]:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== 4. GET MY REQUESTS ====================
exports.getMyCooperativeRequests = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. User not found from token.",
      });
    }

    const { status, type, transactionType } = req.query;
    const filter = { userId };

    if (status) filter.status = status;
    if (type) filter.type = type;
    if (transactionType) filter.transactionType = transactionType;

    const requests = await CooperativeRequest.find(filter)
      .populate("userId", "name firstName lastName email phone countryCode")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error("❌ [GET_MY_REQUESTS_ERROR]:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch your requests.",
    });
  }
};

// ==================== 5. GET REQUESTS BY USER ====================
exports.getCooperativeRequestsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required.",
      });
    }

    const { status, type, transactionType } = req.query;
    const filter = { userId };

    if (status) filter.status = status;
    if (type) filter.type = type;
    if (transactionType) filter.transactionType = transactionType;

    const requests = await CooperativeRequest.find(filter)
      .populate("userId", "name firstName lastName email phone countryCode")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error("❌ [GET_USER_REQUESTS_ERROR]:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch user requests.",
    });
  }
};

// ==================== 6. ADMIN OVERVIEW (all users + counts) ====================
exports.getRequestsOverview = async (req, res) => {
  try {
    const { status, type, transactionType, userId } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (type) filter.type = type;
    if (transactionType) filter.transactionType = transactionType;
    if (userId) filter.userId = userId;

    const requests = await CooperativeRequest.find(filter)
      .populate("userId", "name email phone countryCode firstName lastName")
      .sort({ createdAt: -1 });

    const allForCounts = await CooperativeRequest.find(filter).select(
      "status type transactionType amount"
    );

    const counts = {
      total: allForCounts.length,
      byStatus: {
        pending: 0,
        approved: 0,
        rejected: 0,
      },
      byType: {
        savings: 0,
        loan: 0,
      },
      byTransactionType: {
        credit: 0,
        withdrawal: 0,
        transfer: 0,
      },
      breakdown: {
        savings: {
          credit: { pending: 0, approved: 0, rejected: 0, total: 0 },
          withdrawal: { pending: 0, approved: 0, rejected: 0, total: 0 },
          transfer: { pending: 0, approved: 0, rejected: 0, total: 0 },
        },
        loan: {
          credit: { pending: 0, approved: 0, rejected: 0, total: 0 },
          withdrawal: { pending: 0, approved: 0, rejected: 0, total: 0 },
          transfer: { pending: 0, approved: 0, rejected: 0, total: 0 },
        },
      },
      amounts: {
        total: 0,
        byStatus: {
          pending: 0,
          approved: 0,
          rejected: 0,
        },
        byType: {
          savings: 0,
          loan: 0,
        },
        byTransactionType: {
          credit: 0,
          withdrawal: 0,
          transfer: 0,
        },
        breakdown: {
          savings: {
            credit: { pending: 0, approved: 0, rejected: 0, total: 0 },
            withdrawal: { pending: 0, approved: 0, rejected: 0, total: 0 },
            transfer: { pending: 0, approved: 0, rejected: 0, total: 0 },
          },
          loan: {
            credit: { pending: 0, approved: 0, rejected: 0, total: 0 },
            withdrawal: { pending: 0, approved: 0, rejected: 0, total: 0 },
            transfer: { pending: 0, approved: 0, rejected: 0, total: 0 },
          },
        },
      },
    };

    allForCounts.forEach((r) => {
      const st = r.status || "pending";
      const tp = r.type;
      const tt = r.transactionType;
      const amt = Number(r.amount) || 0;

      if (counts.byStatus[st] !== undefined) counts.byStatus[st]++;
      if (counts.byType[tp] !== undefined) counts.byType[tp]++;
      if (counts.byTransactionType[tt] !== undefined)
        counts.byTransactionType[tt]++;

      if (counts.breakdown[tp] && counts.breakdown[tp][tt]) {
        counts.breakdown[tp][tt].total++;
        if (counts.breakdown[tp][tt][st] !== undefined) {
          counts.breakdown[tp][tt][st]++;
        }
      }

      counts.amounts.total += amt;
      if (counts.amounts.byStatus[st] !== undefined) {
        counts.amounts.byStatus[st] += amt;
      }
      if (counts.amounts.byType[tp] !== undefined) {
        counts.amounts.byType[tp] += amt;
      }
      if (counts.amounts.byTransactionType[tt] !== undefined) {
        counts.amounts.byTransactionType[tt] += amt;
      }

      if (counts.amounts.breakdown[tp] && counts.amounts.breakdown[tp][tt]) {
        counts.amounts.breakdown[tp][tt].total += amt;
        if (counts.amounts.breakdown[tp][tt][st] !== undefined) {
          counts.amounts.breakdown[tp][tt][st] += amt;
        }
      }
    });

    return res.status(200).json({
      success: true,
      count: requests.length,
      counts,
      data: requests,
    });
  } catch (error) {
    console.error("❌ [GET_REQUESTS_OVERVIEW_ERROR]:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch requests overview.",
    });
  }
};

// ==================== 7. CREATE & DISBURSE DIVIDENDS ====================
exports.createAndDisburseDividend = async (req, res) => {
  console.log("==================================================");
  console.log("🚀 [DIVIDEND_DISBURSEMENT] Incoming dividend creation request");
  console.log("Body:", req.body);

  try {
    const {
      title,
      totalAmount,
      description,
      distributionMethod = "pro_rata_savings",
    } = req.body;

    if (!title || !totalAmount || Number(totalAmount) <= 0) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: title and a valid totalAmount are required.",
      });
    }

    if (
      !["equal", "proportional", "pro_rata_savings"].includes(
        distributionMethod
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid distributionMethod. Must be 'equal', 'proportional', or 'pro_rata_savings'.",
      });
    }

    const CooperativeUserModel =
      mongoose.models.CooperativeUser || mongoose.model("CooperativeUser");
    const users = await CooperativeUserModel.find({});

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No cooperative users found to disburse dividends to.",
      });
    }

    const totalNumAmount = Number(totalAmount);
    let userShares = [];

    // 1. Calculate user savings balances from approved requests
    const userSavingsMap = {};
    const approvedSavings = await CooperativeRequest.find({
      type: "savings",
      status: "approved",
    });

    approvedSavings.forEach((reqItem) => {
      const uId = reqItem.userId.toString();
      const tType = (reqItem.transactionType || "").toLowerCase();
      const amt = Number(reqItem.amount) || 0;

      if (!userSavingsMap[uId]) userSavingsMap[uId] = 0;

      if (tType === "credit" || tType === "deposit") {
        userSavingsMap[uId] += amt;
      } else if (tType === "withdrawal" || tType === "transfer") {
        userSavingsMap[uId] -= amt;
      }
    });

    if (distributionMethod === "equal") {
      const sharePerUser = totalNumAmount / users.length;
      userShares = users.map((user) => ({
        userId: user._id,
        amount: Number(sharePerUser.toFixed(2)),
        user, // keep reference for email
      }));
    } else {
      // Pro-rata / Proportional
      const eligibleUsers = users.filter((user) => {
        const balance = userSavingsMap[user._id.toString()] || 0;
        return balance > 0;
      });

      if (eligibleUsers.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "No users with active savings balances found to disburse pro-rata dividends to.",
        });
      }

      let aggregateSavings = 0;
      eligibleUsers.forEach((user) => {
        aggregateSavings += userSavingsMap[user._id.toString()];
      });

      userShares = eligibleUsers.map((user) => {
        const userBal = userSavingsMap[user._id.toString()];
        const share = (userBal / aggregateSavings) * totalNumAmount;
        return {
          userId: user._id,
          amount: Number(share.toFixed(2)),
          user,
        };
      });
    }

    // 2. Bulk create approved dividend credit records
    const dividendRequests = userShares.map((item) => ({
      userId: item.userId,
      title: title,
      type: "dividends",
      transactionType: "credit",
      amount: item.amount,
      status: "approved",
      description:
        description || `Dividend payout via ${distributionMethod} distribution`,
      meta: {
        totalAmount: totalNumAmount,
        distributionMethod,
        dividendStatus: "distributed",
        distributedAt: new Date(),
      },
    }));

    const disbursedRecords = await CooperativeRequest.insertMany(
      dividendRequests
    );

    console.log(
      `✅ [DIVIDEND_DISBURSEMENT] Successfully disbursed to ${disbursedRecords.length} users with active savings.`
    );

    // Send dividend emails to each recipient
    for (const share of userShares) {
      try {
        const user = share.user;
        if (user && user.email) {
          await sendWatalopiaEmail({
            to: user.email,
            subject: "Dividend Credited to Your Account",
            template: "dividend",
            data: {
              firstName: user.firstName,
              amount: share.amount,
              title,
            },
          });
        }
      } catch (emailErr) {
        console.error(
          `Failed to send dividend email to ${share.user?.email}:`,
          emailErr.message
        );
      }
    }

    return res.status(201).json({
      success: true,
      message: `Dividend successfully created and disbursed to ${disbursedRecords.length} members based on their savings percentages!`,
      count: disbursedRecords.length,
      data: disbursedRecords,
    });
  } catch (error) {
    console.error("❌ [DIVIDEND_DISBURSEMENT_ERROR]:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create and disburse dividends.",
    });
  }
};
