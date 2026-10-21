const express = require("express");
const adminController = require("../../controllers/cooperative/adminController");
// Import your authentication guard and admin restriction middleware
const {
  protect,
  restrictToAdmin,
} = require("../../middlewares/cooperative/authMiddleware");

const router = express.Router();

router.use(protect);
router.use(restrictToAdmin);

/* ==================== USER MANAGEMENT ==================== */

router
  .route("/users")
  .get(adminController.getAllUsers)
  .post(adminController.adminCreateUser);

router
  .route("/users/:userId/role")
  .patch(adminController.updateUserRoleAndPermissions);

/* ==================== SYSTEM-WIDE COOPERATIVE OVERVIEW ==================== */

// Returns all wallets, savings, loans, and dividends with member details for admins
router.get("/overview", adminController.getAdminCooperativeOverview);

/* ==================== COOPERATIVE MANAGEMENT (ADMIN) ==================== */

// Create a cooperative entry directly (wallet, savings, loan, or dividend)
router.post("/items/:type", adminController.createCooperativeItem);

// Accept or reject loan applications
router.patch("/loans/:loanId/review", adminController.reviewLoanApplication);

module.exports = router;
