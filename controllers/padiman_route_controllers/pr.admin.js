// ==========================================
// ADDRESS VERIFICATION - NOW SPLIT: 
//   1. Normal / Pending (quick list)
//   2. Full Log (Failed + Rejected ONLY)
// ==========================================

const { default: mongoose } = require("mongoose");
const AdminCommission = require("../../models/padiman_route_models/AdminCommission");
const DriverApplication = require("../../models/padiman_route_models/DriverApplication");
const Negotiation = require("../../models/padiman_route_models/Negotiation");
const Padiman_Route_User = require("../../models/padiman_route_models/Padiman_Route_User");
const Payment = require("../../models/padiman_route_models/Payment");
const { Wallet } = require("../../models/padiman_route_models/Wallet");
const Request = require("../../models/padiman_route_models/Request");

const AddressVerificationLog = require("../../models/padiman_route_models/AddressVerificationLog");

// ==========================================
// 1. GET ALL OPERATIONS
// ==========================================

// @desc    Get all users (unchanged)
exports.getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const users = await Padiman_Route_User.find()
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Padiman_Route_User.countDocuments();

    res.status(200).json({ success: true, count: users.length, total, page, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all requests (unchanged)
exports.getAllRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.status) filter.status = req.query.status;

    const requests = await Request.find(filter)
      .populate("userId", "fullName email phone profileImage")
      .populate("negotiation")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Request.countDocuments(filter);

    res.status(200).json({ success: true, count: requests.length, total, page, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get a single request (unchanged)
exports.getRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await Request.findById(id)
      .populate("userId", "fullName email phone profileImage")
      .populate("negotiation")
      .populate("rating.ratedBy", "fullName email");

    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found." });
    }

    res.status(200).json({ success: true, data: request });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all payments (unchanged)
exports.getAllPayments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const payments = await Payment.find()
      .populate("userId", "fullName email phone")
      .populate("negotiationId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Payment.countDocuments();

    res.status(200).json({ success: true, count: payments.length, total, page, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all negotiations (unchanged)
exports.getAllNegotiations = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const negotiations = await Negotiation.find()
      .populate("negotiator", "fullName email phone")
      .populate("serviceProvider", "fullName email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Negotiation.countDocuments();

    res.status(200).json({ success: true, count: negotiations.length, total, page, data: negotiations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all driver submissions (unchanged - still supports all statuses)
exports.getAllDriverSubmissions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {
      "verificationMeta.driverVerification": { $exists: true },
    };

    if (req.query.status === "approved") {
      filter.isDriverApproved = true;
    } else if (req.query.status === "failed" || req.query.status === "rejected") {
      filter.isDriverRejected = true;
    }

    const users = await Padiman_Route_User.find(filter)
      .select("-password")
      .sort({ "verificationMeta.driverVerification.verifiedAt": -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Padiman_Route_User.countDocuments(filter);

    const formattedSubmissions = users.map((u) => {
      const driverVerification = u.verificationMeta?.driverVerification || {};
      const vehicleApp = driverVerification.vehicleApplication || {};
      const docs = driverVerification.documents || {};

      let status = "pending";
      if (u.isDriverApproved) status = "approved";
      else if (u.isDriverRejected) status = "rejected";
      else if (u.isDriverSuspended) status = "suspended";

      const profileImage =
        u.profileImage ||
        u.profilePicture ||
        docs.selfieUrl ||
        u.selfieUrl ||
        null;

      return {
        _id: u._id,
        user: {
          _id: u._id,
          fullName: u.fullName,
          email: u.email,
          phone: u.phone,
          profileImage: profileImage,
        },
        driversLicense: {
          licenseNumber: u.driverLicenseNumber || driverVerification.idNumber || "N/A",
          image: docs.licenseDocumentUrl || null,
        },
        carDetails: {
          model: vehicleApp.vehicleModel || "N/A",
          year: vehicleApp.vehicleYear || "N/A",
          licensePlate: vehicleApp.plateNumber || "N/A",
          vehicleType: vehicleApp.vehicleType || "N/A",
        },
        carImages: docs.selfieUrl
          ? [{ _id: "selfie_1", url: docs.selfieUrl, description: "Selfie Verification" }]
          : [],
        status: status,
        submittedAt: driverVerification.verifiedAt || u.updatedAt,
      };
    });

    res.status(200).json({
      success: true,
      count: formattedSubmissions.length,
      total,
      page,
      data: formattedSubmissions,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all withdrawals (unchanged)
exports.getAllWithdrawals = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const aggregationPipeline = [
      { $unwind: "$withdrawals" },
      {
        $lookup: {
          from: "padimanrouteusers",
          localField: "user",
          foreignField: "_id",
          as: "userDetails",
        },
      },
      { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: "$withdrawals._id",
          walletId: "$_id",
          amount: "$withdrawals.amount",
          reference: "$withdrawals.reference",
          status: "$withdrawals.status",
          bankDetails: "$withdrawals.bankDetails",
          createdAt: "$withdrawals.createdAt",
          user: {
            _id: "$userDetails._id",
            fullName: "$userDetails.fullName",
            email: "$userDetails.email",
            phone: "$userDetails.phone",
            profileImage: "$userDetails.profileImage",
          },
        },
      },
      { $sort: { createdAt: -1 } },
    ];

    const totalCountResult = await Wallet.aggregate([
      { $unwind: "$withdrawals" },
      { $count: "total" },
    ]);
    const total = totalCountResult.length > 0 ? totalCountResult[0].total : 0;

    const data = await Wallet.aggregate([...aggregationPipeline, { $skip: skip }, { $limit: limit }]);

    res.status(200).json({
      success: true,
      count: data.length,
      total,
      page,
      data,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all admin commissions (unchanged)
exports.getAllAdminCommissions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const commissions = await AdminCommission.find()
      .populate("userId", "fullName email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AdminCommission.countDocuments();

    res.status(200).json({
      success: true,
      count: commissions.length,
      total,
      page,
      data: commissions,
    });
  } catch (error) {
    console.error("Error in getAllAdminCommissions:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Approve or Reject withdrawal (unchanged)
exports.updateWithdrawalStatus = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["success", "failed"].includes(status)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid status value. Must be 'success' or 'failed'.",
      });
    }

    const wallet = await Wallet.findOne({ "withdrawals._id": id }).session(session);
    if (!wallet) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Withdrawal transaction entry not found.",
      });
    }

    const withdrawalItem = wallet.withdrawals.id(id);
    if (withdrawalItem.status !== "pending") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `This payout request has already been processed as ${withdrawalItem.status}.`,
      });
    }

    if (status === "failed") {
      wallet.balance += withdrawalItem.amount;
      if (typeof wallet.withdrawableBalance !== "number") wallet.withdrawableBalance = 0;
      wallet.withdrawableBalance += withdrawalItem.amount;
    }

    withdrawalItem.status = status;
    await wallet.save({ session });

    let commissionLog = null;
    if (status === "success") {
      const createdCommissions = await AdminCommission.create(
        [
          {
            withdrawalReference: withdrawalItem.reference || `WITHDRAW-${id}`,
            userId: wallet.user,
            totalWithdrawnAmount: withdrawalItem.amount,
            status: "collected",
          },
        ],
        { session }
      );
      commissionLog = createdCommissions[0];
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: `Withdrawal request has been marked as ${status} successfully.`,
      data: { withdrawal: withdrawalItem, adminCommission: commissionLog },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get dashboard stats (unchanged)
exports.getAdminDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalDrivers,
      pendingDrivers,
      totalNegotiations,
      totalRequests,
      activeRequestsInProgress,
      requestsByTypeAgg,
      requestsByStatusAgg,
    ] = await Promise.all([
      Padiman_Route_User.countDocuments(),
      Padiman_Route_User.countDocuments({ isDriver: true }),
      DriverApplication.countDocuments({ status: "pending" }),
      Negotiation.countDocuments(),
      Request.countDocuments(),
      Request.countDocuments({ status: { $in: ["assigned", "in_progress"] } }),
      Request.aggregate([{ $group: { _id: "$type", count: { $sum: 1 } } }]),
      Request.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    const requestsByType = requestsByTypeAgg.reduce((acc, item) => {
      acc[item._id || "unknown"] = item.count;
      return acc;
    }, {});

    const requestsByStatus = requestsByStatusAgg.reduce((acc, item) => {
      acc[item._id || "unknown"] = item.count;
      return acc;
    }, {});

    const revenueStats = await Payment.aggregate([
      {
        $facet: {
          aggregateFinancials: [
            {
              $group: {
                _id: null,
                grossVolume: { $sum: "$amount" },
                successfulPayments: {
                  $sum: { $cond: [{$eq: ["$status", "completed"] }, "$amount", 0] },
                },
                paymentCount: { $sum: 1 },
              },
            },
          ],
          paymentStatusDistribution: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
                value: { $sum: "$amount" },
              },
            },
          ],
        },
      },
    ]);

    const globalFinancials = revenueStats[0]?.aggregateFinancials[0] || {
      grossVolume: 0,
      successfulPayments: 0,
      paymentCount: 0,
    };

    const escrowWalletStats = await Wallet.aggregate([
      {
        $facet: {
          balances: [
            {
              $group: {
                _id: null,
                totalDriverBalances: { $sum: "$balance" },
                totalWithdrawableBalances: { $sum: "$withdrawableBalance" },
              },
            },
          ],
          payouts: [
            { $unwind: "$withdrawals" },
            {
              $group: {
                _id: "$withdrawals.status",
                totalAmount: { $sum: "$withdrawals.amount" },
                count: { $sum: 1 },
              },
            },
          ],
          earningsByStatus: [
            { $unwind: "$earnings" },
            {
              $group: {
                _id: "$earnings.status",
                totalAmount: { $sum: "$earnings.amount" },
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]);

    const activeDriverEquity =
      escrowWalletStats[0]?.balances[0]?.totalDriverBalances || 0;
    const totalWithdrawableBalances =
      escrowWalletStats[0]?.balances[0]?.totalWithdrawableBalances || 0;

    const payoutGroup = escrowWalletStats[0]?.payouts || [];
    const processedPayouts =
      payoutGroup.find((p) => p._id === "success")?.totalAmount || 0;
    const pendingPayouts =
      payoutGroup.find((p) => p._id === "pending")?.totalAmount || 0;

    const earningsGroup = escrowWalletStats[0]?.earningsByStatus || [];
    const escrowHeldEarnings =
      earningsGroup.find((e) => e._id === "pending")?.totalAmount || 0;
    const releasedEarnings =
      earningsGroup.find((e) => e._id === "success")?.totalAmount || 0;

    const adminCommissionAgg = await AdminCommission.aggregate([
      { $group: { _id: null, totalEarned: { $sum: "$adminEarnings" } } },
    ]);
    const adminCommissionEarned = adminCommissionAgg[0]?.totalEarned || 0;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const chronologicalTimeLines = await Payment.aggregate([
      {
        $match: { createdAt: {$gte: thirtyDaysAgo }, status: "completed" },
      },
      {
        $group: {
          _id: { $dateToString: { format: "\%Y-\%m-\%d", date: "$createdAt" } },
          revenue: { $sum: "$amount" },
          transactionsCount: { $sum: 1 },         },       },       {$sort: { _id: 1 } },
    ]);

    const negotiationConversionRates = await Negotiation.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const totalNegotiationCount = negotiationConversionRates.reduce(
      (acc, curr) => acc + curr.count,
      0
    );
    const acceptedCount =
      negotiationConversionRates.find((n) => n._id === "accepted")?.count || 0;
    const negotiationMatchSuccessRate =
      totalNegotiationCount > 0
        ? parseFloat(((acceptedCount / totalNegotiationCount) * 100).toFixed(2))
        : 0;

    res.status(200).json({
      success: true,
      timestamp: new Date(),
      data: {
        systemCounters: {
          users: totalUsers,
          activeDrivers: totalDrivers,
          pendingDriverSubmissions: pendingDrivers,
          negotiations: totalNegotiations,
          totalRequests,
          activeRequestsInProgress,
          requestsByType,
          requestsByStatus,
        },
        financialSummaries: {
          grossVolumeInvoiced: globalFinancials.grossVolume,
          liquidRevenueEarned: globalFinancials.successfulPayments,
          totalPaymentsProcessed: globalFinancials.paymentCount,
          driverWalletBalancesEscrow: activeDriverEquity,
          successfulPayoutsSettled: processedPayouts,
          pendingPayoutsInQueue: pendingPayouts,
          adminCommissionEarned: adminCommissionEarned,
          paymentBreakdownDistribution:
            revenueStats[0]?.paymentStatusDistribution || [],
          totalWithdrawableBalances,
          escrowHeldEarnings,
          releasedEarnings,
        },
        charts: {
          historicalThirtyDayRevenue: chronologicalTimeLines.map((item) => ({
            date: item._id,
            revenue: item.revenue,
            volume: item.transactionsCount,
          })),
          requestStatusPieChart: requestsByStatusAgg.map((item) => ({
            status: item._id || "unknown",
            count: item.count,
          })),
          requestTypePieChart: requestsByTypeAgg.map((item) => ({
            type: item._id || "unknown",
            count: item.count,
          })),
          negotiationComparisonMetrics: {
            successRatePercentage: negotiationMatchSuccessRate,
            totalNegotiationsCount: totalNegotiationCount,
            statusBreakdown: negotiationConversionRates,
          },
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// ADDRESS VERIFICATION - NOW SPLIT
// ==========================================

// @desc    Get ALL pending address verifications (normal list - same as your React table)
// @route   GET /api/admin/address-verifications
exports.getAllAddressVerifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // ONLY pending = isAddressPending = true
    const filter = {
      isAddressPending: true,
    };

    const users = await Padiman_Route_User.find(filter)
      .select("-password")
      .sort({ "verificationMeta.utilityBill.submittedAt": -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Padiman_Route_User.countDocuments(filter);

    const formattedSubmissions = users.map((user) => {
      const utilityBill = user.verificationMeta?.utilityBill || {};
      return {
        _id: user._id,
        user: {
          _id: user._id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          profileImage: user.profileImage,
        },
        address: utilityBill.address || user.address || "N/A",
        utilityBillUrl: utilityBill.billUrl || null,
        status: "pending",
        rejectionReason: null,
        submittedAt: utilityBill.submittedAt || user.updatedAt,
        verifiedAt: null,
      };
    });

    res.status(200).json({
      success: true,
      count: formattedSubmissions.length,
      total,
      page,
      data: formattedSubmissions,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get ONLY FAILED + REJECTED (the log collection)
// @route   GET /api/admin/address-verifications-logs
exports.getAllAddressVerificationLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {
      status: { $in: ["failed", "rejected"] },
    };

    const logs = await AddressVerificationLog.find(filter)
      .populate("userId", "fullName email phone profileImage")
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AddressVerificationLog.countDocuments(filter);

    res.status(200).json({
      success: true,
      count: logs.length,
      total,
      page,
      data: logs,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update address verification status (approve / reject / fail)
// @route   PUT /api/admin/address-verifications/:userId/status
exports.updateAddressVerificationStatus = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId } = req.params;
    let { status, rejectionReason } = req.body;

    if (status === "rejected") status = "failed";

    if (!["approved", "failed"].includes(status)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Invalid status value. Must be "approved", "rejected" or "failed".',
      });
    }

    if (status === "failed" && !rejectionReason) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "A rejection reason is required when declining address verification.",
      });
    }

    const user = await Padiman_Route_User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "User not found." });
    }

    if (status === "approved") {
      user.isAddressVerified = true;
      user.isAddressPending = false;
      user.isAddressVerificationFailed = false;
    } else if (status === "failed") {
      user.isAddressVerified = false;
      user.isAddressPending = false;
      user.isAddressVerificationFailed = true;
    }

    if (!user.verificationMeta) user.verificationMeta = {};
    if (!user.verificationMeta.utilityBill) user.verificationMeta.utilityBill = {};

    user.verificationMeta.utilityBill.status = status;
    user.verificationMeta.utilityBill.verifiedAt = new Date();
    user.verificationMeta.utilityBill.rejectionReason =
      status === "failed" ? rejectionReason : null;
    user.markModified("verificationMeta");

    await user.save({ session });

    // Create permanent log entry (failed / rejected)
    const logType = status === "approved" ? "approved" : "failed";
    const newLog = new AddressVerificationLog({
      submissionId: userId + "_" + Date.now(),
      userId: user._id,
      logType,
      status,
      address: user.verificationMeta.utilityBill.address || user.address || "N/A",
      utilityBillUrl: user.verificationMeta.utilityBill.billUrl || null,
      submittedAt: user.verificationMeta.utilityBill.submittedAt || user.updatedAt,
      verifiedAt: user.verificationMeta.utilityBill.verifiedAt,
      rejectionReason: user.verificationMeta.utilityBill.rejectionReason,
      userDetails: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        profileImage: user.profileImage,
      },
    });

    await newLog.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: `Address verification status updated to ${status} and logged.`,
      data: {
        log: newLog,
        user: {
          _id: user._id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          profileImage: user.profileImage,
        },
        address:
          user.verificationMeta.utilityBill.address || user.address || "N/A",
        utilityBillUrl: user.verificationMeta.utilityBill.billUrl || null,
        status: status,
        rejectionReason: user.verificationMeta.utilityBill.rejectionReason,
        submittedAt:
          user.verificationMeta.utilityBill.submittedAt || user.updatedAt,
        verifiedAt: user.verificationMeta.utilityBill.verifiedAt,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: error.message });
  }
};


exports.updateDriverStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    // Validate inputs
    const allowedStatuses = ["approved", "rejected", "suspended"];
    if (!allowedStatuses.includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status value provided." });
    }

    if (status === "rejected" && !rejectionReason) {
      return res.status(400).json({
        success: false,
        message: "A reason is required when rejecting a submission.",
      });
    }

    // Find the submission
    const application = await DriverApplication.findById(id);
    if (!application) {
      return res
        .status(404)
        .json({ success: false, message: "Driver submission not found." });
    }

    // Prepare updates for both the driver submission and the mapped user
    let userUpdates = {
      isDriverPending: false,
      isDriver: false,
      isDriverSuspended: false,
      isDriverRejected: false,
    };

    if (status === "approved") {
      userUpdates.isDriver = true;
      application.rejectionReason = undefined;
    } else if (status === "rejected") {
      userUpdates.isDriverRejected = true;
      application.rejectionReason = rejectionReason;
    } else if (status === "suspended") {
      userUpdates.isDriverSuspended = true;
    }

    // Save updated submission
    application.status = status;
    application.updatedAt = Date.now();
    await application.save();

    // Sync state over to the Padiman Route User record
    await Padiman_Route_User.findByIdAndUpdate(application.user, userUpdates, {
      new: true,
    });

    res.status(200).json({
      success: true,
      message: `Driver submission has been successfully updated to ${status}.`,
      data: application,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};