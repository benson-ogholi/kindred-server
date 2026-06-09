const mongoose = require("mongoose");
const RideOffer = require("../../models/padiman_route_models/RideOffer");

// CREATE: Initiate a new ride manifest
exports.createRide = async (req, res) => {
  console.log("🚀 [RIDE CONTROLLER] createRide endpoint hit");

  try {
    console.log("[RIDE CONTROLLER] Received Create Request:", {
      body: req.body,
      user: req.user,
      headers: req.headers.authorization ? "Bearer token present" : "No token",
    });

    const {
      pickupPoint,
      dropoffPoint,
      departureTime,
      availableSeats,
      estimatedFare,
      status,
      notes, 
    } = req.body;

    // === AUTH CHECK ===
    if (!req.user) {
      console.error(
        "❌ [RIDE CONTROLLER] No user found in request (Auth middleware failed)"
      );
      return res.status(401).json({
        success: false,
        message: "Not authorized. Please log in again.",
      });
    }

    // === VALIDATION ===
    if (
      !pickupPoint?.trim() ||
      !dropoffPoint?.trim() ||
      !departureTime?.trim() ||
      !availableSeats ||
      !estimatedFare
    ) {
      console.warn(
        "[RIDE CONTROLLER] Validation Failed: Missing required fields"
      );
      return res.status(400).json({
        success: false,
        message:
          "All fields are required (pickup, dropoff, time, seats, fare).",
      });
    }

    if (pickupPoint.trim() === dropoffPoint.trim()) {
      console.warn(
        "[RIDE CONTROLLER] Validation Failed: Same pickup and dropoff"
      );
      return res.status(400).json({
        success: false,
        message: "Pickup and Dropoff cannot be the same location.",
      });
    }

    console.log("✅ [RIDE CONTROLLER] Validation passed. Creating ride...");

    // === CREATE RIDE ===
    const newRide = await RideOffer.create({
      driver: req.user, // ← FIXED: Use req.user directly (not req.user.id)
      pickupPoint: pickupPoint.trim(),
      dropoffPoint: dropoffPoint.trim(),
      departureTime: departureTime.trim(),
      availableSeats: Number(availableSeats),
      estimatedFare: Number(estimatedFare),
      status: status || "active",
      notes: notes?.trim() || "", // 📝 FIXED: Saves driver's handling notes safely to the document block
    });

    console.log("🎉 [RIDE CONTROLLER] Ride created successfully!");
    console.log("📦 New Ride ID:", newRide._id);

    res.status(201).json({
      success: true,
      message: "Ride offer posted successfully",
      data: newRide,
    });
  } catch (error) {
    console.error("💥 [RIDE CONTROLLER ERROR] Create Failed");
    console.error("Error Message:", error.message);
    console.error("Error Stack:", error.stack);

    // Handle Mongoose validation errors specifically
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error: " + error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error while creating ride offer.",
    });
  } finally {
    console.log("🏁 [RIDE CONTROLLER] createRide request completed");
  }
};

// DELETE: Terminate a specific manifest
exports.deleteRide = async (req, res) => {
  try {
    console.log(`[RIDE CONTROLLER] Terminating manifest ID: ${req.params.id}`);

    const deletedRide = await RideOffer.findOneAndDelete({
      _id: req.params.id,
      driver: req.user.id,
    });

    if (!deletedRide) {
      console.warn(
        "[RIDE CONTROLLER] Deletion failed: Manifest not found or unauthorized"
      );
      return res
        .status(404)
        .json({ success: false, message: "Manifest record not found." });
    }

    console.log("[RIDE CONTROLLER] Manifest terminated successfully.");
    res
      .status(200)
      .json({ success: true, message: "Ride offer removed from pipeline." });
  } catch (error) {
    console.error("[RIDE CONTROLLER ERROR] Delete Failed:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to terminate pipeline." });
  }
};

// GET ALL: Retrieve active rides for all users with driver details
exports.getAllRides = async (req, res) => {
  try {
    console.log("[RIDE CONTROLLER] Fetching all active transit pipelines...");

    // Populate driver details and exclude the password field
    const rides = await RideOffer.find({ status: "active" })
      .populate("driver", "fullName phone email isVerified profileImage")
      .sort({ createdAt: -1 });

    console.log(`[RIDE CONTROLLER] Found ${rides.length} active pipelines.`);

    res.status(200).json({ success: true, count: rides.length, data: rides });
  } catch (error) {
    console.error("[RIDE CONTROLLER ERROR] Fetch All Failed:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Error retrieving transit pipelines." });
  }
};

