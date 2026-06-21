const mongoose = require("mongoose");
const ParcelRequest = require("../../models/padiman_route_models/Parcel_Request"); // Use consistent name
const Negotiation = require("../../models/padiman_route_models/Negotiation");
const Parcel = require("../../models/padiman_route_models/Parcel");

/**
 * Helper to validate MongoDB ID
 */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// CREATE REQUEST
exports.createRequest = async (req, res) => {
  console.log("🚀 [CREATE REQUEST] Endpoint hit");

  try {
    const {
      pickupAddress,
      destinationCity,
      priceRange,
      dispatchDateStart,
      dispatchDateEnd,
      availabilityWindow,
      properties,
      notes,
    } = req.body;

    console.log("📥 Received Request Body:", {
      pickupAddress,
      destinationCity,
      priceRange,
      dispatchDateStart,
      dispatchDateEnd,
      availabilityWindow,
      properties,
      user: req.user, // ← Now correctly logged
      fullBody: req.body,
      notes,
    });

    // Validation
    if (!pickupAddress?.trim() || !destinationCity?.trim()) {
      console.log(
        "❌ Validation failed: Missing pickupAddress or destinationCity"
      );
      return res.status(400).json({
        success: false,
        message: "Missing required fields: pickupAddress and destinationCity",
      });
    }

    if (!req.user) {
      console.log("❌ No user attached to request (auth middleware failed)");
      return res.status(401).json({
        success: false,
        message: "Not authorized - user not found",
      });
    }

    console.log("✅ Validation passed. Creating new Parcel Request...");

    const newRequest = await ParcelRequest.create({
      ...req.body,
      user: req.user, // ← FIXED: Use req.user directly
    });

    console.log("✅ Parcel Request created successfully!");
    console.log("📦 New Request ID:", newRequest._id);

    res.status(201).json({ success: true, data: newRequest });
  } catch (error) {
    console.error("💥 [CREATE REQUEST ERROR] Failed to create parcel request");
    console.error("Error Message:", error.message);
    console.error("Error Stack:", error.stack);
    console.error("Full Error Object:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create request",
      error: error.message,
    });
  } finally {
    console.log("🏁 [CREATE REQUEST] Request processing completed");
  }
};

// GET ALL
exports.getAllRequests = async (req, res) => {
  try {
    // Extract the strict string ID from req.user safely
    const userId = req.user._id || req.user.id || req.user;

    console.log(
      `🔍 [PARCEL CONTROLLER] Querying database records for User ID: ${userId}`
    );

    const requests = await ParcelRequest.find({ user: userId }).sort({
      createdAt: -1,
    });

    console.log(
      `✅ Found ${requests.length} matching personal requests for this operator.`
    );

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error("💥 Error fetching all requests:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Server error retrieving requests" });
  }
};

