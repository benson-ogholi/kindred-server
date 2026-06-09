const Negotiation = require("../../models/padiman_route_models/Negotiation");
const Parcel_Request = require("../../models/padiman_route_models/Parcel_Request");
const RideOffer = require("../../models/padiman_route_models/RideOffer");

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

    // 🔍 Deduplication Check: Look for existing negotiations between these exact parties for this service
    console.log(
      "🕵️ [DUPLICATE CHECK] Searching for existing matching negotiation tracks..."
    );
    const existingNegotiations = await Negotiation.find({
      service: service,
      negotiator: negotiatorId,
      serviceProvider: serviceProvider,
    }).sort({ createdAt: 1 }); // Sort oldest to newest

    if (existingNegotiations.length > 0) {
      console.log(
        `⚠️ [DUPLICATE DETECTED] Found ${existingNegotiations.length} pre-existing records for this channel.`
      );

      // Use the very first one created as the absolute source of truth
      const primaryNegotiation = existingNegotiations[0];
      console.log(
        `👑 [SOURCE OF TRUTH] Keeping original negotiation document ID: ${primaryNegotiation._id}`
      );

      // If there are accidental redundant records created beyond the first one, purge them permanently
      if (existingNegotiations.length > 1) {
        const redundantIds = existingNegotiations
          .slice(1)
          .map((neg) => neg._id);
        console.log(
          `🚨 [DB PURGE] Removing ${redundantIds.length} redundant duplicate records from collection...`
        );

        await Negotiation.deleteMany({ _id: { $in: redundantIds } });

        // Scrub those redundant references entirely out of your target models arrays too
        if (serviceType === "offer_a_ride") {
          await RideOffer.findByIdAndUpdate(service, {
            $pull: { negotiations: { $in: redundantIds } },
          });
        } else if (serviceType === "deliver_a_parcel") {
          await Parcel_Request.findByIdAndUpdate(service, {
            $pull: { negotiations: { $in: redundantIds } },
          });
        }
        console.log(
          "🧹 [DB PURGE COMPLETE] Redundant references completely erased."
        );
      }

      // Return the populated original track instantly so the frontend can route to it gracefully
      const populatedOriginal = await primaryNegotiation.populate([
        { path: "negotiator", select: "name email profileImage" },
        { path: "serviceProvider", select: "name email profileImage" },
        { path: "service" },
      ]);

      console.log(
        "🎉 [NEGOTIATION RECOVERY] Returning 200 JSON payload with original record."
      );
      return res.status(200).json(populatedOriginal);
    }

    // 3. Create a brand new negotiation record if none existed before
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

    // 4. Update the relevant model's tracking array safely
    console.log(`🔀 [ROUTING UPDATE] Evaluating serviceType: "${serviceType}"`);

    if (serviceType === "offer_a_ride") {
      console.log(
        `🎯 [SCHEMA MATCH FOUND] Service type matches "offer_a_ride". Target ID: ${service}`
      );

      const updatedRide = await RideOffer.findByIdAndUpdate(
        service,
        { $addToSet: { negotiations: newNegotiation._id } }, // $addToSet guarantees uniqueness over $push
        { new: true }
      );

      if (updatedRide) {
        console.log(
          "🔹 [RIDE MATCH SUCCESS] RideOffer document updated successfully."
        );
      } else {
        console.log(
          `⚠️ [RIDE MATCH FAILED] Target RideOffer document with ID ${service} not found.`
        );
      }
    } else if (serviceType === "deliver_a_parcel") {
      console.log(
        `🎯 [SCHEMA MATCH FOUND] Service type matches "deliver_a_parcel". Target ID: ${service}`
      );

      const updatedParcel = await Parcel_Request.findByIdAndUpdate(
        service,
        { $addToSet: { negotiations: newNegotiation._id } }, // $addToSet guarantees uniqueness over $push
        { new: true }
      );

      if (updatedParcel) {
        console.log(
          "🔹 [PARCEL MATCH SUCCESS] Parcel_Request document updated successfully."
        );
      } else {
        console.log(
          `⚠️ [PARCEL MATCH FAILED] Target Parcel_Request document with ID ${service} not found.`
        );
      }
    } else {
      console.log(
        `⚠️ [UNKNOWN TYPE] Warning: serviceType "${serviceType}" did not match any operational model.`
      );
    }

    // 5. Populate and return response
    console.log(
      "🔄 [POPULATE RELATIONSHIPS] Populating reference trees for response schema..."
    );
    const populatedNegotiation = await newNegotiation.populate([
      { path: "negotiator", select: "name email profileImage" },
      { path: "serviceProvider", select: "name email profileImage" },
      { path: "service" },
    ]);
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
  try {
    const updated = await Negotiation.findByIdAndUpdate(
      req.params.id,
      { status: "ride cancelled" },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
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