// GET ONE: Retrieve a specific ride offer with driver details and sanitized negotiation matrices
exports.getRideById = async (req, res) => {
  console.log(
    `🔍 [GET RIDE BY ID START] Fetching details for manifest: ${req.params.id}`
  );

  try {
    // 1. Structural Format Check using Native Mongoose Validator
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      console.log(
        `⚠️ [VALIDATION FAILURE] Provided ID "${req.params.id}" fails structural format checks.`
      );
      return res
        .status(400)
        .json({ success: false, message: "Invalid ID format" });
    }

    console.log(
      "📝 [DB QUERY] Running findById and resolving relationship reference paths..."
    );
    // Populate driver identity and negotiation child collections
    let ride = await RideOffer.findById(req.params.id)
      .populate("driver", "fullName phone email isVerified profileImage")
      .populate({
        path: "negotiations",
        populate: [
          { path: "negotiator", select: "fullName email phone profileImage" },
          {
            path: "serviceProvider",
            select: "fullName email phone profileImage",
          },
        ],
      });

    if (!ride) {
      console.log(
        `❌ [NOT FOUND] Manifest ${req.params.id} could not be matched inside the collection.`
      );
      return res
        .status(404)
        .json({ success: false, message: "Manifest not found." });
    }

    // Data Evaluation Logs
    console.log("📊 [DATA INSIGHT] Document evaluation details:");
    console.log(
      `    • Driver Profile: ${
        ride.driver ? ride.driver.fullName : "Missing driver object reference."
      }`
    );

    if (ride.negotiations && ride.negotiations.length > 0) {
      // Step A: HARD PURGE - Identify and eliminate orphaned/deleted negotiations
      const rawNegotiationIds = ride._doc.negotiations || [];
      const deadNegotiationIds = [];

      rawNegotiationIds.forEach((id, index) => {
        // If the populated counterpart is null or missing, it doesn't exist in the database schema anymore
        if (!ride.negotiations[index]) {
          deadNegotiationIds.push(id);
        }
      });

      if (deadNegotiationIds.length > 0) {
        console.log(
          `🧹 [RIDE SCHEMA PURGE] Found ${deadNegotiationIds.length} dead negotiation references. Removing from Ride Offer...`
        );

        // Wipe them out of the array inside the database permanently
        await RideOffer.findByIdAndUpdate(req.params.id, {
          $pull: { negotiations: { $in: deadNegotiationIds } },
        });

        // Filter out the null values from our local response array instantly
        ride.negotiations = ride.negotiations.filter((neg) => neg !== null);
      }

      // Step B: DUPLICATE CHANNEL CHECK - Enforce absolute unique conversational pairings
      const seen = new Set();
      ride.negotiations = ride.negotiations.filter((neg) => {
        const key = `${neg.negotiator?._id}-${neg.serviceProvider?._id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      console.log(
        `🤝 [NEGOTIATIONS CLEANED] ${ride.negotiations.length} active valid negotiation channels remain.`
      );
    } else {
      console.log(
        "🤝 [NEGOTIATIONS EMPTY] No active rider biddings or chats attached to this manifest yet."
      );
    }

    console.log(
      "✅ [GET RIDE BY ID SUCCESS] Document payload built. Emitting code 200."
    );
    res.status(200).json({ success: true, data: ride });
  } catch (error) {
    console.error("💥 [GET RIDE BY ID CRITICAL ERROR]:", error.message);
    console.error(error); // Stack trace logging
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// GET MY RIDES: Retrieve all manifests created by the logged-in driver
exports.getMyRides = async (req, res) => {
  try {
    console.log(
      `[RIDE CONTROLLER] Fetching pipeline history for driver: ${req.user.id}`
    );

    const myRides = await RideOffer.find({ driver: req.user.id })
      .populate("driver", "fullName phone email isVerified profileImage")
      .sort({ createdAt: -1 });

    // Console log driver details for history
    myRides.forEach((ride, index) => {
      if (ride.driver) {
        console.log(
          `➔ [My Ride #${index + 1}] ID: ${ride._id} | Driver ID: ${
            ride.driver._id
          }`
        );
        console.log(`   Details:`, JSON.stringify(ride.driver, null, 2));
      }
    });

    res
      .status(200)
      .json({ success: true, count: myRides.length, data: myRides });
  } catch (error) {
    console.error("[RIDE CONTROLLER ERROR] My Rides Failed:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to retrieve your manifests." });
  }
};
