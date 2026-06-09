const express = require("express");
const router = express.Router();
const {
  createNegotiation,
  cancelRide,
  updateNegotiation,
  getUserNegotiations,
  getNegotiationById
} = require("../../controllers/padiman_route_controllers/pr.negotiation");
const { protect } = require("../../middlewares/pr/pr.authMiddleware");

// POST /api/negotiations
router.post("/", protect, createNegotiation);

// PATCH /api/negotiations/:id/cancel
router.patch("/:id/cancel", protect, cancelRide);

// PATCH /api/negotiations/:id
router.patch("/:id", protect, updateNegotiation);

// GET /api/negotiations/user/:userId
router.get("/user/:userId", protect, getUserNegotiations);
// GET a single negotiation by ID
router.get("/:id", protect, getNegotiationById);
module.exports = router;
