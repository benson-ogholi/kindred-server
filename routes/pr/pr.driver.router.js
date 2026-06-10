const express = require("express");
const router = express.Router();
const multer = require("multer");

// Middleware imports
const { protect } = require("../../middlewares/pr/pr.authMiddleware"); 
const {
  submitDriverApplication,
  getDriverApplicationStatus,
} = require("../../controllers/padiman_route_controllers/pr.drivers");

// Setup Multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit check per file structural rule
});

// --- ROUTES ---

// 1. Submit Driver Application
// Usage: POST /api/driver/apply
// Expects: FormData containing:
// - "driversLicenseImage" (Single license file)
// - "carImages" (Up to 4 vehicle files)
router.post(
  "/apply",
  protect,
  upload.fields([
    { name: "driversLicenseImage", maxCount: 1 },
    { name: "carImages", maxCount: 4 }
  ]),
  submitDriverApplication
);

// 2. Get Application Status
// Usage: GET /api/driver/status
router.get("/status", protect, getDriverApplicationStatus);

module.exports = router;