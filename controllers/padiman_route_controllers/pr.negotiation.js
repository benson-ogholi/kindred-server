const { default: mongoose } = require("mongoose");
const JoinRide = require("../../models/padiman_route_models/JoinRide");
const Negotiation = require("../../models/padiman_route_models/Negotiation");
const Parcel = require("../../models/padiman_route_models/Parcel");
const Parcel_Request = require("../../models/padiman_route_models/Parcel_Request");
const RideOffer = require("../../models/padiman_route_models/RideOffer");
const { generatePickupCode } = require("../../utils/generatePickupCode");
const { sendNotification } = require("../../utils/pr/pr_push");

// Create a new negotiation
exports.createNegotiation = async (req, res) => {
  console.log("🚀 [NEGOTIATION START] createNegotiation controller invoked");

  try {
    const negotiatorId = req.user; // Ensure we get the ID correctly
    console.log("🔑 [AUTH] Negotiator ID:", negotiatorId);

    const { serviceProvider, service, negotiatorService, serviceType } =
      req.body;

    if (!serviceProvider || !service || !serviceType) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    // === STRICT DEDUPLICATION: Only same negotiator + same service + same provider ===
    console.log(
      "🕵️ [DUPLICATE CHECK] Checking for existing negotiation by this user..."
    );

    const existing = await Negotiation.findOne({
      service: service,
      negotiator: negotiatorId,
      serviceProvider: serviceProvider,
    });

    if (existing) {
      console.log(
        `⚠️ [DUPLICATE FOUND] User already has a negotiation channel. Returning existing.`
      );

      const populated = await existing.populate([
        { path: "negotiator", select: "fullName email phone profileImage" },
        {
          path: "serviceProvider",
          select: "fullName email phone profileImage",
        },
        { path: "service" },
      ]);

      return res.status(200).json({ success: true, data: populated });
    }

    // === CREATE NEW NEGOTIATION (Different user = allowed) ===
    console.log(
      "📝 [CREATE] No existing channel → Creating new negotiation..."
    );

    const newNegotiation = await Negotiation.create({
      negotiator: negotiatorId,
      serviceProvider,
      service,
      negotiatorService,
      serviceType,
    });

    console.log("✅ [CREATED] Negotiation ID:", newNegotiation._id);

    // Add to the parent service's negotiations array
    if (serviceType === "offer_a_ride") {
      await RideOffer.findByIdAndUpdate(
        service,
        { $addToSet: { negotiations: newNegotiation._id } },
        { new: true }
      );
    } else if (serviceType === "deliver_a_parcel") {
      await Parcel_Request.findByIdAndUpdate(
        // Note: Use your actual model name
        service,
        { $addToSet: { negotiations: newNegotiation._id } },
        { new: true }
      );
    }

    // Populate full data for response
    const populatedNegotiation = await newNegotiation.populate([
      { path: "negotiator", select: "fullName email phone profileImage" },
      { path: "serviceProvider", select: "fullName email phone profileImage" },
      { path: "service" },
    ]);

    // Send notification to service provider
    await sendNotification(serviceProvider, {
      title: "New Negotiation Request",
      body: `You have a new negotiation from a different user on your ${
        serviceType === "offer_a_ride" ? "ride offer" : "parcel request"
      }.`,
      type: "NEGOTIATION",
      router:
        serviceType === "offer_a_ride"
          ? "/(details)/ride"
          : "/(details)/details",
      data: {
        negotiationId: newNegotiation._id.toString(),
        serviceId: service.toString(),
        serviceType,
      },
    });

    console.log("🎉 [SUCCESS] New negotiation created and returned.");
    res.status(201).json({ success: true, data: populatedNegotiation });
  } catch (err) {
    console.error("💥 [NEGOTIATION ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update status to 'ride cancelled'
exports.cancelRide = async (req, res) => {
  console.log(`🚀 [CANCEL RIDE START] ID: ${req.params.id}`);
  try {
    const updated = await Negotiation.findByIdAndUpdate(
      req.params.id,
      { status: "ride cancelled" },
      { new: true }
    );

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: "Negotiation record not found" });
    }

    // ====================== SEND CANCELLATION NOTIFICATIONS ======================
    // Determine the counterparty who needs to know about the cancellation
    const actingUser = req.user ? req.user.toString() : null;
    const recipientId =
      actingUser === updated.negotiator.toString()
        ? updated.serviceProvider
        : updated.negotiator;

    console.log(
      `🛎️ [NOTIFICATION] Dispatched ride cancellation alert to user: ${recipientId}`
    );

    await sendNotification(recipientId, {
      title: "Ride Cancelled",
      body: "An active negotiation track has been marked as cancelled by the counterparty.",
      type: "NEGOTIATION",
      router: "/(screens)/wallet",
      data: {
        negotiationId: updated._id.toString(),
        serviceId: updated.service ? updated.service.toString() : null, // Ensured
        serviceType: updated.serviceType,
        status: "ride cancelled",
      },
    });
    // =============================================================================

    res.json(updated);
  } catch (err) {
    console.error("💥 [CANCEL RIDE FAILED] Error details:", err.message);
    res.status(400).json({ error: err.message });
  }
};