exports.getAllGlobalRequests = async (req, res) => {
  try {
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

    // Create fast lookup map: parcelId → negotiation
    const negotiationMap = new Map();
    relevantNegotiations.forEach((neg) => {
      if (neg.service) {
        negotiationMap.set(neg.service.toString(), neg);
      }
    });

    // 2. Fetch all ParcelRequests EXCLUDING the ones created by the logged-in user
    let requests = await ParcelRequest.find({
      user: { $ne: userId },
    })
      .sort({ createdAt: -1 })
      .populate("user", "fullName phone email isVerified profileImage")
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

    // 3. Enrich each request + apply name masking
    requests = requests.map((request) => {
      const requestObj = request.toObject ? request.toObject() : { ...request };

      const matchingNegotiation = negotiationMap.get(request._id.toString());
      requestObj.isNegotiator = !!matchingNegotiation;

      if (matchingNegotiation) {
        requestObj.myNegotiation = matchingNegotiation;
      }

      // --- NAME MASKING LOGIC ---
      // For the parcel request creator's fullName
      if (requestObj.user && requestObj.user.fullName) {
        const isPaid = matchingNegotiation?.isPaid === true;
        if (isPaid) {
          // Return full name if paid
          requestObj.user.fullName = requestObj.user.fullName;
        } else {
          // First 4 characters + ******
          const name = requestObj.user.fullName.trim();
          const masked =
            name.length > 4 ? name.substring(0, 4) + "******" : name + "******";
          requestObj.user.fullName = masked;
        }
      }

      // Optional: You can also mask names in negotiations if needed
      if (requestObj.negotiations && Array.isArray(requestObj.negotiations)) {
        requestObj.negotiations.forEach((neg) => {
          // Mask negotiator name unless paid
          if (neg.negotiator && neg.negotiator.fullName) {
            const isPaid = neg.isPaid === true;
            if (!isPaid) {
              const name = neg.negotiator.fullName.trim();
              neg.negotiator.fullName =
                name.length > 4
                  ? name.substring(0, 4) + "******"
                  : name + "******";
            }
          }
          // Same for serviceProvider if you want
        });
      }
      // -------------------------------

      // --- CRITICAL RULE INJECTION ---
      const hasActiveOrClosedRide = requestObj.negotiations?.some(
        (neg) => neg.status && neg.status !== "ride pending"
      );
      requestObj.isDisabled = !!hasActiveOrClosedRide;
      // -------------------------------

      return requestObj;
    });

    // 4. Sort: User's negotiations first, then others
    requests.sort((a, b) => {
      if (b.isNegotiator !== a.isNegotiator) {
        return b.isNegotiator ? 1 : -1;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error("Error retrieving global requests:", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving global requests",
    });
  }
};

exports.deleteAllNegotiations = async (req, res) => {
  console.log(`🗑️ [DELETE ALL NEGOTIATIONS] Started for ID: ${req.params.id}`);

  try {
    const { id } = req.params; // This is the ParcelRequest or RideOffer ID

    if (!isValidId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid ID format" });
    }

    // 1. Find the parent request to know its serviceType and current negotiations
    const request = await ParcelRequest.findById(id).select(
      "negotiations serviceType"
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    const negotiationIds = request.negotiations || [];

    if (negotiationIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No negotiations to delete",
      });
    }

    console.log(`🗑️ Found ${negotiationIds.length} negotiations to delete.`);

    // 2. Delete all Negotiation documents
    await Negotiation.deleteMany({ _id: { $in: negotiationIds } });

    // 3. Clear the negotiations array in the parent document
    await ParcelRequest.findByIdAndUpdate(id, {
      $set: { negotiations: [] },
    });

    // Optional: If you also support RideOffer, add this:
    // await RideOffer.findByIdAndUpdate(id, { $set: { negotiations: [] } });

    console.log(
      `✅ Successfully deleted all ${negotiationIds.length} negotiations`
    );

    res.status(200).json({
      success: true,
      message: `All ${negotiationIds.length} negotiations deleted successfully`,
      deletedCount: negotiationIds.length,
    });
  } catch (error) {
    console.error("💥 [DELETE ALL NEGOTIATIONS ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting negotiations",
    });
  }
};

