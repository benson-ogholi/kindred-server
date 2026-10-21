const express = require("express");
const router = express.Router();
const {
  createRide,
  getAllRides,
  getRideById,
  getMyRides,
  deleteRide,
} = require("../../controllers/padiman_route_controllers/pr.ride.offer.controller");
const { protect } = require("../../middlewares/pr/pr.authMiddleware");

router.use(protect); // Ensure all routes here are protected

router.route("/").post(createRide).get(getAllRides);

router.get("/my-rides", protect, getMyRides); // Specific route for driver history
router.get("/:id", protect, getRideById); // Dynamic route
router.delete("/:id", protect, deleteRide);

module.exports = router;
