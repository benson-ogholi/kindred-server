const { default: mongoose } = require("mongoose");
const AdminCommission = require("../../models/padiman_route_models/AdminCommission");
const DriverApplication = require("../../models/padiman_route_models/DriverApplication");
const Negotiation = require("../../models/padiman_route_models/Negotiation");
const Padiman_Route_User = require("../../models/padiman_route_models/Padiman_Route_User");
const Parcel = require("../../models/padiman_route_models/Parcel");
const Parcel_Request = require("../../models/padiman_route_models/Parcel_Request");
const Payment = require("../../models/padiman_route_models/Payment");
const RideOffer = require("../../models/padiman_route_models/RideOffer");
const Wallet = require("../../models/padiman_route_models/Wallet");

// ==========================================
// 1. GET ALL OPERATIONS (With Pagination)
// ==========================================

// @desc    Get all users
// @route   GET /api/admin/users
exports.getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const users = await Padiman_Route_User.find()
      .select("-password") // Never return passwords
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Padiman_Route_User.countDocuments();

    res
      .status(200)
      .json({ success: true, count: users.length, total, page, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all parcel requests
// @route   GET /api/admin/parcel-requests
exports.getAllParcelRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const parcelRequests = await Parcel_Request.find()
      .populate("user", "fullName email phone profileImage")
      .populate("negotiations")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Parcel_Request.countDocuments();

    res.status(200).json({
      success: true,
      count: parcelRequests.length,
      total,
      page,
      data: parcelRequests,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all parcels (created shipments)
// @route   GET /api/admin/parcels
exports.getAllParcels = async (req, res) => {
  try {
    // 1. Log incoming query parameters
    console.log("Query Parameters:", req.query);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 2. Log pagination logic
    console.log(`Pagination: page=${page}, limit=${limit}, skip=${skip}`);

    const parcels = await Parcel.find()
      .populate("requestedBy", "fullName email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Parcel.countDocuments();

    // 3. Log results summary
    console.log(
      `Successfully fetched ${parcels.length} parcels. Total in DB: ${total}`
    );

    res.status(200).json({
      success: true,
      count: parcels.length,
      total,
      page,
      data: parcels,
    });
  } catch (error) {
    // 4. Log detailed error for debugging
    console.error("Error in getAllParcels:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// @desc    Get all payments
// @route   GET /api/admin/payments
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

    res.status(200).json({
      success: true,
      count: payments.length,
      total,
      page,
      data: payments,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all ride offers
// @route   GET /api/admin/ride-offers
exports.getAllRideOffers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const rideOffers = await RideOffer.find()
      .populate("driver", "fullName email phone profileImage")
      .populate("negotiations")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await RideOffer.countDocuments();

    res.status(200).json({
      success: true,
      count: rideOffers.length,
      total,
      page,
      data: rideOffers,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all negotiations
// @route   GET /api/admin/negotiations
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

    res.status(200).json({
      success: true,
      count: negotiations.length,
      total,
      page,
      data: negotiations,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all driver applications
// @route   GET /api/admin/driver-applications
exports.getAllDriverApplications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const applications = await DriverApplication.find()
      .populate("user", "fullName email phone profileImage")
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await DriverApplication.countDocuments();

    res.status(200).json({
      success: true,
      count: applications.length,
      total,
      page,
      data: applications,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 2. DRIVER APPLICATION MANAGEMENT WORKFLOW
// ==========================================

// @desc    Update Driver Application Status (Approve, Reject, Suspend)
// @route   PUT /api/admin/driver-applications/:id/status
// @body    { "status": "approved" | "rejected" | "suspended", "rejectionReason": "string" }
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
        message: "A reason is required when rejecting an application.",
      });
    }

    // Find the application
    const application = await DriverApplication.findById(id);
    if (!application) {
      return res
        .status(404)
        .json({ success: false, message: "Driver application not found." });
    }

    // Prepare updates for both the driver application and the mapped user
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

    // Save updated application
    application.status = status;
    application.updatedAt = Date.now();
    await application.save();

    // Sync state over to the Padiman Route User record
    await Padiman_Route_User.findByIdAndUpdate(application.user, userUpdates, {
      new: true,
    });

    res.status(200).json({
      success: true,
      message: `Driver application has been successfully updated to ${status}.`,
      data: application,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllWithdrawals = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Aggregation pipeline to unwind embedded array items and lookup user details
    const aggregationPipeline = [
      { $unwind: "$withdrawals" },
      {
        $lookup: {
          from: "padimanrouteusers", // Target collection name for user details lookup
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

    // Calculate exact count of all embedded sub-documents
    const totalCountResult = await Wallet.aggregate([
      { $unwind: "$withdrawals" },
      { $count: "total" },
    ]);
    const total = totalCountResult.length > 0 ? totalCountResult[0].total : 0;

    // Apply pagination bounds to stream
    const data = await Wallet.aggregate([
      ...aggregationPipeline,
      { $skip: skip },
      { $limit: limit },
    ]);

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

// @desc    Get all admin commissions (15% platform earnings from withdrawals)
// @route   GET /api/admin/commissions
exports.getAllAdminCommissions = async (req, res) => {
  try {
    // 1. Log incoming query parameters
    console.log("Query Parameters for Commissions:", req.query);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 2. Log pagination logic
    console.log(
      `Commissions Pagination: page=${page}, limit=${limit}, skip=${skip}`
    );

    // Fetch records, populating user details who made the withdrawal
    const commissions = await AdminCommission.find()
      .populate("userId", "fullName email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AdminCommission.countDocuments();

    // 3. Log results summary
    console.log(
      `Successfully fetched ${commissions.length} commission entries. Total in DB: ${total}`
    );

    res.status(200).json({
      success: true,
      count: commissions.length,
      total,
      page,
      data: commissions,
    });
  } catch (error) {
    // 4. Log detailed error for debugging
    console.error("Error in getAllAdminCommissions:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Approve or Reject a specific withdrawal item
// @route   PUT /api/admin/withdrawals/:id/status
// @access  Private (Admin Only)
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

    // Find the parent wallet holding this specific embedded item within the session
    const wallet = await Wallet.findOne({ "withdrawals._id": id }).session(
      session
    );
    if (!wallet) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Withdrawal transaction entry not found.",
      });
    }

    // Locate the explicit subdocument object inside the schema array
    const withdrawalItem = wallet.withdrawals.id(id);

    if (withdrawalItem.status !== "pending") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `This payout request has already been processed as ${withdrawalItem.status}.`,
      });
    }

    // If administrative action is rejected, refund back to their active wallet ledger balance
    if (status === "failed") {
      wallet.balance += withdrawalItem.amount;
    }

    // Commit state variables on the wallet subdocument
    withdrawalItem.status = status;
    await wallet.save({ session });

    // --- NEW: If successful, write the 15% log record to AdminCommission ---
    let commissionLog = null;
    if (status === "success") {
      // The pre('validate') hook on AdminCommission model automatically handles the 15% math calculation
      const createdCommissions = await AdminCommission.create(
        [
          {
            withdrawalReference: withdrawalItem.reference || `WITHDRAW-${id}`, // fallback if reference is missing
            userId: wallet.user,
            totalWithdrawnAmount: withdrawalItem.amount,
            status: "collected",
          },
        ],
        { session }
      );
      commissionLog = createdCommissions[0];
    }
    // ----------------------------------------------------------------------

    // Finalize all operations inside the transaction safely
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: `Withdrawal request has been marked as ${status} successfully.`,
      data: {
        withdrawal: withdrawalItem,
        adminCommission: commissionLog, // Will return the logged commission object or null if failed
      },
    });
  } catch (error) {
    // If anything fails anywhere, discard all adjustments completely
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get dynamic metrics, time-series graphs, and cross-domain comparisons
// @route   GET /api/admin/dashboard-statistics
// @access  Private (Admin Only)
exports.getAdminDashboardStats = async (req, res) => {
  try {
    // ---------------------------------------------------------
    // A. CORE SYSTEM STATS COUNTERS (Parallel Counts Execution)
    // ---------------------------------------------------------
    const [
      totalUsers,
      totalDrivers,
      pendingDrivers,
      totalParcelRequests,
      activeShipments,
      totalRideOffers,
      totalNegotiations,
    ] = await Promise.all([
      Padiman_Route_User.countDocuments(),
      Padiman_Route_User.countDocuments({ isDriver: true }),
      DriverApplication.countDocuments({ status: "pending" }),
      Parcel_Request.countDocuments(),
      Parcel.countDocuments({ status: { $ne: "delivered" } }), // Ongoing active transits
      RideOffer.countDocuments(),
      Negotiation.countDocuments(),
    ]);

    // ---------------------------------------------------------
    // B. FINANCIAL LEDGER OVERVIEW
    // ---------------------------------------------------------
    const revenueStats = await Payment.aggregate([
      {
        $facet: {
          aggregateFinancials: [
            {
              $group: {
                _id: null,
                grossVolume: { $sum: "$amount" },
                successfulPayments: {
                  $sum: {
                    $cond: [{ $eq: ["$status", "completed"] }, "$amount", 0],
                  },
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

    // Unwind wallet collection to aggregate total assets & processed payouts
    const escrowWalletStats = await Wallet.aggregate([
      {
        $facet: {
          balances: [
            {
              $group: {
                _id: null,
                totalDriverBalances: { $sum: "$balance" },
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
        },
      },
    ]);

    const activeDriverEquity =
      escrowWalletStats[0]?.balances[0]?.totalDriverBalances || 0;
    const payoutGroup = escrowWalletStats[0]?.payouts || [];

    const processedPayouts =
      payoutGroup.find((p) => p._id === "success")?.totalAmount || 0;
    const pendingPayouts =
      payoutGroup.find((p) => p._id === "pending")?.totalAmount || 0;

    // --- MONGOOSE COLLECTION QUERY: Read exact values from AdminCommission Schema ---
    const adminCommissionAgg = await AdminCommission.aggregate([
      {
        $group: {
          _id: null,
          totalEarned: { $sum: "$adminEarnings" },
        },
      },
    ]);
    const adminCommissionEarned = adminCommissionAgg[0]?.totalEarned || 0;
    // ---------------------------------------------------------------------------------

    // ---------------------------------------------------------
    // C. GRAPH METRIC 1: 30-Day Chronological Time-Series Growth
    // ---------------------------------------------------------
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const chronologicalTimeLines = await Payment.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          status: "completed",
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$amount" },
          transactionsCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // ---------------------------------------------------------
    // D. GRAPH METRIC 2: Fulfillment Status Distributions
    // ---------------------------------------------------------
    const parcelStatusBreakdown = await Parcel.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // ---------------------------------------------------------
    // E. COMPARISONS: Negotiation Match Rates
    // ---------------------------------------------------------
    const negotiationConversionRates = await Negotiation.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
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

    // ---------------------------------------------------------
    // F. COMBINED INSIGHT RESPONSE DISPATCH
    // ---------------------------------------------------------
    res.status(200).json({
      success: true,
      timestamp: new Date(),
      data: {
        systemCounters: {
          users: totalUsers,
          activeDrivers: totalDrivers,
          pendingDriverApplications: pendingDrivers,
          parcelRequests: totalParcelRequests,
          activeShipmentsInTransit: activeShipments,
          rideOffers: totalRideOffers,
          negotiations: totalNegotiations,
        },
        financialSummaries: {
          grossVolumeInvoiced: globalFinancials.grossVolume,
          liquidRevenueEarned: globalFinancials.successfulPayments,
          totalPaymentsProcessed: globalFinancials.paymentCount,
          driverWalletBalancesEscrow: activeDriverEquity,
          successfulPayoutsSettled: processedPayouts,
          pendingPayoutsInQueue: pendingPayouts,
          adminCommissionEarned: adminCommissionEarned, // Serving factual data verified directly from the schema tracking records
          paymentBreakdownDistribution:
            revenueStats[0]?.paymentStatusDistribution || [],
        },
        charts: {
          historicalThirtyDayRevenue: chronologicalTimeLines.map((item) => ({
            date: item._id,
            revenue: item.revenue,
            volume: item.transactionsCount,
          })),
          parcelDistributionPieChart: parcelStatusBreakdown.map((item) => ({
            status: item._id || "unknown",
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