// GET ONE
// GET ONE
exports.getRequestById = async (req, res) => {
  console.log(
    `🔍 [GET REQUEST BY ID START] Fetching details for ID: ${req.params.id}`
  );

  try {
    if (!isValidId(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid ID format" });
    }

    const { negotiatorService } = req.query;
    const serviceType = req.query.serviceType || "deliver_a_parcel";

    let request;
    let isParcelSchema = false;

    // ==================== DECIDE SCHEMA ====================
    if (negotiatorService && serviceType === "deliver_a_parcel") {
      console.log("🔄 [FETCHING FROM PARCEL SCHEMA]");
      request = await Parcel.findById(req.params.id)
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

      isParcelSchema = true;
    } else {
      console.log("🔄 [FETCHING FROM PARCELREQUEST SCHEMA]");
      request = await ParcelRequest.findById(req.params.id)
        .populate("user", "fullName phone email isVerified profileImage")
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
                "pickupAddress destinationCity dispatchDateStart dispatchDateEnd status priceRange",
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
        message: "Request not found",
      });
    }

    // Convert to plain object first
    let dataObj = request.toObject();

    // ====================== ENRICH NEGOTIATIONS WITH negotiatorServiceData ======================
    if (dataObj.negotiations && dataObj.negotiations.length > 0) {
      console.log(
        `🔄 Enriching ${dataObj.negotiations.length} negotiations with negotiatorServiceData...`
      );

      for (let neg of dataObj.negotiations) {
        if (neg.negotiatorService && isValidId(neg.negotiatorService)) {
          try {
            const serviceData = await Parcel.findById(neg.negotiatorService)
              .select("item parties route schedule notes properties status")
              .lean();

            console.warn(serviceData, "serviceDataserviceData");
            if (serviceData) {
              neg.negotiatorServiceData = serviceData;
              console.log(
                `✅ Attached negotiatorServiceData for negotiation ${neg._id}`
              );
            } else {
              neg.negotiatorServiceData = null;
              console.log(
                `⚠️ negotiatorService not found: ${neg.negotiatorService}`
              );
            }
          } catch (err) {
            console.error(
              `❌ Error fetching negotiatorServiceData:`,
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
    const ownerId = isParcelSchema
      ? request.requestedBy?._id?.toString() || request.requestedBy?.toString()
      : request.user?._id?.toString() || request.user?.toString();

    const isOwner = currentUserId && ownerId && currentUserId === ownerId;

    // Check if current user has negotiation
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

    // Cleanup (Owner only)
    if (isOwner && dataObj.negotiations?.length > 0) {
      const rawNegotiationIds = request._doc.negotiations || [];
      const deadNegotiationIds = [];

      rawNegotiationIds.forEach((id, index) => {
        if (!request.negotiations?.[index]) {
          deadNegotiationIds.push(id);
        }
      });

      if (deadNegotiationIds.length > 0) {
        const model = isParcelSchema ? Parcel : ParcelRequest;
        await model.findByIdAndUpdate(req.params.id, {
          $pull: { negotiations: { $in: deadNegotiationIds } },
        });
      }
    }

    // Filter negotiations for non-owners
    let negotiationsToReturn = [];
    const negotiators = [];

    if (isOwner) {
      negotiationsToReturn = dataObj.negotiations || [];
    } else if (hasNegotiation && userNegotiation) {
      negotiationsToReturn = [userNegotiation];
    }

    // Build negotiators list for owner
    if (isOwner && negotiationsToReturn.length > 0) {
      const negotiatorMap = new Map();
      negotiationsToReturn.forEach((neg) => {
        const negotiator = neg.negotiator;
        if (negotiator?._id) {
          const idStr = negotiator._id.toString();
          if (!negotiatorMap.has(idStr)) {
            negotiatorMap.set(idStr, {
              _id: negotiator._id,
              fullName: negotiator.fullName,
              email: negotiator.email,
              phone: negotiator.phone,
              profileImage: negotiator.profileImage,
            });
          }
        }
      });
      negotiators.push(...negotiatorMap.values());
    }

    console.log(
      `✅ [SUCCESS] negotiatorServiceData attached to ${negotiationsToReturn.length} negotiations`
    );

    // Final Response
    res.status(200).json({
      success: true,
      data: {
        ...dataObj,
        negotiations: negotiationsToReturn,
        negotiators,
        isOwner: isOwner,
        isCustomer: !isOwner,
        isInTalk: hasNegotiation,
        isParcelSchema: isParcelSchema,
      },
    });
  } catch (error) {
    console.error("💥 [GET REQUEST BY ID ERROR]:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
// UPDATE
exports.updateRequest = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid ID format" });
    }

    const updated = await ParcelRequest.findOneAndUpdate(
      { _id: req.params.id, user: req.user },
      req.body,
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: "Request not found" });
    }

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating request:", error.message);
    res.status(400).json({
      success: false,
      message: "Validation error",
      error: error.message,
    });
  }
};

// DELETE
exports.deleteRequest = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid ID format" });
    }

    const deleted = await ParcelRequest.findOneAndDelete({
      _id: req.params.id,
      user: req.user,
    });

    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Request not found" });
    }

    res
      .status(200)
      .json({ success: true, message: "Request deleted successfully" });
  } catch (error) {
    console.error("Error deleting request:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
