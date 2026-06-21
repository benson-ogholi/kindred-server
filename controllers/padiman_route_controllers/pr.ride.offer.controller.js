const mongoose = require("mongoose");
const RideOffer = require("../../models/padiman_route_models/RideOffer");
const Negotiation = require("../../models/padiman_route_models/Negotiation");
const JoinRide = require("../../models/padiman_route_models/JoinRide");

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

    const userId = req.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // 1. Find all negotiations where this user is the negotiator
    const relevantNegotiations = await Negotiation.find({
      negotiator: userId,
    }).select("service status agreedAmount isConfirmed isPaid");

    // Create fast lookup map: rideId (service) → negotiation
    const negotiationMap = new Map();
    relevantNegotiations.forEach((neg) => {
      if (neg.service) {
        negotiationMap.set(neg.service.toString(), neg);
      }
    });

    // 2. Fetch all active RideOffers EXCLUDING the ones created by the logged-in user
    let rides = await RideOffer.find({
      status: "active",
      //driver: { $ne: userId }, // <-- EXCLUDE OWN CREATED RIDE OFFERS HERE
    })
      .sort({ createdAt: -1 })
      .populate("driver", "fullName phone email isVerified profileImage")
      .populate({
        path: "negotiations",
        populate: [
          {
            path: "negotiator",
            select: "fullName phone email isVerified profileImage",
          },
          {
            path: "serviceProvider",
            select: "fullName phone email isVerified profileImage",
          },
        ],
      });

    // 3. Enrich each ride + apply name masking
    rides = rides.map((ride) => {
      const rideObj = ride.toObject ? ride.toObject() : { ...ride };

      const matchingNegotiation = negotiationMap.get(ride._id.toString());
      rideObj.isNegotiator = !!matchingNegotiation;

      if (matchingNegotiation) {
        rideObj.myNegotiation = matchingNegotiation;
      }

      // --- NAME MASKING LOGIC ---
      // For the ride driver's fullName (the creator of the ride offer)
      if (rideObj.driver && rideObj.driver.fullName) {
        const isPaid = matchingNegotiation?.isPaid === true;

        if (isPaid) {
          // Show full name if paid
          rideObj.driver.fullName = rideObj.driver.fullName;
        } else {
          // Mask: First 4 characters + ******
          const name = rideObj.driver.fullName.trim();
          const masked =
            name.length > 4 ? name.substring(0, 4) + "******" : name + "******";
          rideObj.driver.fullName = masked;
        }
      }

      // Optional: Mask names inside negotiations array for consistency
      if (rideObj.negotiations && Array.isArray(rideObj.negotiations)) {
        rideObj.negotiations.forEach((neg) => {
          if (neg.negotiator && neg.negotiator.fullName) {
            if (neg.isPaid !== true) {
              const name = neg.negotiator.fullName.trim();
              neg.negotiator.fullName =
                name.length > 4
                  ? name.substring(0, 4) + "******"
                  : name + "******";
            }
          }
        });
      }
      // -------------------------------

      // --- CRITICAL RULE INJECTION ---
      const hasActiveOrClosedRide = rideObj.negotiations?.some(
        (neg) => neg.status && neg.status !== "ride pending"
      );
      rideObj.isDisabled = !!hasActiveOrClosedRide;
      // -------------------------------

      return rideObj;
    });

    // 4. Sort: User's negotiations first, then others
    rides.sort((a, b) => {
      if (b.isNegotiator !== a.isNegotiator) {
        return b.isNegotiator ? 1 : -1;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    console.log(
      `[RIDE CONTROLLER] Found and processed ${rides.length} active pipelines (excluding own).`
    );
    console.log("User ID:", userId);
    console.log(
      "Negotiations found for user in rides:",
      relevantNegotiations.length
    );

    res.status(200).json({
      success: true,
      count: rides.length,
      data: rides,
    });
  } catch (error) {
    console.error("[RIDE CONTROLLER ERROR] Fetch All Failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Error retrieving transit pipelines.",
    });
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

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

exports.getRideById = async (req, res) => {
  console.log(
    `🔍 [GET RIDE OFFER BY ID START] Fetching details for ID: ${req.params.id}`
  );

  try {
    if (!isValidId(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid ID format" });
    }

    const serviceType = req.query.serviceType || "offer_a_ride";

    let request;
    let isRideOfferSchema = true;

    // ==================== DECIDE SCHEMA ====================
    if (serviceType === "join_a_ride" || serviceType === "deliver_a_parcel") {
      console.log("🔄 [FETCHING FROM JOINRIDE SCHEMA]");
      request = await JoinRide.findById(req.params.id)
        .populate("requestedBy", "fullName phone email isVerified profileImage")
        .populate({
          path: "negotiations",
          populate: [
            { path: "negotiator", select: "fullName email phone profileImage" },
            {
              path: "serviceProvider",
              select: "fullName email phone profileImage",
            },
          ],
          select: `
            negotiator serviceProvider service serviceType
            negotiatorService status isConfirmed isPaid
            agreedAmount createdAt updatedAt
          `,
        });

      isRideOfferSchema = false;
    } else {
      console.log("🔄 [FETCHING FROM RIDEOFFER SCHEMA]");
      request = await RideOffer.findById(req.params.id)
        .populate("driver", "fullName phone email isVerified profileImage")
        .populate({
          path: "negotiations",
          populate: [
            { path: "negotiator", select: "fullName email phone profileImage" },
            {
              path: "serviceProvider",
              select: "fullName email phone profileImage",
            },
            {
              path: "service",
              select:
                "pickupPoint dropoffPoint departureTime availableSeats estimatedFare status",
            },
          ],
          select: `
            negotiator serviceProvider service serviceType
            negotiatorService status isConfirmed isPaid
            agreedAmount createdAt updatedAt
          `,
        });
    }

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Ride instance not found",
      });
    }

    // Convert to plain Javascript object to allow runtime manipulation
    let dataObj = request.toObject();

    // ====================== ENRICH NEGOTIATIONS WITH WHOLE JOINRIDE DOCUMENT ======================
    if (dataObj.negotiations && dataObj.negotiations.length > 0) {
      console.log(
        `🔄 Enriching ${dataObj.negotiations.length} negotiations with full negotiatorServiceData...`
      );

      for (let neg of dataObj.negotiations) {
        if (neg.negotiatorService && isValidId(neg.negotiatorService)) {
          try {
            // ✅ Fetching the entire JoinRide document without structural omissions
            const serviceData = await JoinRide.findById(
              neg.negotiatorService
            ).lean();

            if (serviceData) {
              neg.negotiatorServiceData = serviceData;
              console.log(
                `✅ Successfully attached whole JoinRide document to negotiatorServiceData for neg ${neg._id}`
              );
            } else {
              neg.negotiatorServiceData = null;
              console.log(
                `⚠️ negotiatorService matching ID ${neg.negotiatorService} was not found`
              );
            }
          } catch (err) {
            console.error(
              `❌ Error resolving negotiatorServiceData context matching JoinRide:`,
              err.message
            );
            neg.negotiatorServiceData = null;
          }
        } else {
          neg.negotiatorServiceData = null;
        }
      }
    }

    const currentUserId = req.user?._id?.toString() || req.user?.toString();
    const ownerId = isRideOfferSchema
      ? request.driver?._id?.toString() || request.driver?.toString()
      : request.requestedBy?._id?.toString() || request.requestedBy?.toString();

    const isOwner = currentUserId && ownerId && currentUserId === ownerId;

    // Check if current user has active negotiation paths open
    let hasNegotiation = false;
    let userNegotiation = null;

    if (dataObj.negotiations && dataObj.negotiations.length > 0) {
      userNegotiation = dataObj.negotiations.find((neg) => {
        const negotiatorId =
          neg.negotiator?._id?.toString() || neg.negotiator?.toString();
        return negotiatorId === currentUserId;
      });
      hasNegotiation = !!userNegotiation;
    }

    // Cleanup Dead Collections (Owner only)
    if (isOwner && dataObj.negotiations?.length > 0) {
      const rawNegotiationIds = request._doc.negotiations || [];
      const deadNegotiationIds = [];

      rawNegotiationIds.forEach((id, index) => {
        if (!request.negotiations?.[index]) {
          deadNegotiationIds.push(id);
        }
      });

      if (deadNegotiationIds.length > 0) {
        const model = isRideOfferSchema ? RideOffer : JoinRide;
        await model.findByIdAndUpdate(req.params.id, {
          $pull: { negotiations: { $in: deadNegotiationIds } },
        });
      }
    }

    // Enforce Channel Privacy Filter
    let negotiationsToReturn = [];
    const negotiators = [];

    if (isOwner) {
      // Step B: DUPLICATE CHANNEL CHECK - Isolating conversational pairings
      if (dataObj.negotiations && dataObj.negotiations.length > 0) {
        const seen = new Set();
        dataObj.negotiations = dataObj.negotiations.filter((neg) => {
          const key = `${neg.negotiator?._id || neg.negotiator}-${
            neg.serviceProvider?._id || neg.serviceProvider
          }`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      negotiationsToReturn = dataObj.negotiations || [];
    } else if (hasNegotiation && userNegotiation) {
      negotiationsToReturn = [userNegotiation];
    }

    // Build negotiators profile maps for dashboard view
    if (isOwner && negotiationsToReturn.length > 0) {
      const negotiatorMap = new Map();
      negotiationsToReturn.forEach((neg) => {
        const negotiator = neg.negotiator;
        if (negotiator?._id) {
          const idStr = negotiator._id.toString();
          if (!negotiatorMap.has(idStr)) {
            negotiatorMap.set(idStr, {
              _id: negotiator._id,
              fullName: negotiator.fullName || "User",
              email: negotiator.email,
              phone: negotiator.phone || "",
              profileImage: negotiator.profileImage,
            });
          }
        }
      });
      negotiators.push(...negotiatorMap.values());
    }

    // Final Response Structure
    res.status(200).json({
      success: true,
      data: {
        ...dataObj,
        negotiations: negotiationsToReturn,
        negotiators,
        isOwner: isOwner,
        isCustomer: !isOwner,
        isInTalk: hasNegotiation,
        isRideOfferSchema: isRideOfferSchema,
      },
    });
  } catch (error) {
    console.error("💥 [GET RIDE OFFER BY ID ERROR]:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
