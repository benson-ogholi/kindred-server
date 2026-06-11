const JoinRide = require("../../models/padiman_route_models/JoinRide");
const Parcel = require("../../models/padiman_route_models/Parcel");

exports.createParcelBooking = async (req, res) => {
  try {
    const parcelData = {
      ...req.body,
      requestedBy: req.user,
    };

    const newParcel = await Parcel.create(parcelData);

    console.log(`[BOOKING] New parcel booked by: ${req.user}`);
    res.status(201).json({ success: true, data: newParcel });
  } catch (error) {
    console.error("[BOOKING ERROR]", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.createJoinRide = async (req, res) => {
  console.log(`🚀 [JOIN RIDE CREATION] Initialized by User: ${req.user}`);

  try {
    const userId = req.user; // Set via your authentication middleware
    const { route, schedule, notes } = req.body;

    // 1. Structural Validation
    if (!route || !route.pickupAddress || !route.deliveryAddress) {
      return res.status(400).json({
        success: false,
        message:
          "Missing complete routing parameters. Both pickup and delivery addresses are required.",
      });
    }

    if (!schedule || !schedule.type) {
      return res.status(400).json({
        success: false,
        message: "Schedule type (e.g., 'immediate', 'scheduled') is required.",
      });
    }

    // 2. Schedule Date Parsing safely
    let parsedDate = new Date(); // Fallback default to 'now' for immediate booking
    if (schedule.date) {
      parsedDate = new Date(schedule.date);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Provided schedule date string is an invalid ISO format.",
        });
      }
    }

    // 3. Document Instantiation
    const newJoinRide = new JoinRide({
      requestedBy: userId,
      route: {
        pickupAddress: route.pickupAddress,
        deliveryAddress: route.deliveryAddress,
      },
      schedule: {
        type: schedule.type,
        date: parsedDate,
      },
      notes: notes || "",
      status: "pending", // Schema fallback safety assurance
    });

    // 4. Persistence Execution
    const savedJoinRide = await newJoinRide.save();

    console.log(
      `✅ [JOIN RIDE CREATED SUCCESS]: Node Registered with ID ${savedJoinRide._id}`
    );

    return res.status(201).json({
      success: true,
      message: "Ride Request logged successfully.",
      data: savedJoinRide,
    });
  } catch (error) {
    console.error("💥 [JOIN RIDE CRITICAL FAILURE]:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error registering your ride lane request.",
    });
  }
};

exports.getUserParcels = async (req, res) => {
  try {
    const parcels = await Parcel.find({ requestedBy: req.user }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: parcels.length,
      data: parcels,
    });
  } catch (error) {
    console.error("[GET ALL PARCELS ERROR]", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getParcelById = async (req, res) => {
  try {
    const parcel = await Parcel.findOne({
      _id: req.params.id,
      requestedBy: req.user,
    });

    if (!parcel) {
      return res.status(404).json({
        success: false,
        message: "Parcel not found or unauthorized access",
      });
    }

    res.status(200).json({ success: true, data: parcel });
  } catch (error) {
    console.error("[GET SINGLE PARCEL ERROR]", error);

    // Handle invalid MongoDB ObjectIDs gracefully
    if (error.kind === "ObjectId") {
      return res
        .status(404)
        .json({ success: false, message: "Parcel not found" });
    }

    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Update a specific parcel (scoped to the owner)
exports.updateParcel = async (req, res) => {
  try {
    // Find the parcel and update it if it belongs to the user
    const parcel = await Parcel.findOneAndUpdate(
      { _id: req.params.id, requestedBy: req.user },
      { $set: req.body },
      { new: true, runValidators: true } // returns the updated document and enforces schema validation
    );

    if (!parcel) {
      return res.status(404).json({
        success: false,
        message: "Parcel not found or unauthorized access",
      });
    }

    console.log(
      `[UPDATE] Parcel ${req.params.id} updated by user: ${req.user}`
    );
    res.status(200).json({ success: true, data: parcel });
  } catch (error) {
    console.error("[UPDATE PARCEL ERROR]", error);
    if (error.kind === "ObjectId") {
      return res
        .status(404)
        .json({ success: false, message: "Parcel not found" });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Delete a specific parcel (scoped to the owner)
exports.deleteParcel = async (req, res) => {
  try {
    const parcel = await Parcel.findOneAndDelete({
      _id: req.params.id,
      requestedBy: req.user,
    });

    if (!parcel) {
      return res.status(404).json({
        success: false,
        message: "Parcel not found or unauthorized access",
      });
    }

    console.log(
      `[DELETE] Parcel ${req.params.id} removed by user: ${req.user}`
    );
    res.status(200).json({
      success: true,
      message: "Parcel booking cancelled and removed successfully",
    });
  } catch (error) {
    console.error("[DELETE PARCEL ERROR]", error);
    if (error.kind === "ObjectId") {
      return res
        .status(404)
        .json({ success: false, message: "Parcel not found" });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};
