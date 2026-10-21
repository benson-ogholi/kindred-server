// routes/padiman_utility/pru.home.routes.js
const express = require("express");
const router = express.Router();
const {
  getHomeDashboard,
  getMessagesPerRequest,
  getMessagesByRequestId,
} = require("../../controllers/padiman_utility_controllers/pru.home.controller");
const { protect } = require("../../middlewares/pru/auth");


router.get("/home", protect, getHomeDashboard);
router.get("/messages", protect, getMessagesPerRequest);
router.get("/messages/:requestId", protect, getMessagesByRequestId);

module.exports = router;