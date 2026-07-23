const express = require("express");
const {
  getAllUsers,
  getAllRequests,
  getRequestById,
  getAllPayments,
  getAllNegotiations,
  getAllDriverApplications,
  updateDriverStatus,
  getAllWithdrawals,
  updateWithdrawalStatus,
  getAdminDashboardStats,
  getAllAdminCommissions,
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
router.get("/driver-applications", getAllDriverApplications);

// Unified Requests (join-ride, offer-ride, send-package, deliver-package)
// — replaces the old separate parcel-requests / parcels / ride-offers
// routes. Supports optional ?type= and ?status= query filters.
// @route   GET /api/admin/requests
// @route   GET /api/admin/requests/:id
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

// Handle a driver application (Approve / Reject / Suspend)
router.put("/driver-applications/:id/status", updateDriverStatus);

// Approve or reject a specific sub-document withdrawal via its unique embedded _id
// @route   PUT /api/admin/withdrawals/:id/status
router.put("/withdrawals/:id/status", updateWithdrawalStatus);

module.exports = router;
