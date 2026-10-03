const Padiman_Route_User = require("../../models/padiman_route_models/Padiman_Route_User");
const Negotiation = require("../../models/padiman_route_models/Negotiation");
const ParcelRequest = require("../../models/padiman_route_models/Parcel_Request");
const RideOffer = require("../../models/padiman_route_models/RideOffer");
const Parcel = require("../../models/padiman_route_models/Parcel");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");
const JoinRide = require("../../models/padiman_route_models/JoinRide");
const { generatePickupCode } = require("../../utils/generatePickupCode");

// GET PROFILE
const getProfile = async (req, res) => {
  try {
    const user = await Padiman_Route_User.findById(req.user).select(
      "-password"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // If the user is an approved driver, ensure their profileImage uses their driver verification selfie
    if (user.isDriverApproved) {
      const driverSelfie =
        user.verificationMeta?.driverVerification?.documents?.selfieUrl;

      if (driverSelfie && user.profileImage !== driverSelfie) {
        user.profileImage = driverSelfie;
        await user.save();
      }
    }

    res.json(user);
  } catch (error) {
    console.error("Get Profile Error:", error);
    res.status(500).json({ message: "Server error fetching profile" });
  }
};

// UPDATE PROFILE
const updateProfile = async (req, res) => {
  const user = await Padiman_Route_User.findById(req.user);

  if (user) {
    user.fullName = req.body.fullName || user.fullName;
    user.phone = req.body.phone || user.phone;

    const updatedUser = await user.save();
    res.json(updatedUser);
  } else {
    res.status(404).json({ message: "User not found" });
  }
};

// DELETE ACCOUNT
const deleteAccount = async (req, res) => {
  const user = await Padiman_Route_User.findById(req.user);
  if (user) {
    await Padiman_Route_User.findByIdAndDelete(req.user);
    res.json({ message: "User account deleted" });
  } else {
    res.status(404).json({ message: "User not found" });
  }
};

// LOGOUT
const logout = (req, res) => {
  res.status(200).json({ message: "User logged out successfully" });
};

// SAVE EXPO PUSH TOKEN
const saveExpoPushToken = async (req, res) => {
  const { expoPushToken } = req.body;

  if (!expoPushToken) {
    return res.status(400).json({ message: "Push token is required" });
  }

  try {
    console.log(
      `📱 [PUSH TOKEN] Saving token for user ${req.user}:`,
      expoPushToken
    );

    const user = await Padiman_Route_User.findByIdAndUpdate(
      req.user,
      { expoPushToken },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: "Expo push token saved successfully",
    });
  } catch (err) {
    console.error("💥 [PUSH TOKEN ERROR]:", err.message);
    res.status(500).json({ message: "Server error saving push token" });
  }
};

