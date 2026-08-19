const express = require("express");
const savingsController = require("../../controllers/cooperative/savingsController");
const { protect } = require("../../middlewares/cooperative/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", savingsController.getSavings);
router.post("/deposit", savingsController.depositSavings);
router.post("/withdraw", savingsController.withdrawSavings);

module.exports = router;
