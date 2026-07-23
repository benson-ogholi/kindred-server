const Request = require("../../models/padiman_route_models/Request");
const { sendNotification } = require("../../utils/pr/pr_push");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");

// Import upload utility if available (fallback safe check included)

/**
 * ============================================================
 *  META BUILDERS — one per request `type`
 * ============================================================
 */

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

// ---- send-package -------------------------------------------------
function buildSendPackageMeta(body) {
  const errors = [];
  const {
    isPerishable,
    isFragile,
    senderFullName,
    senderPhone,
    receiverFullName,
    receiverPhone,
    note,
  } = body.meta || body;

  if (!senderFullName) errors.push("senderFullName is required");
  if (!senderPhone) errors.push("senderPhone is required");
  if (!receiverFullName) errors.push("receiverFullName is required");
  if (!receiverPhone) errors.push("receiverPhone is required");

  const meta = {
    isPerishable: toBool(isPerishable, false),
    isFragile: toBool(isFragile, false),
    senderFullName,
    senderPhone,
    receiverFullName,
    receiverPhone,
    note: note || "",
  };

  return { meta, errors };
}

// ---- deliver-package ------------------------------------------------
function buildDeliverPackageMeta(body) {
  const errors = [];
  const src = body.meta || body;
  const {
    pickupLocation,
    deliveryLocation,
    isPerishable,
    isFragile,
    pickupDate,
    pickupTime,
    agreedPrice,
  } = src;

  if (!pickupLocation) errors.push("pickupLocation is required");
  if (!deliveryLocation) errors.push("deliveryLocation is required");
  if (!pickupDate) errors.push("pickupDate is required");
  if (!pickupTime) errors.push("pickupTime is required");

  const meta = {
    pickupLocation,
    deliveryLocation,
    isPerishable: toBool(isPerishable, false),
    isFragile: toBool(isFragile, false),
    pickupDate,
    pickupTime,
    agreedPrice: agreedPrice || 0,
  };

  return { meta, errors };
}

// ---- join-ride --------------------------------------------------------
function buildJoinRideMeta(body) {
  const src = body.meta || body;
  const { notes } = src;

  const meta = {
    notes: notes || "",
  };

  return { meta, errors: [] };
}

// ---- offer-ride (offer a ride) -----------------------------------------
function buildOfferJoinMeta(body) {
  const errors = [];
  const src = body.meta || body;
  const { numberOfPassengers, notes } = src;

  if (numberOfPassengers === undefined || numberOfPassengers === null) {
    errors.push("numberOfPassengers is required");
  }

  const meta = {
    numberOfPassengers: Number(numberOfPassengers) || 1,
    notes: notes || "",
  };

  return { meta, errors };
}

const META_BUILDERS = {
  "send-package": buildSendPackageMeta,
  "deliver-package": buildDeliverPackageMeta,
  "join-ride": buildJoinRideMeta,
  "offer-ride": buildOfferJoinMeta,
};

/**
 * All 4 types share these top-level required fields.
 */
function validateCommonFields(body) {
  const errors = [];
  if (!body.pickupLocation || !body.pickupLocation.address) {
    errors.push("pickupLocation.address is required");
  }
  if (!body.deliveryLocation || !body.deliveryLocation.address) {
    errors.push("deliveryLocation.address is required");
  }
  if (!body.pickupDate) errors.push("pickupDate is required");
  if (!body.pickupTime) errors.push("pickupTime is required");
  return errors;
}

/**
 * ============================================================
 *  NOTIFICATION COPY
 * ============================================================
 */

const CREATED_COPY = {
  "send-package": {
    title: "Package request submitted",
    body: "We're looking for someone to pick up and deliver your package.",
  },
  "deliver-package": {
    title: "Delivery offer submitted",
    body: "Your delivery listing is live — you'll be notified when someone books it.",
  },
  "join-ride": {
    title: "Ride request submitted",
    body: "We're matching you with a driver on your route.",
  },
  "offer-ride": {
    title: "Ride offer submitted",
    body: "Your ride is live — passengers on your route can now request a seat.",
  },
};

const STATUS_COPY = {
  assigned: {
    title: "You've been matched!",
    body: "A provider has been assigned to your request.",
  },
  in_progress: {
    title: "Request in progress",
    body: "Your request is now in progress.",
  },
  completed: {
    title: "Request completed",
    body: "Your request has been marked as completed.",
  },
  cancelled: {
    title: "Request cancelled",
    body: "Your request has been cancelled.",
  },
};

/**
 * ============================================================
 *  CONTROLLERS
 * ============================================================
 */

