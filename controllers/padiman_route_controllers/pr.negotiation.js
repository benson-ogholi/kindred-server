const Negotiation = require("../../models/padiman_route_models/Negotiation"); // Adjust path to your Negotiation model
const Request = require("../../models/padiman_route_models/Request");
const { sendNotification } = require("../../utils/pr/pr_push");

/**
 * @desc    Create a new negotiation and notify the service provider
 * @route   POST /api/negotiations
 * @access  Private (Assumes req.user is populated by auth middleware)
 */
exports.createNegotiation = async (req, res) => {
  try {
    const {
      serviceProvider,
      service, // The user's current request
      negotiatorService, // The matched request found
      serviceType,
      negotiatorServiceType,
      negotiator: bodyNegotiator,
    } = req.body;

    const negotiator = bodyNegotiator || req.user?._id || req.user?.id;

    // 1. Basic validation
    if (!serviceProvider) {
      return res.status(400).json({
        success: false,
        message: "Service provider ID is required.",
      });
    }

    if (!negotiator) {
      return res.status(400).json({
        success: false,
        message: "Negotiator ID is required.",
      });
    }

    // 2. Check if a negotiation already exists (checking both ways for safety or strict parameters)
    const existingNegotiation = await Negotiation.findOne({
      negotiator,
      serviceProvider,
      service,
      negotiatorService,
    });

    if (existingNegotiation) {
      return res.status(200).json({
        success: true,
        message: "Negotiation already exists, returning existing session",
        data: existingNegotiation,
      });
    }

    // 3. Create the negotiation mapping both service requests
    const negotiation = await Negotiation.create({
      negotiator,
      serviceProvider,
      service,
      negotiatorService,
      serviceType,
      negotiatorServiceType,
    });

    // 4. Update both requests to point to this new negotiation ID
    const requestIdsToUpdate = [service, negotiatorService].filter(Boolean);
    if (requestIdsToUpdate.length > 0) {
      await Request.updateMany(
        { _id: { $in: requestIdsToUpdate } },
        { $set: { negotiation: negotiation._id, status: "talking" } }
      );
    }

    // 5. Fetch basic request info for a better notification context
    let requestLabel = "a service";
    const targetServiceId = negotiatorService || service;
    if (targetServiceId) {
      const relatedRequest = await Request.findById(targetServiceId);
      if (relatedRequest) {
        requestLabel = relatedRequest.type.replace("-", " ");
      }
    }

    // 6. Send Notification to the Service Provider
    const notificationPayload = {
      title: "New Negotiation Request 🤝",
      body: `Someone wants to negotiate with you for ${requestLabel}. Tap to view details.`,
      type: "NEGOTIATION_STARTED",
      router: `/(features)/negotiation/${negotiation._id}`,
      data: {
        negotiationId: negotiation._id.toString(),
        serviceId: service,
        negotiatorServiceId: negotiatorService,
      },
    };

    sendNotification(serviceProvider, notificationPayload);

    // 7. Return success response
    return res.status(201).json({
      success: true,
      message: "Negotiation created successfully and requests updated",
      data: negotiation,
    });
  } catch (error) {
    console.error("❌ Error creating negotiation:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error: Could not create negotiation",
    });
  }
};
/**
 * @desc    Get a negotiation by its ID
 * @route   GET /api/negotiations/:id
 * @access  Private
 */
exports.getNegotiationById = async (req, res) => {
  try {
    const { id } = req.params;

    const negotiation = await Negotiation.findById(id)
      .populate(
        "negotiator",
        "firstName lastName name fullName email profileImage profilePicture"
      )
      .populate(
        "serviceProvider",
        "firstName lastName name fullName email profileImage profilePicture"
      )
      .populate("service")
      .populate("negotiatorService");

    if (!negotiation) {
      return res.status(404).json({
        success: false,
        message: "Negotiation not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: negotiation,
    });
  } catch (error) {
    console.error("❌ Error fetching negotiation:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error: Could not fetch negotiation",
    });
  }
};
