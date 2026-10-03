const express = require("express");
const {
  getAllUsers,
  getAllRequests,
  getRequestById,
  getAllPayments,
  getAllNegotiations,
  getAllDriverSubmissions,
  updateDriverStatus,
  getAllWithdrawals,
  updateWithdrawalStatus,
  getAdminDashboardStats,
  getAllAdminCommissions,
  getAllAddressVerifications,
  getAllAddressVerificationLogs, // <--- Added missing import
  updateAddressVerificationStatus,
} = require("../../controllers/padiman_route_controllers/pr.admin");
const router = express.Router();

// ==========================================
// 1. DATA AUDIT PIPELINES (GET)
// ==========================================

// Operational Insights Analytics Engine
// @route   GET /api/admin/dashboard-statistics
router.get("/dashboard-statistics", getAdminDashboardStats);

// Users Management
router.get("/users", getAllUsers);

// Driver Verification Queue
router.get("/driver-submissions", getAllDriverSubmissions);

// Address Verification Queue
// @route   GET /api/admin/address-verifications
router.get("/address-verifications", getAllAddressVerifications);

// Address Verification Logs Queue (Failed + Rejected ONLY)
// @route   GET /api/admin/address-verifications-logs
router.get("/address-verifications-logs", getAllAddressVerificationLogs); // <--- Added missing route mapping

// Unified Requests
router.get("/requests", getAllRequests);
router.get("/requests/:id", getRequestById);

// Core System Actions
router.get("/negotiations", getAllNegotiations);
router.get("/payments", getAllPayments);

// Financial Ledger Settlements Ledger
router.get("/withdrawals", getAllWithdrawals);

// 15% Platform Revenue Ledger Audit
// @route   GET /api/admin/commissions
router.get("/commissions", getAllAdminCommissions);

// ==========================================
// 2. MANAGEMENT WORKFLOW ENDPOINTS (PUT)
// ==========================================

// Handle a driver submission (Approve / Reject / Suspend)
router.put("/driver-submissions/:id/status", updateDriverStatus);

// Handle an address verification submission (Approve / Reject)
// @route   PUT /api/admin/address-verifications/:userId/status
router.put(
  "/address-verifications/:userId/status",
  updateAddressVerificationStatus
);

// Approve or reject a specific sub-document withdrawal via its unique embedded _id
// @route   PUT /api/admin/withdrawals/:id/status
router.put("/withdrawals/:id/status", updateWithdrawalStatus);

module.exports = router;