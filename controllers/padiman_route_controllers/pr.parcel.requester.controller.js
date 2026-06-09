const mongoose = require("mongoose");
const ParcelRequest = require("../../models/padiman_route_models/Parcel_Request"); // Use consistent name

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
    const requests = await ParcelRequest.find({})
      .sort({ createdAt: -1 })
      .populate("user", "fullName phone email isVerified profileImage");

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error retrieving global requests",
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
    let request = await ParcelRequest.findById(req.params.id)
      .populate("user", "fullName phone email isVerified profileImage")
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

    if (!request) {
      console.log(
        `❌ [NOT FOUND] Request ${req.params.id} could not be matched inside the collection.`
      );
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Comprehensive logs capturing structural negotiation fields
    console.log("📊 [DATA INSIGHT] Document evaluation details:");
    console.log(
      `    • Creator Profile: ${
        request.user ? request.user.fullName : "Anonymous User"
      }`
    );

    if (request.negotiations && request.negotiations.length > 0) {
      // 1. HARD PURGE: Identify and eliminate orphaned/deleted negotiations
      // Mongoose populates non-existent references as null.
      // We grab the raw array of ObjectIDs from the unpopulated document state to find the exact broken IDs.
      const rawNegotiationIds = request._doc.negotiations || [];
      const deadNegotiationIds = [];

      rawNegotiationIds.forEach((id, index) => {
        // If the populated counterpart is null or missing, it doesn't exist in the Negotiation schema
        if (!request.negotiations[index]) {
          deadNegotiationIds.push(id);
        }
      });

      if (deadNegotiationIds.length > 0) {
        console.log(
          `🧹 [PARCEL SCHEMA PURGE] Found ${deadNegotiationIds.length} dead negotiation references. Removing from Parcel Request...`
        );

        // Wipe them out of the database array permanently
        await ParcelRequest.findByIdAndUpdate(req.params.id, {
          $pull: { negotiations: { $in: deadNegotiationIds } },
        });

        // Filter out the null values from our local runtime array instantly
        request.negotiations = request.negotiations.filter(
          (neg) => neg !== null
        );
      }

      // 2. SELF-NEGOTIATION CLEANUP: Remove any tracks where users negotiate with themselves
      // const invalidNegotiationIds = request.negotiations
      //   .filter((neg) => {
      //     const negotiatorId = neg.negotiator?._id?.toString();
      //     const providerId = neg.serviceProvider?._id?.toString();
      //     return negotiatorId && providerId && negotiatorId === providerId;
      //   })
      //   .map((neg) => neg._id);

      // if (invalidNegotiationIds.length > 0) {
      //   console.log(
      //     `🚨 [FORCE DELETE] Found ${invalidNegotiationIds.length} self-negotiation entries. Purging from database...`
      //   );

      //   // Remove documents completely from the negotiations collection
      //   await mongoose
      //     .model("Negotiation")
      //     .deleteMany({ _id: { $in: invalidNegotiationIds } });

      //   // Pull them out of the parcel request schema array references
      //   await ParcelRequest.findByIdAndUpdate(req.params.id, {
      //     $pull: { negotiations: { $in: invalidNegotiationIds } },
      //   });

      //   // Instantly filter out from local array response
      //   request.negotiations = request.negotiations.filter(
      //     (neg) => !invalidNegotiationIds.includes(neg._id)
      //   );
      // }

      // 3. DUPLICATE CHANNEL CHECK: Enforce absolute unique conversational pairings
      const seen = new Set();
      request.negotiations = request.negotiations.filter((neg) => {
        const key = `${neg.negotiator?._id}-${neg.serviceProvider?._id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      console.log(
        `🤝 [NEGOTIATIONS CLEANED] ${request.negotiations.length} active valid negotiation channels remain.`
      );
    } else {
      console.log(
        "🤝 [NEGOTIATIONS EMPTY] No active driver biddings or chats attached to this request yet."
      );
    }

    console.log(
      "✅ [GET REQUEST BY ID SUCCESS] Document payload built. Emitting code 200."
    );
    res.status(200).json({ success: true, data: request });
  } catch (error) {
    console.error("💥 [GET REQUEST BY ID CRITICAL ERROR]:", error.message);
    console.error(error); // Stack trace logging
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
