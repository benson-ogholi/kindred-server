const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
  submitDriverApplication,
  getDriverApplicationStatus,
  verifyCustomerDocuments,
  getCustomerVerificationStatus,
} = require("../../controllers/padiman_route_controllers/pr.verify.controller");
const { protect } = require("../../middlewares/pr/pr.authMiddleware");

// Configure multer to handle file uploads in memory (buffers) for Backblaze B2 upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // limit file size to 5MB per file
  },
});

// Define expected file fields for driver application
const driverUploadMiddleware = upload.fields([
  { name: "licenseDocument", maxCount: 1 },
  { name: "selfie", maxCount: 1 },
]);

// Driver Application Routes
router.post("/apply", protect, driverUploadMiddleware, submitDriverApplication);
router.get("/application-status", protect, getDriverApplicationStatus);

// Customer Document Verification Routes
router.post(
  "/customer/verify-documents",
  protect,
  upload.single("selfie"), // If customer verification also requires a selfie upload
  verifyCustomerDocuments
);
router.get(
  "/customer/verification-status",
  protect,
  getCustomerVerificationStatus
);

module.exports = router;
