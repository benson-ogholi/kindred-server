const express = require("express");
const router = express.Router();
const multer = require("multer"); // <--- Import Multer

// Configure Multer to store the file in a memory buffer (required for Backblaze B2)
const upload = multer({ storage: multer.memoryStorage() });

const { protect } = require("../../middlewares/pr/pr.authMiddleware");

const {
  createRequest,
  getUserRequests,
  getRequest,
  updateRequest,
  updateRequestProgress,
  getMatchingRequests
} = require("../../controllers/padiman_route_controllers/pr.request.controller");

router.use(protect);

router.post("/", createRequest);
router.get("/me", getUserRequests);
router.get("/:id", getRequest);

// 👇 ADD `upload.single` HERE to intercept the image file before hitting the controller
router.put("/:id", upload.single("handOverProof"), updateRequest);

// 👇 NEW: ride/service progress updates (status, currentLocation, handOverProof)
// Must come AFTER "/:id" so Express doesn't need to disambiguate, but the extra
// "/progress" segment means it won't collide with the "/:id" PUT route above anyway.
router.put("/progress/:id", upload.single("handOverProof"), updateRequestProgress);

router.get("/:id/matches", getMatchingRequests); // NOTE: `protect` is already applied via `router.use(protect)` above

module.exports = router;