// ==========================================
// 1. UPDATED BACKEND ROUTER (loanRoutes.js)
// Added multer upload middleware for surety forms (`form1`, `form2`)
// ==========================================
const express = require("express");
const loanController = require("../../controllers/cooperative/loanController");
const { protect, restrictToAdmin } = require("../../middlewares/cooperative/authMiddleware");
const multer = require("multer");

const router = express.Router();

// Configure multer to handle memory storage for Backblaze uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit per file
});

router.use(protect);

router.get("/", loanController.getUserLoans);

// Use multer fields to handle multiple surety files: 'form1' and 'form2'
router.post(
  "/create",
  upload.fields([
    { name: "form1", maxCount: 1 },
    { name: "form2", maxCount: 1 },
  ]),
  loanController.createLoan
);

router.post("/repay", loanController.repayLoan);
router.post("/review", restrictToAdmin, loanController.reviewLoan); // Admin approve/reject route

module.exports = router;