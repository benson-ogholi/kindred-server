const express = require("express");
const dividendController = require("../../controllers/cooperative/dividendController");
const {
  protect,
  restrictToAdmin,
} = require("../../middlewares/cooperative/authMiddleware");

const router = express.Router();

router.use(protect);
// router.use(restrictToAdmin);

// router.post("/distribute", dividendController.postAndDistributeDividend);
// GET /dividends - If admin, returns all. If regular user, returns only their own earnings.
router.get("/", dividendController.getAllDividends);

// POST /dividends/distribute - Admin only route
router.post("/distribute", dividendController.postAndDistributeDividend);

module.exports = router;
