const express = require("express");
const multer = require("multer");
const router = express.Router();
const { protect } = require("../../middlewares/pru/auth");

const {
  createLostItem,
  getAllLostItems,
  getMyLostItems,
  getLostItemById,
  updateLostItem,
  deleteLostItem,
} = require("../../controllers/padiman_utility_controllers/LostAndFoundController");

const upload = multer({ storage: multer.memoryStorage() });

router.post("/", protect, upload.array("images", 5), createLostItem);
router.put("/:id", protect, upload.array("images", 5), updateLostItem);

router.get("/", getAllLostItems);
router.get("/my-items", protect, getMyLostItems);
router.get("/:id", getLostItemById);
router.delete("/:id", protect, deleteLostItem);

module.exports = router;
