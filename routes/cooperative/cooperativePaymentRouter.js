const express = require("express");
const router = express.Router();
const {
  initializePayment,
  verifyPayment,
  getBanks,
  verifyBankAccount,
  submitWithdrawalRequest,
  getAllWithdrawalRequests,
} = require("../../controllers/cooperative/cooperativePaymentController");
const {
  protect,
} = require("../../middlewares/cooperative/authMiddleware");

// POST /api/payments/initialize
router.post("/initialize", protect, initializePayment);

// GET /api/payments/verify/:reference
router.get("/verify/:reference", protect, verifyPayment);

// GET /api/payments/banks
router.get("/banks", protect, getBanks);

// GET /api/payments/resolve-account
router.get("/resolve-account", protect, verifyBankAccount);

// POST /api/payments/withdraw
router.post("/withdraw", protect, submitWithdrawalRequest);

// GET /api/payments/withdrawals
router.get("/withdrawals", protect, getAllWithdrawalRequests);

module.exports = router;