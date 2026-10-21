const express = require("express");
const router = express.Router();
const {
  createNegotiation,
  getNegotiationById
} = require("../../controllers/padiman_route_controllers/pr.negotiation");
const { protect } = require("../../middlewares/pr/pr.authMiddleware");

router.post('/', protect, createNegotiation);
router.get('/:id', protect, getNegotiationById);

module.exports = router;
