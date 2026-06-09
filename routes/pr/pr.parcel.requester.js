const express = require("express");
const router = express.Router();
const {
  createRequest,
  getAllRequests,
  getRequestById,
  updateRequest,
  deleteRequest,
  getAllGlobalRequests
} = require("../../controllers/padiman_route_controllers/pr.parcel.requester.controller");
const { protect } = require("../../middlewares/pr/pr.authMiddleware");

router.use(protect); // Protect all routes

router.route("/").post(createRequest).get(getAllRequests);

router
  .route("/:id")
  .get(getRequestById)
  .put(updateRequest)
  .delete(deleteRequest);

router.get("/getAllRequests/all", getAllGlobalRequests); // Static route first
module.exports = router;