// 1. Create Request
exports.createRequest = async (req, res) => {
  try {
    const { type } = req.body;

    if (!type || !META_BUILDERS[type]) {
      return res.status(400).json({
        success: false,
        message:
          "A valid type is required: join-ride, offer-ride, send-package, deliver-package",
      });
    }

    const commonErrors = validateCommonFields(req.body);
    const { meta, errors: metaErrors } = META_BUILDERS[type](req.body);
    const allErrors = [...commonErrors, ...metaErrors];

    if (allErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: allErrors,
      });
    }

    const normalizeLocation = (loc) => {
      if (!loc || typeof loc !== "object") {
        return { address: "" };
      }

      const result = { address: loc.address || "" };

      if (
        loc.coordinates &&
        Array.isArray(loc.coordinates.coordinates) &&
        loc.coordinates.coordinates.length === 2
      ) {
        result.coordinates = {
          type: "Point",
          coordinates: [
            Number(loc.coordinates.coordinates[0]),
            Number(loc.coordinates.coordinates[1]),
          ],
        };
      } else if (
        Array.isArray(loc.coordinates) &&
        loc.coordinates.length === 2
      ) {
        result.coordinates = {
          type: "Point",
          coordinates: [Number(loc.coordinates[0]), Number(loc.coordinates[1])],
        };
      }

      return result;
    };

    const requestData = {
      userId: req.user,
      type,
      pickupLocation: normalizeLocation(req.body.pickupLocation),
      deliveryLocation: normalizeLocation(req.body.deliveryLocation),
      pickupDate: req.body.pickupDate,
      pickupTime: req.body.pickupTime,
      agreedPrice: Number(req.body.agreedPrice) || 0,
      meta,
    };

    const request = await Request.create(requestData);

    const copy = CREATED_COPY[type];
    if (copy) {
      sendNotification(request.userId, {
        title: copy.title,
        body: copy.body,
        type: "REQUEST_CREATED",
        router: "/(screens)/order",
        data: { requestId: request._id.toString(), requestType: type },
      }).catch((err) => console.error("⚠️ Notification failed:", err));
    }

    return res.status(201).json({
      success: true,
      message: "Request created successfully",
      data: request,
    });
  } catch (error) {
    console.error("❌ [REQUEST_CONTROLLER] createRequest failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create request",
    });
  }
};

// 2. Get logged-in user's requests
exports.getUserRequests = async (req, res) => {
  try {
    const { status, type } = req.query;
    const filter = { userId: req.user };

    if (status) filter.status = status;
    if (type) filter.type = type;

    const requests = await Request.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error("❌ [REQUEST_CONTROLLER] getUserRequests failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch requests",
    });
  }
};

// 3. Get single request by ID
exports.getRequest = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: request,
    });
  } catch (error) {
    console.error("❌ [REQUEST_CONTROLLER] getRequest failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch request",
    });
  }
};

// 4. Update request (Full Update)
exports.updateRequest = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    if (String(request.userId) !== String(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this request",
      });
    }

    if (req.file && typeof uploadToBackblaze === "function") {
      console.log("📸 Uploading proof image to B2...");
      const uploadedUrl = await uploadToBackblaze(
        req.file.buffer,
        req.file.originalname,
        "handover_proofs"
      );
      req.body.handOverProof = uploadedUrl;
    }

    const previousStatus = request.status;
    const type = req.body.type || request.type;

    if (typeof req.body.meta === "string") {
      try {
        req.body.meta = JSON.parse(req.body.meta);
      } catch (e) {}
    }

    if (req.body.meta || META_BUILDERS[type]) {
      const mergedBody = {
        ...request.toObject(),
        ...req.body,
        meta: { ...request.meta, ...(req.body.meta || {}) },
      };

      const commonErrors = validateCommonFields(mergedBody);
      const { meta, errors: metaErrors } = META_BUILDERS[type](mergedBody);
      const allErrors = [...commonErrors, ...metaErrors];

      if (allErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: allErrors,
        });
      }

      req.body.meta = meta;
    }

    const allowedFields = [
      "pickupLocation",
      "deliveryLocation",
      "pickupDate",
      "pickupTime",
      "agreedPrice",
      "isPaid",
      "status",
      "meta",
      "type",
      "handOverProof",
      "currentLocation",
      "finalPrice",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        if (
          typeof value === "string" &&
          (field === "pickupLocation" || field === "deliveryLocation")
        ) {
          try {
            value = JSON.parse(value);
          } catch (e) {}
        }
        request[field] = value;
      }
    });

    await request.save();

    if (previousStatus !== request.status) {
      const copy = STATUS_COPY[request.status];
      if (copy) {
        sendNotification(request.userId, {
          title: copy.title,
          body: copy.body,
          type: "REQUEST_STATUS_CHANGED",
          router: "/(screens)/order",
          data: {
            requestId: request._id.toString(),
            requestType: request.type,
            status: request.status,
          },
        }).catch((err) => console.error("⚠️ sendNotification failed:", err));
      }
    }

    return res.status(200).json({
      success: true,
      message: "Request updated successfully",
      data: request,
    });
  } catch (error) {
    console.error("❌ [REQUEST_CONTROLLER] updateRequest failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update request",
    });
  }
};

