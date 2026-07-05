const { default: mongoose } = require("mongoose");
const JoinRide = require("../../models/padiman_route_models/JoinRide");
const Negotiation = require("../../models/padiman_route_models/Negotiation");
const Parcel = require("../../models/padiman_route_models/Parcel");
const Parcel_Request = require("../../models/padiman_route_models/Parcel_Request");
const RideOffer = require("../../models/padiman_route_models/RideOffer");
const { generatePickupCode } = require("../../utils/generatePickupCode");
const { sendNotification } = require("../../utils/pr/pr_push");
const { syncServiceStatus } = require('../../utils/pr/syncServiceStatus');
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

exports.updateNegotiation = async (req, res) => {
  console.log(`🔄 [UPDATE NEGOTIATION START] ID: ${req.params.id}`);
  console.log("📦 [REQUEST BODY]", JSON.stringify(req.body, null, 2));
  console.log("👤 [AUTH USER]", req.user ? req.user.toString() : "No user");

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

    console.log(`✅ [EXISTENCE CHECK PASSED] Found negotiation`);
    console.log(`📊 [EXISTING DOCUMENT]`, JSON.stringify(existing, null, 2));
    console.log(`📌 [CURRENT STATUS] ${existing.status}`);

    // 2. Perform the update
    console.log(`✍️ [PERFORMING UPDATE] Applying updates...`);
    const updated = await Negotiation.findByIdAndUpdate(
      negotiationId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updated) {
      console.error(`❌ [UPDATE FAILED] findByIdAndUpdate returned null`);
      return res.status(500).json({ success: false, message: "Update failed" });
    }

    console.log("✅ [NEGOTIATION UPDATED SUCCESSFULLY]");
    console.log("📊 [UPDATED DOCUMENT]", JSON.stringify(updated, null, 2));
    console.log(`📌 [NEW STATUS] ${updated.status}`);

    // 3. Status Sync Logic (Only if status actually changed)
    if (updated.status && updated.status !== existing.status) {
      console.log(
        `🔄 [STATUS CHANGE DETECTED] Old: ${existing.status} → New: ${updated.status}`
      );
      await syncServiceStatus(updated);
    } else {
      console.log(`ℹ️ [NO STATUS CHANGE] Status remains: ${updated.status}`);
    }

    // 4. Notification
    console.log(`🛎️ [NOTIFICATION PREPARATION] Preparing notification...`);

    const actingUser = req.user ? req.user.toString() : null;
    const recipientId =
      actingUser === updated.negotiator?.toString()
        ? updated.serviceProvider
        : updated.negotiator;

    console.log(`📨 [NOTIFICATION] Acting user: ${actingUser}`);
    console.log(`📨 [NOTIFICATION] Recipient: ${recipientId}`);

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

// Get all negotiations for the logged-in user
exports.getUserNegotiations = async (req, res) => {
  try {
    const userId = req.user;

    console.log(`🔍 [GET USER NEGOTIATIONS] Fetching for user: ${userId}`);

    const negotiations = await Negotiation.find({
      $or: [{ negotiator: userId }, { serviceProvider: userId }],
    })
      .sort({ createdAt: -1 })
      .populate("negotiator", "fullName email phone profileImage")
      .populate("serviceProvider", "fullName email phone profileImage");

    console.log(
      `✅ [GET USER NEGOTIATIONS SUCCESS] Found ${negotiations.length} negotiations`
    );
    res.status(200).json(negotiations);
  } catch (err) {
    console.error("❌ [GET USER NEGOTIATIONS ERROR]", err.message);
    res.status(400).json({ error: err.message });
  }
};

// Get single negotiation with full service data
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

    const isValidObjectId = (value) => {
      return (
        mongoose.Types.ObjectId.isValid(value) && String(value).length === 24
      );
    };

    console.log(`📦 Resolving serviceType: ${negotiation.serviceType}`);

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
        break;

      case "join_a_ride":
      case "offer_a_ride":
        if (
          negotiation.negotiatorService &&
          isValidObjectId(negotiation.negotiatorService)
        ) {
          negotiatorServiceData = await JoinRide.findById(
            negotiation.negotiatorService
          ).lean();
          console.log("📦 JoinRide fetched:", !!negotiatorServiceData);
        }

        if (negotiation.service && isValidObjectId(negotiation.service)) {
          serviceDetails = await RideOffer.findById(negotiation.service).lean();
          console.log("📦 RideOffer fetched:", !!serviceDetails);
        }
        break;

      default:
        console.warn(`⚠️ Unknown serviceType: ${negotiation.serviceType}`);
    }

    // Auto delete invalid negotiation
    if (
      (negotiation.serviceType === "deliver_a_parcel" &&
        !negotiatorServiceData) ||
      ((negotiation.serviceType === "join_a_ride" ||
        negotiation.serviceType === "offer_a_ride") &&
        !negotiatorServiceData &&
        !serviceDetails)
    ) {
      console.log("🗑️ Invalid negotiation detected. Deleting...");
      await Negotiation.findByIdAndDelete(id);
      return res
        .status(404)
        .json({ error: "Negotiation was invalid and has been removed." });
    }

    // Pickup Code Fallback
    if (!pickupCode && negotiatorServiceData?.parties?.sender?.pickupCode) {
      pickupCode = negotiatorServiceData.parties.sender.pickupCode;
    }

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

    console.log("🚀 Final response prepared successfully");
    res.status(200).json(finalResponse);
  } catch (err) {
    console.error("❌ Error in getNegotiationById:", err.message);
    res.status(500).json({ error: err.message });
  }
};
