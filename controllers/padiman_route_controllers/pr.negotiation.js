const Negotiation = require("../../models/padiman_route_models/Negotiation");
const Parcel_Request = require("../../models/padiman_route_models/Parcel_Request");
const RideOffer = require("../../models/padiman_route_models/RideOffer");
const { sendNotification } = require("../../utils/pr/pr_push");

// Create a new negotiation
exports.createNegotiation = async (req, res) => {
  console.log("🚀 [NEGOTIATION START] createNegotiation controller invoked");

  try {
    // 1. Get negotiator ID directly from the secure token (req.user)
    const negotiatorId = req.user;
    console.log("🔑 [AUTH CHECK] Negotiator ID from token:", negotiatorId);

    // 2. Destructure the rest from the body
    const { serviceProvider, service, negotiatorService, serviceType } =
      req.body;
    console.log("📦 [PAYLOAD RECEIVED] Body data:", {
      serviceProvider,
      service,
      negotiatorService,
      serviceType,
    });

    // 🔍 Deduplication Check: Look for existing negotiations...
    console.log(
      "🕵️ [DUPLICATE CHECK] Searching for existing matching negotiation tracks..."
    );
    const existingNegotiations = await Negotiation.find({
      service: service,
      negotiator: negotiatorId,
      serviceProvider: serviceProvider,
    }).sort({ createdAt: 1 });

    if (existingNegotiations.length > 0) {
      console.log(
        `⚠️ [DUPLICATE DETECTED] Found ${existingNegotiations.length} pre-existing records for this channel.`
      );

      const primaryNegotiation = existingNegotiations[0];

      // Purge redundant records (your existing logic)
      if (existingNegotiations.length > 1) {
        const redundantIds = existingNegotiations
          .slice(1)
          .map((neg) => neg._id);

        await Negotiation.deleteMany({ _id: { $in: redundantIds } });

        if (serviceType === "offer_a_ride") {
          await RideOffer.findByIdAndUpdate(service, {
            $pull: { negotiations: { $in: redundantIds } },
          });
        } else if (serviceType === "deliver_a_parcel") {
          await Parcel_Request.findByIdAndUpdate(service, {
            $pull: { negotiations: { $in: redundantIds } },
          });
        }
      }

      const populatedOriginal = await primaryNegotiation.populate([
        { path: "negotiator", select: "name email profileImage" },
        { path: "serviceProvider", select: "name email profileImage" },
        { path: "service" },
      ]);

      console.log("🎉 [NEGOTIATION RECOVERY] Returning existing record.");
      return res.status(200).json(populatedOriginal);
    }

    // 3. Create a brand new negotiation record
    console.log(
      "📝 [DB OPERATIONS] No track found. Creating brand new Negotiation document..."
    );
    const newNegotiation = await Negotiation.create({
      negotiator: negotiatorId,
      serviceProvider,
      service,
      negotiatorService,
      serviceType,
    });
    console.log(
      "✅ [DB SUCCESS] Negotiation document created. ID:",
      newNegotiation._id
    );

    // 4. Update the relevant model's tracking array
    console.log(`🔀 [ROUTING UPDATE] Evaluating serviceType: "${serviceType}"`);

    if (serviceType === "offer_a_ride") {
      const updatedRide = await RideOffer.findByIdAndUpdate(
        service,
        { $addToSet: { negotiations: newNegotiation._id } },
        { new: true }
      );
      if (updatedRide) {
        console.log("🔹 [RIDE MATCH SUCCESS] RideOffer updated.");
      }
    } else if (serviceType === "deliver_a_parcel") {
      const updatedParcel = await Parcel_Request.findByIdAndUpdate(
        service,
        { $addToSet: { negotiations: newNegotiation._id } },
        { new: true }
      );
      if (updatedParcel) {
        console.log("🔹 [PARCEL MATCH SUCCESS] Parcel_Request updated.");
      }
    }

    // 5. Populate for response
    console.log("🔄 [POPULATE RELATIONSHIPS] Populating reference trees...");
    const populatedNegotiation = await newNegotiation.populate([
      { path: "negotiator", select: "name email profileImage" },
      { path: "serviceProvider", select: "name email profileImage" },
      { path: "service" },
    ]);

    // ====================== NOTIFY SERVICE PROVIDER ======================
    console.log(
      `🛎️ [NOTIFICATION] Sending Push + Email to Service Provider: ${serviceProvider}`
    );

    await sendNotification(serviceProvider, {
      title: "New Negotiation Request",
      body: `You have a new negotiation request on your ${
        serviceType === "offer_a_ride"
          ? "ride offer"
          : "parcel delivery request"
      }.`,
      type: "NEGOTIATION",
      router:
        serviceType === "offer_a_ride"
          ? "/(details)/ride"
          : "/(details)/details",
      data: {
        negotiationId: newNegotiation._id.toString(),
        serviceId: service ? service.toString() : null, // Ensured
        serviceType: serviceType,
      },
    });
    // =====================================================================

    console.log("🎉 [NEGOTIATION COMPLETE] Returning 201 JSON payload.");
    res.status(201).json(populatedNegotiation);
  } catch (err) {
    console.error(
      "💥 [NEGOTIATION ERROR] Transaction failure in createNegotiation:",
      err.message
    );
    console.error(err);
    res.status(400).json({ error: err.message });
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
  console.log(
    "📦 [REQUEST BODY] Updates requested:",
    JSON.stringify(req.body, null, 2)
  );

  try {
    const updates = req.body;

    // Check if the document exists before attempting the update
    const existing = await Negotiation.findById(req.params.id);
    if (!existing) {
      console.log(
        `❌ [NOT FOUND] No negotiation found with ID: ${req.params.id}`
      );
      return res
        .status(404)
        .json({ success: false, message: "Negotiation not found" });
    }

    const updated = await Negotiation.findByIdAndUpdate(
      req.params.id,
      { $set: updates }, // Use $set for explicit field updates
      { new: true, runValidators: true } // Return updated doc and enforce schema
    );

    console.log(
      "✅ [UPDATE SUCCESS] Result:",
      JSON.stringify(updated, null, 2)
    );

    // ====================== SEND STATUS/PRICING UPDATE NOTIFICATION ======================
    // Fire notifications conditionally if status or price-altering updates are pushed through
    const actingUser = req.user ? req.user.toString() : null;
    const recipientId =
      actingUser === updated.negotiator.toString()
        ? updated.serviceProvider
        : updated.negotiator;

    console.log(
      `🛎️ [NOTIFICATION] Relaying status synchronization update payload to: ${recipientId}`
    );

    await sendNotification(recipientId, {
      title: "Negotiation Updated",
      body: `Your active offer status details have been modified to: ${updated.status}.`,
      type: "NEGOTIATION",
      router:
        updated.serviceType === "offer_a_ride"
          ? "/(details)/ride"
          : "/(details)/details",
      data: {
        negotiationId: updated._id.toString(),
        serviceId: updated.service ? updated.service.toString() : null, // Ensured
        serviceType: updated.serviceType,
        status: updated.status,
      },
    });
    // =====================================================================================

    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error("💥 [UPDATE FAILED] Error details:", err.message);
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

    // 1. Fetch the base negotiation
    const negotiation = await Negotiation.findById(id)
      .populate("negotiator", "name email profileImage")
      .populate("serviceProvider", "name email profileImage");

    if (!negotiation) {
      return res.status(404).json({ error: "Negotiation not found" });
    }

    let serviceDetails = null;

    // 2. Resolve the parent document (Ride or Parcel)
    if (negotiation.serviceType === "offer_a_ride") {
      serviceDetails = await RideOffer.findById(negotiation.service);
    } else if (negotiation.serviceType === "deliver_a_parcel") {
      serviceDetails = await Parcel_Request.findById(negotiation.service);
    }

    // 3. Return the combined object
    res.status(200).json({
      ...negotiation.toObject(),
      serviceDetails, // This contains the full RideOffer or Parcel_Request document
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
