const express = require("express");
const router = express.Router();
const {
  getWallet,
  getEarnings,
  getWithdrawals,
  getBankList,
  requestWithdrawal,
  initializeFunding,
  verifyAndTopUp,
  resolveAccount,
} = require("../../controllers/padiman_route_controllers/pr.wallet.controller");
const { protect } = require("../../middlewares/pr/pr.authMiddleware");

router.use(protect);

router.get("/", protect, getWallet);
router.get("/earnings", protect, getEarnings);
router.get("/withdrawals", protect, getWithdrawals);
router.get("/banks", protect, getBankList);
router.post("/withdraw", protect, requestWithdrawal);
router.post("/fund/initialize", protect, initializeFunding);
router.get("/fund/verify/:reference", protect, verifyAndTopUp);
router.post("/wallet/resolve-account", protect, resolveAccount);


module.exports = router;