// 5. Update Request Progress (PATCH /api/requests/:id/progress)
// 5. Update Request Progress (PATCH /api/requests/:id/progress)
exports.updateRequestProgress = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, currentLocation } = req.body;
    let handOverProof = req.body.handOverProof;

    const requestItem = await Request.findById(id);

    if (!requestItem) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Handle image upload from file or base64 string
    if (req.file && typeof uploadToBackblaze === "function") {
      handOverProof = await uploadToBackblaze(
        req.file.buffer,
        req.file.originalname,
        "handover_proofs"
      );
    }

    const previousStatus = requestItem.status;

    // Update fields if provided
    if (status) requestItem.status = status;
    if (currentLocation !== undefined) requestItem.currentLocation = currentLocation;
    if (handOverProof !== undefined) requestItem.handOverProof = handOverProof;

    await requestItem.save();

    // === SYNC OTHER LINKED REQUESTS ===
    // Find and update other requests where inRideWith or assignedTo matches 
    // the current request's ID or string representations.
    const queryIdentifiers = [
      id, 
      requestItem._id.toString(),
      requestItem.inRideWith,
      requestItem.assignedTo
    ].filter(Boolean); // Remove null/undefined values

    const updateFields = {};
    if (status) updateFields.status = status;
    if (currentLocation !== undefined) updateFields.currentLocation = currentLocation;
    if (handOverProof !== undefined) updateFields.handOverProof = handOverProof;

    if (Object.keys(updateFields).length > 0) {
      await Request.updateMany(
        {
          _id: { $ne: requestItem._id }, // Exclude the current request
          $or: [
            { inRideWith: { $in: queryIdentifiers } },
            { assignedTo: { $in: queryIdentifiers } }
          ]
        },
        { $set: updateFields }
      );
    }

    // Trigger push notification on status change
    if (status && previousStatus !== requestItem.status) {
      const copy = STATUS_COPY[requestItem.status];
      if (copy) {
        sendNotification(requestItem.userId, {
          title: copy.title,
          body: copy.body,
          type: "REQUEST_STATUS_CHANGED",
          router: "/(screens)/order",
          data: {
            requestId: requestItem._id.toString(),
            requestType: requestItem.type,
            status: requestItem.status,
          },
        }).catch((err) =>
          console.error("⚠️ sendNotification (progress update) failed:", err)
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Request progress and linked requests updated successfully",
      data: requestItem,
    });
  } catch (error) {
    console.error(
      "❌ [REQUEST_CONTROLLER] updateRequestProgress failed:",
      error
    );
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update request progress",
    });
  }
};
// 6. Get matching requests (Pairing)
exports.getMatchingRequests = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(
      `\n🔍 [REQUEST_CONTROLLER] getMatchingRequests called for ID: ${id}`
    );

    const sourceRequest = await Request.findById(id);

    if (!sourceRequest) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    // Corrected target type pairing map
    const targetTypeMap = {
      "send-package": "deliver-package",
      "deliver-package": "send-package",
      "join-ride": "offer-ride",
      "offer-ride": "join-ride",
    };

    const targetType = targetTypeMap[sourceRequest.type];

    if (!targetType) {
      return res.status(400).json({
        success: false,
        message: "Invalid request type for pairing",
      });
    }

    const baseQuery = {
      type: targetType,
      status: "pending",
    };

    const allPotentialMatches = await Request.find(baseQuery).sort({
      createdAt: -1,
    });

    const matchedRequests = allPotentialMatches.filter((reqItem) => {
      const matchesPickup =
        reqItem.pickupLocation?.address ===
        sourceRequest.pickupLocation?.address;
      const matchesDelivery =
        reqItem.deliveryLocation?.address ===
        sourceRequest.deliveryLocation?.address;

      return matchesPickup || matchesDelivery;
    });

    const finalMatches = matchedRequests.slice(0, 20);

    return res.status(200).json({
      success: true,
      count: finalMatches.length,
      data: finalMatches,
    });
  } catch (error) {
    console.error("❌ [REQUEST_CONTROLLER] getMatchingRequests failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to find matching requests",
    });
  }
};
