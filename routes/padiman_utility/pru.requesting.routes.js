const express = require("express");
const router = express.Router();
const { protect } = require("../../middlewares/pru/auth");

const {
  createRequest,
  getUserRequests,
  getRequestById,
  updateRequestStatus // <-- Added new controller import
} = require("../../controllers/padiman_utility_controllers/requesting.controller");

// All routes require authentication
router.post("/", protect, createRequest);
router.get("/", protect, getUserRequests);
router.get("/:id", protect, getRequestById);

// --- NEW ROUTE TO UPDATE STATUS/FLAGS ---
router.patch("/:id", protect, updateRequestStatus);

module.exports = router;