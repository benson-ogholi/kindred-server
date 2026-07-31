const express = require("express");
const router = express.Router();
const paymentController = require("../../controllers/padiman_utility_controllers/pru.payments.controllers");
const { protect } = require("../../middlewares/pru/auth");

router.post("/initialize", protect, paymentController.initializePayment);
router.get("/verify/:reference", protect, paymentController.verifyPayment);

// --- NEW ESCROW CLEARING ROUTE ---
// Changed from :negotiationId to :requestingId to match the controller
router.put(
  "/earnings/release/:requestingId",
  protect,
  paymentController.releaseEscrowEarnings
);

module.exports = router;
