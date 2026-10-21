const express = require("express");
const multer = require("multer");
const router = express.Router();
const { protect } = require("../../middlewares/pru/auth");

const {
  createAsset,
  getMyAssets,
  getAllAssets,
  getAssetById,
  updateAsset,
  deleteAsset,
} = require("../../controllers/padiman_utility_controllers/AssetController");

const upload = multer({ storage: multer.memoryStorage() });

// Protected Routes (User must be logged in)

// Allow up to 5 images per asset
router.post("/", protect, upload.array("images", 5), createAsset);
router.put("/:id", protect, upload.array("images", 5), updateAsset);



router.get("/my-assets", protect, getMyAssets);
router.delete("/:id", protect, deleteAsset);

// Public Routes
router.get("/", getAllAssets);
router.get("/:id", getAssetById);

module.exports = router;
