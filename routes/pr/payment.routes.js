const express = require("express");
const router = express.Router();
const paymentController = require("../../controllers/padiman_route_controllers/payment.controller");
const { protect } = require("../../middlewares/pr/pr.authMiddleware");

router.post("/initialize", protect, paymentController.initializePayment);
router.get("/verify/:reference", protect, paymentController.verifyPayment);

// --- NEW ESCROW CLEARING ROUTE ---
router.put("/earnings/release/:negotiationId", protect, paymentController.releaseEscrowEarnings);

module.exports = router;