const Padiman_Route_User = require("../../models/padiman_route_models/Padiman_Route_User");
const Negotiation = require("../../models/padiman_route_models/Negotiation");
const Parcel_Request = require("../../models/padiman_route_models/Parcel_Request");
const RideOffer = require("../../models/padiman_route_models/RideOffer");
const Parcel = require("../../models/padiman_route_models/Parcel");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");

// GET PROFILE
const getProfile = async (req, res) => {
  const user = await Padiman_Route_User.findById(req.user).select("-password");
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ message: "User not found" });
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
// GET ALL USER ORDERS, LIFECYCLES, AND ONGOING COUNTS
const getUserDashboardOrders = async (req, res) => {
  console.log(
    `📊 [DASHBOARD METRICS] Gathering all activity lanes for User: ${req.user}`
  );

  try {
    const userId = req.user;

    // 1. Fetch data from primary listings schemas concurrently
    const [
      postedRides,
      requestedParcels,
      deliveryParcels,
      customerNegotiations,
    ] = await Promise.all([
      // offer_ride: User is offering a seat in their vehicle
      RideOffer.find({ driver: userId })
        .populate("driver", "fullName phone email profileImage")
        .sort({ createdAt: -1 }),

      // send_parcel: User requested a courier to pick up and send a parcel
      Parcel_Request.find({ user: userId })
        .populate("user", "fullName phone email profileImage")
        .sort({ createdAt: -1 }),

      // deliver_parcel: Active fulfillment / transit state pipelines
      Parcel.find({ requestedBy: userId })
        .populate("requestedBy", "fullName phone email profileImage")
        .sort({ createdAt: -1 }),

      // join_ride: Tracked via child negotiations matching the 'offer_a_ride' paradigm
      Negotiation.find({ negotiator: userId })
        .populate("serviceProvider", "fullName phone email profileImage")
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
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No image file uploaded",
        });
      }
  
      const user = await Padiman_Route_User.findById(req.user);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
  
      console.log(`📸 Uploading new profile picture for user: ${user._id}`);
  
      // Upload to Backblaze B2
      const imageUrl = await uploadToBackblaze(
        req.file.buffer,
        req.file.originalname,
        "profile-images"   // Folder in Backblaze
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



module.exports = {
  getProfile,
  updateProfile,
  deleteAccount,
  logout,
  saveExpoPushToken,
  updateProfilePicture,
  getUserDashboardOrders, // Exported to your route tree configuration files
};