// GET ALL USER ORDERS, LIFECYCLES, AND ONGOING COUNTS
const getUserDashboardOrders = async (req, res) => {
  console.log(
    `📊 [DASHBOARD METRICS] Gathering all activity lanes for User: ${req.user}`
  );

  try {
    const userId = req.user;

    // 1. Fetch data from primary listings schemas concurrently with UNRESTRICTED population
    const [
      postedRides,
      requestedParcels,
      deliveryParcels,
      customerNegotiations,
    ] = await Promise.all([
      // offer_ride: Returns full RideOffer + full Driver profile
      RideOffer.find({ driver: userId })
        .populate("driver")
        .sort({ createdAt: -1 }),

      // send_parcel: Packages a user created to be sent
      Parcel.find({ requestedBy: userId })
        .populate("requestedBy")
        .sort({ createdAt: -1 }),

      // deliver_parcel
      ParcelRequest.find({ user: userId })
        .populate("user")
        .sort({ createdAt: -1 }),

      // join_ride: Returns full Negotiation + full Service Provider profile
      Negotiation.find({ negotiator: userId })
        .populate("serviceProvider")
        .populate("negotiator")
        .sort({ createdAt: -1 }),
    ]);

    // 2. Map and Categorize Arrays into the 4 target lanes
    const offer_ride = postedRides;
    const send_parcel = requestedParcels;
    const deliver_parcel = deliveryParcels;

    // Filter negotiations explicitly to isolate passengers joining a ride
    const join_ride = customerNegotiations.filter(
      (neg) => neg.serviceType === "offer_a_ride"
    );

    // Helper closure logic block to calculate what constitutes an "ongoing" activity
    const isOngoing = (statusStr) => {
      if (!statusStr) return false;
      const normalized = statusStr.toLowerCase().trim();
      // Excludes terminal finished or abandoned lanes
      return ![
        "completed",
        "cancelled",
        "ride completed",
        "ride cancelled",
      ].includes(normalized);
    };

    // 3. Compute Ongoing Accumulators
    const ongoingOfferRideCount = offer_ride.filter((item) =>
      isOngoing(item.status)
    ).length;
    const ongoingDeliverParcelCount = deliver_parcel.filter((item) =>
      isOngoing(item.status)
    ).length;
    const ongoingSendParcelCount = send_parcel.filter((item) =>
      isOngoing(item.status)
    ).length;
    const ongoingJoinRideCount = join_ride.filter((item) =>
      isOngoing(item.status)
    ).length;

    const totalOngoingCount =
      ongoingOfferRideCount +
      ongoingDeliverParcelCount +
      ongoingSendParcelCount +
      ongoingJoinRideCount;

    console.log(
      `✅ [DASHBOARD METRICS SUCCESS] Compiled Order Pipeline successfully. Total Ongoing: ${totalOngoingCount}`
    );

    return res.status(200).json({
      success: true,
      metrics: {
        totalOngoingCount,
        ongoingCounts: {
          offer_ride: ongoingOfferRideCount,
          deliver_parcel: ongoingDeliverParcelCount,
          send_parcel: ongoingSendParcelCount,
          join_ride: ongoingJoinRideCount,
        },
      },
      orders: {
        offer_ride,
        deliver_parcel,
        send_parcel,
        join_ride,
      },
    });
  } catch (error) {
    console.error("💥 [DASHBOARD METRICS CRITICAL ERROR]:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error gathering orders pipeline data.",
    });
  }
};

// ====================== PROFILE PICTURE UPLOAD ONLY ======================
const updateProfilePicture = async (req, res) => {
  try {
    const user = await Padiman_Route_User.findById(req.user);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Block updating profile picture if driver is approved
    if (user.isDriverApproved || user.isDriver) {
      return res.status(403).json({
        success: false,
        message:
          "Approved drivers cannot update their profile picture. Your photo is synchronized with your verified identity photo.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file uploaded",
      });
    }

    console.log(`📸 Uploading new profile picture for user: ${user._id}`);

    // Upload to Backblaze B2
    const imageUrl = await uploadToBackblaze(
      req.file.buffer,
      req.file.originalname,
      "profile-images" // Folder in Backblaze
    );

    // Update user profile image
    user.profileImage = imageUrl;
    await user.save();

    console.log("✅ Profile picture updated successfully:", imageUrl);

    res.status(200).json({
      success: true,
      message: "Profile picture updated successfully",
      profileImage: imageUrl,
      user: {
        _id: user._id,
        fullName: user.fullName,
        profileImage: user.profileImage,
      },
    });
  } catch (error) {
    console.error("❌ Update Profile Picture Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to upload profile picture",
      error: error.message,
    });
  }
};

