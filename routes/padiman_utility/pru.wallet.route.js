const express = require("express");
const router = express.Router();
const walletController = require("../../controllers/padiman_utility_controllers/pru.wallet.controllers"); // adjust path if needed
const { protect } = require("../../middlewares/pru/auth");

// ====================== WALLET ======================
router.get("/", protect, walletController.getWallet);
router.get("/earnings", protect, walletController.getEarnings);
router.get("/withdrawals", protect, walletController.getWithdrawals);

// ====================== FUNDING ======================
router.post("/funding/initialize", protect, walletController.initializeFunding);
router.get("/funding/verify/:reference", protect, walletController.verifyAndTopUp);

// ====================== WITHDRAWALS ======================
router.post("/withdraw", protect, walletController.requestWithdrawal);
router.get("/banks", protect, walletController.getBankList);
router.post("/resolve-account", protect, walletController.resolveAccount);

router.get("/payments", protect, walletController.getMyPayments);
router.get("/payments/:id", protect, walletController.getPaymentById);
router.get(
  "/payments/requesting/:requestingId",
  protect,
  walletController.getPaymentsByRequesting
);

module.exports = router;