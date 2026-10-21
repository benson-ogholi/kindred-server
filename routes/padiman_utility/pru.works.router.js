const express = require("express");
const multer = require("multer");
const router = express.Router();
const { protect } = require("../../middlewares/pru/auth");

const {
  createWork,
  getMyWorks,
  getAvailableWorks,
  getWorkById,
  updateWork,
  togglePauseWork,
  deleteWork,
} = require("../../controllers/padiman_utility_controllers/pru.works.controllers"); // Adjust your controller path if needed

const upload = multer({ storage: multer.memoryStorage() });

// Protected Routes (User must be logged in)

// Allow up to 5 images for previous jobs
router.post("/", protect, upload.any(), createWork);
router.put("/:id", protect, upload.any(), updateWork);

router.get("/my-works", protect, getMyWorks);
router.patch("/:id/pause", protect, togglePauseWork);
router.delete("/:id", protect, deleteWork);

// Public Routes (Get available works & get single work)
router.get("/", protect,  getAvailableWorks);
router.get("/:id", protect, getWorkById);

module.exports = router;