const getUserAllRequests = async (req, res) => {
  try {
    const userId = req.user; // From auth middleware

    console.log(`🔍 [FETCH REQUESTS] For user: ${userId}`);

    // 1. Fetch all requests in parallel
    const [parcels, joinRides, parcelRequests, rideOffers] = await Promise.all([
      Parcel.find({ requestedBy: userId }).sort({ createdAt: -1 }),
      JoinRide.find({ requestedBy: userId }).sort({ createdAt: -1 }),
      ParcelRequest.find({ user: userId }).sort({ createdAt: -1 }),
      RideOffer.find({ driver: userId }).sort({ createdAt: -1 }),
    ]);

    console.log(
      `📊 [RAW COUNTS] Parcels: ${parcels.length}, JoinRides: ${joinRides.length}, ParcelRequests: ${parcelRequests.length}, RideOffers: ${rideOffers.length}`
    );

    // ====================== 72 HOURS EXPIRATION LOGIC ======================
    const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
    console.log(`⏰ [EXPIRATION CHECK] 72hrs ago: ${seventyTwoHoursAgo}`);

    const expireIfNeeded = async (item, model) => {
      if (!item) return item;

      const status = item.status?.toLowerCase() || "";
      const isPending = status.includes("pending") || status === "ride pending";

      if (isPending && item.createdAt < seventyTwoHoursAgo) {
        console.log(
          `🕒 [AUTO EXPIRE] ${item._id} (${model.modelName}) - Pending >72hrs → Expired`
        );

        // Update in database
        await model.findByIdAndUpdate(
          item._id,
          { status: "expired" },
          { new: true }
        );

        // Update the in-memory object
        item.status = "expired";
      }
      return item;
    };

    // Apply expiration check + update for each type
    for (const p of parcels) await expireIfNeeded(p, Parcel);
    for (const j of joinRides) await expireIfNeeded(j, JoinRide);
    for (const pr of parcelRequests) await expireIfNeeded(pr, ParcelRequest);
    for (const ro of rideOffers) await expireIfNeeded(ro, RideOffer);

    // 2. Collect all possible service IDs (safe check)
    const allServiceIds = [
      ...parcels.map((p) => p._id.toString()),
      ...joinRides.map((j) => j._id.toString()),
      ...parcelRequests.map((pr) => pr._id.toString()),
      ...rideOffers.map((ro) => ro._id.toString()),
    ].filter(Boolean);

    let negotiations = [];

    // 3. Fetch related negotiations safely
    if (allServiceIds.length > 0) {
      negotiations = await Negotiation.find({
        $or: [
          { service: { $in: allServiceIds } },
          { negotiatorService: { $in: allServiceIds } },
        ],
      }).sort({ updatedAt: -1 });
    }

    console.log(`🤝 [NEGOTIATIONS FOUND] Total: ${negotiations.length}`);

    // 4. Create status map (serviceId → latest negotiation)
    const statusMap = new Map();

    negotiations.forEach((neg) => {
      const serviceId =
        neg.service?.toString() || neg.negotiatorService?.toString();
      if (serviceId) {
        const existing = statusMap.get(serviceId);
        if (!existing || neg.updatedAt > existing.updatedAt) {
          statusMap.set(serviceId, {
            status: neg.status,
            updatedAt: neg.updatedAt,
          });
        }
      }
    });

    console.log(
      `📌 [STATUS MAP CREATED] ${statusMap.size} services synced from negotiations`
    );

    // 5. Format dates + Sync latest status from Negotiation
    const formatAndSyncStatus = (item) => {
      if (!item) return null;

      const formatted = formatRequestDates(item);
      const itemId = item._id?.toString();

      if (itemId && statusMap.has(itemId)) {
        const negData = statusMap.get(itemId);
        console.log(
          `🔄 [STATUS SYNC] ${itemId} (${
            item.constructor?.modelName || "Unknown"
          }) → ${negData.status}`
        );
        formatted.status = negData.status;
      }

      return formatted;
    };

    const formattedParcels = parcels.map(formatAndSyncStatus).filter(Boolean);
    const formattedJoinRides = joinRides
      .map(formatAndSyncStatus)
      .filter(Boolean);
    const formattedParcelRequests = parcelRequests
      .map(formatAndSyncStatus)
      .filter(Boolean);
    const formattedRideOffers = rideOffers
      .map(formatAndSyncStatus)
      .filter(Boolean);

    const total =
      formattedParcels.length +
      formattedJoinRides.length +
      formattedParcelRequests.length +
      formattedRideOffers.length;

    console.log(`✅ [FINAL RESPONSE] Total requests: ${total}`);

    res.status(200).json({
      success: true,
      data: {
        parcels: formattedParcels,
        joinRides: formattedJoinRides,
        parcelRequests: formattedParcelRequests,
        rideOffers: formattedRideOffers,
        total: total,
      },
    });
  } catch (error) {
    console.error("💥 [Get user all requests error]:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user requests",
    });
  }
};

const getRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Request ID is required",
      });
    }

    if (!type) {
      return res.status(400).json({
        success: false,
        message: "Please provide a 'type' query parameter",
      });
    }

    let requestData = null;
    let modelName = "";
    let changesMade = false;

    const lowerType = type.toLowerCase();

    // 1. Fetch data based on type
    switch (lowerType) {
      case "parcel":
        requestData = await Parcel.findById(id).populate(
          "requestedBy",
          "fullName email phone"
        );
        modelName = "Parcel";
        break;

      case "joinride":
        requestData = await JoinRide.findById(id).populate(
          "requestedBy",
          "fullName email phone"
        );
        modelName = "JoinRide";
        break;

      case "parcelrequest":
        requestData = await ParcelRequest.findById(id)
          .populate("user", "fullName email phone")
          .populate("negotiations");
        modelName = "ParcelRequest";
        break;

      case "rideoffer":
        requestData = await RideOffer.findById(id)
          .populate("driver", "fullName email phone")
          .populate("negotiations");
        modelName = "RideOffer";
        break;

      default:
        return res.status(400).json({
          success: false,
          message:
            "Invalid type. Use: parcel, joinride, parcelrequest, or rideoffer",
        });
    }

    if (!requestData) {
      return res.status(404).json({
        success: false,
        message: `${modelName} not found`,
      });
    }

    // 2. Generate and attach pickup codes conditionally based on model type
    if (lowerType === "parcel") {
      if (!requestData.parties) {
        requestData.parties = { sender: {}, recipient: {} };
      }
      if (!requestData.parties.sender) requestData.parties.sender = {};
      if (!requestData.parties.recipient) requestData.parties.recipient = {};

      if (!requestData.parties.sender.pickupCode) {
        const code = generatePickupCode(
          requestData.parties.sender.fullName || "",
          requestData.parties.recipient.fullName || ""
        );
        requestData.set("parties.sender.pickupCode", code);
        changesMade = true;
      }

      if (!requestData.parties.recipient.pickupCode) {
        const code = generatePickupCode(
          requestData.parties.sender.fullName || "",
          requestData.parties.recipient.fullName || ""
        );
        requestData.set("parties.recipient.pickupCode", code);
        changesMade = true;
      }

      if (changesMade) {
        requestData.markModified("parties");
      }
    } else if (lowerType === "joinride") {
      if (!requestData.pickupCode) {
        const code = generatePickupCode("", "");
        requestData.set("pickupCode", code);
        changesMade = true;
      }
    }

    // 3. Save updates back to database if codes were generated
    if (changesMade) {
      await requestData.save();
    }

    // 4. Debug Console Logging for generated codes
    if (lowerType === "parcel") {
      console.warn(
        "--- [PARCEL LOG] ---",
        JSON.stringify(
          {
            parcelId: requestData._id,
            senderPickupCode: requestData.parties?.sender?.pickupCode,
            recipientPickupCode: requestData.parties?.recipient?.pickupCode,
          },
          null,
          2
        )
      );
    } else if (lowerType === "joinride") {
      console.warn(
        "--- [JOINRIDE LOG] ---",
        JSON.stringify(
          {
            rideId: requestData._id,
            ridePickupCode: requestData.pickupCode,
          },
          null,
          2
        )
      );
    }

    // 5. Convert document to plain object
    const plainData = requestData.toObject();

    // Format dates before sending response
    const formattedData = formatRequestDates(plainData);

    return res.status(200).json({
      success: true,
      data: formattedData,
    });
  } catch (error) {
    console.error("Get request by ID error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching request",
    });
  }
};

