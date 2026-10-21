const express = require("express");
const router = express.Router();
const multer = require("multer");

const {
  submitCooperativeRequest,
  updateRequestStatus,
  getCooperativeRequests,
  getMyCooperativeRequests,
  getCooperativeRequestsByUser,
  getRequestsOverview,
  createAndDisburseDividend,
  getSubscriptionRequests,
  updateSubscriptionStatus,
} = require("../../controllers/cooperative/cooperativeRequestController");

const {
  protect,
  restrictToAdmin,
} = require("../../middlewares/cooperative/authMiddleware");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const submitUpload = upload.fields([
  { name: "proof", maxCount: 1 },
  { name: "form1", maxCount: 1 },
  { name: "form2", maxCount: 1 },
]);

// ── Member ───────────────────────────────────────────────────
router.post("/submit", protect, submitUpload, submitCooperativeRequest);
router.get("/me", protect, getMyCooperativeRequests);

// ── Admin: overview with counts (must be before /:id) ────────
router.get("/overview", protect, restrictToAdmin, getRequestsOverview);

// ── Admin: subscription requests ─────────────────────────────
router.get("/subscriptions", protect, restrictToAdmin, getSubscriptionRequests);
router.patch(
  "/subscriptions/:id/status",
  protect,
  restrictToAdmin,
  updateSubscriptionStatus
);

// ── Admin: all requests (filterable) ─────────────────────────
router.get("/", protect, restrictToAdmin, getCooperativeRequests);

// ── Admin: one user’s requests ───────────────────────────────
router.get(
  "/user/:userId",
  protect,
  restrictToAdmin,
  getCooperativeRequestsByUser
);

router.post("/dividends/disburse", createAndDisburseDividend);
// ── Admin: approve / reject ──────────────────────────────────
router.patch("/:id/status", protect, restrictToAdmin, updateRequestStatus);

module.exports = router;