// Update general details (amount, confirmed, paid, status)
exports.updateNegotiation = async (req, res) => {
  console.log(`🔄 [UPDATE NEGOTIATION START] ID: ${req.params.id}`);
  console.log("📦 [REQUEST BODY]", JSON.stringify(req.body, null, 2));

  try {
    const updates = req.body;
    const negotiationId = req.params.id;

    // 1. Check if negotiation exists
    console.log(
      `🔍 [CHECK EXISTENCE] Looking for Negotiation ID: ${negotiationId}`
    );
    const existing = await Negotiation.findById(negotiationId);

    if (!existing) {
      console.log(
        `❌ [NOT FOUND] No negotiation found with ID: ${negotiationId}`
      );
      return res
        .status(404)
        .json({ success: false, message: "Negotiation not found" });
    }

    console.log(
      `✅ [EXISTENCE CHECK PASSED] Found negotiation with current status: ${existing.status}`
    );

    // 2. Perform the update
    console.log(`✍️ [PERFORMING UPDATE] Applying updates...`);
    const updated = await Negotiation.findByIdAndUpdate(
      negotiationId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    console.log("✅ [NEGOTIATION UPDATED SUCCESSFULLY]");
    console.log("📊 [UPDATED DOCUMENT]", JSON.stringify(updated, null, 2));

    // 3. Status Sync Logic
    if (updated.status && updated.status !== existing.status) {
      console.log(
        `🔄 [STATUS CHANGE DETECTED] Old: ${existing.status} → New: ${updated.status}`
      );

      let serviceModel;
      let serviceIdField = "service";
      let serviceType = updated.serviceType;

      console.log(`📋 [SERVICE TYPE] Processing serviceType: ${serviceType}`);

      switch (serviceType) {
        case "offer_a_ride":
          serviceModel = RideOffer;
          serviceIdField = "service";
          console.log(`🚗 [RIDE OFFER] Will sync with RideOffer model`);
          break;

        case "join_a_ride":
          serviceModel = JoinRide;
          serviceIdField = "negotiatorService";
          console.log(
            `👥 [JOIN RIDE] Will sync with JoinRide model using negotiatorService`
          );
          break;

        case "deliver_a_parcel":
          console.log(`📦 [PARCEL] Checking which parcel model to use...`);
          if (updated.service) {
            serviceModel = Parcel_Request;
            serviceIdField = "service";
            console.log(`📋 Using Parcel_Request via 'service' field`);
          } else if (updated.negotiatorService) {
            serviceModel = Parcel;
            serviceIdField = "negotiatorService";
            console.log(`📋 Using Parcel via 'negotiatorService' field`);
          } else {
            console.log(
              `⚠️ [PARCEL] No service or negotiatorService ID found for sync`
            );
          }
          break;

        default:
          console.warn(
            `⚠️ [UNKNOWN SERVICE TYPE] ${serviceType} - No status sync will be performed`
          );
      }

      if (serviceModel && updated[serviceIdField]) {
        const serviceId = updated[serviceIdField];
        console.log(
          `🔗 [SYNCING STATUS] Updating service ${serviceIdField}: ${serviceId} to status: ${updated.status}`
        );

        const serviceUpdateResult = await serviceModel.findByIdAndUpdate(
          serviceId,
          { status: updated.status },
          { new: true }
        );

        if (serviceUpdateResult) {
          console.log(
            `✅ [SERVICE STATUS SYNCED SUCCESSFULLY] ${serviceType} status updated to ${updated.status}`
          );
          console.log(
            `📊 [UPDATED SERVICE]`,
            JSON.stringify(serviceUpdateResult, null, 2)
          );
        } else {
          console.warn(
            `❌ [SERVICE SYNC FAILED] Service with ID ${serviceId} not found`
          );
        }
      } else {
        console.log(
          `⚠️ [NO SYNC PERFORMED] Missing serviceModel or service ID`
        );
      }
    } else {
      console.log(`ℹ️ [NO STATUS CHANGE] Status remains: ${updated.status}`);
    }

    // 4. Notification
    console.log(`🛎️ [NOTIFICATION PREPARATION] Preparing notification...`);

    const actingUser = req.user ? req.user.toString() : null;
    const recipientId =
      actingUser === updated.negotiator.toString()
        ? updated.serviceProvider
        : updated.negotiator;

    console.log(`📨 [NOTIFICATION] Sending to recipient: ${recipientId}`);

    await sendNotification(recipientId, {
      title: "Negotiation Updated",
      body: `Your negotiation status has been updated to: ${updated.status}`,
      type: "NEGOTIATION",
      router:
        updated.serviceType === "offer_a_ride" ||
        updated.serviceType === "join_a_ride"
          ? "/(details)/ride"
          : "/(details)/details",
      data: {
        negotiationId: updated._id.toString(),
        serviceId:
          updated.service?.toString() ||
          updated.negotiatorService?.toString() ||
          null,
        serviceType: updated.serviceType,
        status: updated.status,
      },
    });

    console.log(`✅ [NOTIFICATION SENT] Successfully triggered notification`);

    // Final Response
    console.log(
      `🎉 [UPDATE NEGOTIATION COMPLETED SUCCESSFULLY] ID: ${negotiationId}`
    );
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error("💥 [UPDATE NEGOTIATION FAILED]");
    console.error("Error Message:", err.message);
    console.error("Error Stack:", err.stack);
    res.status(400).json({ success: false, error: err.message });
  }
};

// Get all negotiations for the logged-in user (using token ID)
exports.getUserNegotiations = async (req, res) => {
  try {
    // req.user is provided by your protect middleware
    const userId = req.user;

    const negotiations = await Negotiation.find({
      $or: [{ negotiator: userId }, { serviceProvider: userId }],
    })
      .sort({ createdAt: -1 }) // Most recent first
      .populate("negotiator", "name email phone") // Fetches from User Schema
      .populate("serviceProvider", "name email phone"); // Fetches from User Schema

    res.status(200).json(negotiations);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getNegotiationById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user;

    console.log(`🔍 [getNegotiationById] Fetching negotiation ID: ${id}`);

    const negotiation = await Negotiation.findById(id)
      .populate("negotiator", "fullName email profileImage phone")
      .populate("serviceProvider", "fullName email profileImage phone")
      .lean();

    if (!negotiation) {
      console.log("❌ Negotiation not found");
      return res.status(404).json({ error: "Negotiation not found" });
    }

    console.log("✅ Negotiation base found:", {
      id: negotiation._id,
      serviceType: negotiation.serviceType,
      service: negotiation.service,
      negotiatorService: negotiation.negotiatorService,
    });

    let negotiatorServiceData = null;
    let serviceDetails = null;
    let pickupCode = negotiation.pickupCode;
    let shouldDeleteNegotiation = false;

    console.log(`📦 Resolving serviceType: ${negotiation.serviceType}`);

    const isValidObjectId = (value) => {
      return (
        mongoose.Types.ObjectId.isValid(value) && String(value).length === 24
      );
    };

    switch (negotiation.serviceType) {
      case "deliver_a_parcel":
        if (
          negotiation.negotiatorService &&
          isValidObjectId(negotiation.negotiatorService)
        ) {
          negotiatorServiceData = await Parcel.findById(
            negotiation.negotiatorService
          ).lean();
          console.log("📦 Parcel fetched:", !!negotiatorServiceData);
        }

        if (negotiation.service && isValidObjectId(negotiation.service)) {
          serviceDetails = await Parcel_Request.findById(
            negotiation.service
          ).lean();
          console.log("📦 Parcel_Request fetched:", !!serviceDetails);
        }

        if (!pickupCode && negotiatorServiceData?.parties?.sender?.pickupCode) {
          pickupCode = negotiatorServiceData.parties.sender.pickupCode;
        }
        break;

      case "join_a_ride":
      case "offer_a_ride":
        // JoinRide from negotiatorService
        if (
          negotiation.negotiatorService &&
          isValidObjectId(negotiation.negotiatorService)
        ) {
          negotiatorServiceData = await JoinRide.findById(
            negotiation.negotiatorService
          ).lean();
          console.log("📦 JoinRide fetched:", !!negotiatorServiceData);
          if (!pickupCode) pickupCode = negotiatorServiceData?.pickupCode;
        }

        // RideOffer from service
        if (negotiation.service && isValidObjectId(negotiation.service)) {
          serviceDetails = await RideOffer.findById(negotiation.service).lean();
          console.log("📦 RideOffer fetched:", !!serviceDetails);
        }
        break;

      default:
        console.warn(`⚠️ Unknown serviceType: ${negotiation.serviceType}`);
    }

    // ==================== AUTO DELETE INVALID NEGOTIATION ====================
    if (
      (negotiation.serviceType === "deliver_a_parcel" &&
        !negotiatorServiceData) ||
      ((negotiation.serviceType === "join_a_ride" ||
        negotiation.serviceType === "offer_a_ride") &&
        !negotiatorServiceData &&
        !serviceDetails)
    ) {
      console.log(
        "🗑️ Invalid negotiation detected (service data missing). Deleting..."
      );
      await Negotiation.findByIdAndDelete(id);
      return res.status(404).json({
        error: "Negotiation was invalid and has been removed.",
      });
    }

    // ==================== PICKUP CODE FALLBACK ====================
    if (!pickupCode) {
      console.log("⚠️ No pickupCode found - Generating fallback...");
      const senderName =
        negotiation.negotiator?.fullName?.slice(0, 4) || "USER";
      pickupCode = `PR-${Date.now()
        .toString()
        .slice(-6)}-${senderName.toUpperCase()}`;

      await Negotiation.findByIdAndUpdate(id, { pickupCode });
      console.log("✅ Generated & saved new pickupCode:", pickupCode);
    }

    const isProvider =
      userId.toString() === negotiation.serviceProvider?._id?.toString();
    const isParcel = negotiation.serviceType === "deliver_a_parcel";

    const finalResponse = {
      ...negotiation,
      negotiatorServiceData,
      serviceDetails,
      pickupCode,
      isProvider,
      isParcel,
    };

    console.log("🚀 Final response prepared");
    res.status(200).json(finalResponse);
  } catch (err) {
    console.error("❌ Error in getNegotiationById:", err);
    res.status(500).json({ error: err.message });
  }
};
