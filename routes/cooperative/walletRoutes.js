const express = require("express");
const walletController = require("../../controllers/cooperative/walletController");
const { protect } = require("../../middlewares/cooperative/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", walletController.getWallet);
router.post("/deposit", walletController.depositWallet);
router.post("/withdraw", walletController.withdrawWallet);

module.exports = router;
