const express = require("express");
const router = express.Router();

// Import your authentication middleware
const { protect } = require("../../middlewares/pr/pr.authMiddleware");

// Import the parcel controllers
const {
  createParcelBooking,
  getUserParcels,
  getParcelById,
  updateParcel,
  deleteParcel,
  createJoinRide,
} = require("../../controllers/padiman_route_controllers/pr.parcel.controller");
const {
  getAllGlobalRequests,
} = require("../../controllers/padiman_route_controllers/pr.parcel.requester.controller");

// Global Protection: All parcel operations below require a valid login token
router.use(protect);

router.route("/").post(createParcelBooking).get(getUserParcels);

router.post("/create/join-ride", protect, createJoinRide);
router.route("/:id").get(getParcelById).put(updateParcel).delete(deleteParcel);

router.get("/all", getAllGlobalRequests);

module.exports = router;
