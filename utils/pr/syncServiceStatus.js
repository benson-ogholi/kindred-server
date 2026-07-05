const JoinRide = require("../../models/padiman_route_models/JoinRide");
const Parcel = require("../../models/padiman_route_models/Parcel");
const Parcel_Request = require("../../models/padiman_route_models/Parcel_Request");
const RideOffer = require("../../models/padiman_route_models/RideOffer");

const statusMapping = {
  "ride pending": "pending",
  "ride agreed": "active",
  "ride started": "active",
  "ride ongoing": "active",
  "ride completed": "completed",
  "ride cancelled": "cancelled",
};

const syncServiceStatus = async (negotiation) => {
  console.log(
    `🔄 [SYNC SERVICE STATUS] Started for negotiation: ${negotiation._id}`
  );

  if (!negotiation.service && !negotiation.negotiatorService) {
    console.log(`⚠️ [SYNC SKIPPED] No service or negotiatorService ID found`);
    return;
  }

  let ServiceModel;
  let serviceId = null;

  const serviceType = negotiation.serviceType;

  console.log(`📋 [SERVICE TYPE] ${serviceType}`);

  switch (serviceType) {
    case "offer_a_ride":
      ServiceModel = RideOffer;
      serviceId = negotiation.service;
      console.log(`🚗 [RIDE OFFER] Using 'service' field → ${serviceId}`);
      break;

    case "join_a_ride":
      ServiceModel = JoinRide;
      serviceId = negotiation.negotiatorService;
      console.log(
        `👥 [JOIN RIDE] Using 'negotiatorService' field → ${serviceId}`
      );
      break;

    case "deliver_a_parcel":
      if (negotiation.service) {
        ServiceModel = Parcel_Request;
        serviceId = negotiation.service;
        console.log(`📦 [PARCEL REQUEST] Using 'service' field → ${serviceId}`);

        ServiceModel = Parcel;
        serviceId = negotiation.negotiatorService;
        console.log(
          `📦 [PARCEL] Using 'negotiatorService' field → ${serviceId}`
        );
      } else if (negotiation.negotiatorService) {
        ServiceModel = Parcel_Request;
        serviceId = negotiation.negotiatorService;
        console.log(
          `📦 [PARCEL] Using 'negotiatorService' field → ${serviceId}`
        );
        ServiceModel = Parcel;
        serviceId = negotiation.service;
        console.log(`📦 [PARCEL REQUEST] Using 'service' field → ${serviceId}`);


      }
      break;

    default:
      console.warn(`⚠️ [UNKNOWN SERVICE TYPE] ${serviceType} - Skipping sync`);
      return;
  }

  if (!ServiceModel || !serviceId) {
    console.log(`⚠️ [SYNC ABORTED] Missing ServiceModel or serviceId`);
    return;
  }

  const newStatus = statusMapping[negotiation.status] || negotiation.status;

  try {
    const updatedService = await ServiceModel.findByIdAndUpdate(
      serviceId,
      { status: newStatus },
      { new: true }
    );

    if (updatedService) {
      console.log(
        `✅ [SERVICE SYNC SUCCESS] ${serviceType} ID: ${serviceId} → Status: ${newStatus}`
      );
      console.log(
        `📊 [UPDATED SERVICE DOCUMENT]`,
        JSON.stringify(updatedService, null, 2)
      );
    } else {
      console.warn(
        `❌ [SERVICE NOT FOUND] Could not update service with ID: ${serviceId}`
      );
    }
  } catch (err) {
    console.error(`💥 [SERVICE SYNC ERROR]`, err.message);
  }
};

module.exports = { syncServiceStatus, statusMapping };
