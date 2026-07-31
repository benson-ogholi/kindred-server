const express = require("express");
const multer = require("multer");
const router = express.Router();
const { protect } = require("../../middlewares/pru/auth");

const {
  createHireEquipment,
  getMyHireEquipment,
  getAvailableHireEquipment,
  getHireEquipmentById,
  updateHireEquipment,
  togglePauseHireEquipment,
  deleteHireEquipment,
} = require("../../controllers/padiman_utility_controllers/pru.hireEquipment.controller"); // Adjust your controller path if needed

const upload = multer({ storage: multer.memoryStorage() });

// Protected Routes (User must be logged in)

// Allow uploading images for equipment
router.post("/", protect, upload.any(), createHireEquipment);
router.put("/:id", protect, upload.any(), updateHireEquipment);

router.get("/my-equipment", protect, getMyHireEquipment);
router.patch("/:id/pause", protect, togglePauseHireEquipment);
router.delete("/:id", protect, deleteHireEquipment);

// Public / Protected Routes (Get available equipment & get single equipment)
router.get("/", protect, getAvailableHireEquipment);
router.get("/:id", protect, getHireEquipmentById);

module.exports = router;
