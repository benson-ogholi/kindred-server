const express = require('express');
const AdminController = require('../../controllers/padiman_route_controllers/pr.admin.controller.auth');
const router = express.Router();

// Route to initiate the login/signup process
// POST /api/admin/send-otp
router.post('/send-otp', AdminController.sendOtp);

// Route to verify the OTP and log the user in
// POST /api/admin/verify-otp
router.post('/verify-otp', AdminController.verifyOtp);

module.exports = router;