const express = require("express");
const multer = require("multer");
const router = express.Router();
const { protect } = require("../../middlewares/pru/auth");

const {
  createSale,
  getMySales,
  getAllSales,
  getSaleById,
  updateSale,
  deleteSale,
} = require("../../controllers/padiman_utility_controllers/SaleController");

const upload = multer({ storage: multer.memoryStorage() });

// Routes
router.post("/", protect, upload.array("images", 6), createSale);
router.put("/:id", protect, upload.array("images", 6), updateSale);

router.get("/my-sales", protect, getMySales);
router.get("/", getAllSales);
router.get("/:id", getSaleById);
router.delete("/:id", protect, deleteSale);

module.exports = router;