// ====================== DATE FORMATTER ======================
const formatRequestDates = (obj) => {
  if (!obj) return obj;

  const data = obj.toObject ? obj.toObject() : { ...obj };

  const formatDate = (dateInput, fieldName = "") => {
    if (!dateInput) return null;

    let d;

    if (dateInput instanceof Date) {
      d = dateInput;
    } else if (typeof dateInput === "string") {
      d = new Date(dateInput);

      if (isNaN(d.getTime())) {
        let cleaned = dateInput.trim();
        cleaned = cleaned.replace(" ", "T");
        cleaned = cleaned.replace(/\.000Z?$/, "");
        cleaned = cleaned.split("+")[0];

        d = new Date(cleaned);
      }
    } else if (typeof dateInput === "number") {
      d = new Date(dateInput);
    } else {
      d = new Date(dateInput);
    }

    if (isNaN(d.getTime())) {
      console.error(
        `[DATE ERROR] Invalid date for field "${fieldName}":`,
        dateInput
      );
      return dateInput;
    }

    const dayName = d.toLocaleDateString("en-US", { weekday: "long" });
    const monthName = d.toLocaleDateString("en-US", { month: "long" });
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12 || 12;

    const day = d.getDate();
    const ordinal = (n) => {
      if (n > 3 && n < 21) return "th";
      switch (n % 10) {
        case 1:
          return "st";
        case 2:
          return "nd";
        case 3:
          return "rd";
        default:
          return "th";
      }
    };

    return `${dayName} ${hours}:${minutes}${ampm} ${day}${ordinal(
      day
    )} ${monthName} ${year}`;
  };

  const dateFields = [
    "createdAt",
    "updatedAt",
    "departureTime",
    "dispatchDateStart",
    "dispatchDateEnd",
    "pickupTime",
    "deliveryTime",
    "date",
    "rideDate",
    "startDate",
    "endDate",
    "availableFrom",
    "availableUntil",
  ];

  dateFields.forEach((field) => {
    if (data[field]) {
      data[field] = formatDate(data[field], field);
    }
  });

  if (data.negotiations && Array.isArray(data.negotiations)) {
    data.negotiations = data.negotiations.map((neg, index) => {
      if (neg.createdAt)
        neg.createdAt = formatDate(
          neg.createdAt,
          `negotiations[${index}].createdAt`
        );
      if (neg.updatedAt)
        neg.updatedAt = formatDate(
          neg.updatedAt,
          `negotiations[${index}].updatedAt`
        );
      if (neg.date)
        neg.date = formatDate(neg.date, `negotiations[${index}].date`);
      return neg;
    });
  }

  if (data.route && typeof data.route === "object") {
    Object.keys(data.route).forEach((key) => {
      if (/date|time/i.test(key) && data.route[key]) {
        data.route[key] = formatDate(data.route[key], `route.${key}`);
      }
    });
  }

  return data;
};

// ====================== APP UPDATES / VERSIONING ======================
const getAppUpdates = async (req, res) => {
  try {
    const appUpdate = {
      currentVersion: "1.2.4",
      latestVersion: "1.2.5",
      isUpdateAvailable: false,
      forceUpdate: false,
      updateTitle: "New Features & Improvements",
      updateDescription: `
• Improved receipt sharing experience
• Better request filtering (unknown pickups removed)
• Enhanced dark mode consistency
• Faster loading on My Requests screen
• Bug fixes and performance improvements
      `.trim(),
      releaseDate: "June 16, 2026",
      links: {
        android:
          "https://play.google.com/store/apps/details?id=com.padimanroute",
        ios: "https://apps.apple.com/app/padiman-route/idYOUR_APP_ID",
      },
    };

    res.status(200).json({
      success: true,
      data: appUpdate,
      message: "App update information retrieved successfully",
    });
  } catch (error) {
    console.error("Get app updates error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch app updates",
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  deleteAccount,
  logout,
  saveExpoPushToken,
  updateProfilePicture,
  getUserDashboardOrders,
  getUserAllRequests,
  getRequestById,
  getAppUpdates,
};

