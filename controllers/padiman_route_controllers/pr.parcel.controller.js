const JoinRide = require("../../models/padiman_route_models/JoinRide");
const Parcel = require("../../models/padiman_route_models/Parcel");
const { generatePickupCode } = require("../../utils/generatePickupCode");

exports.createParcelBooking = async (req, res) => {
  try {
    const { parties, ...restData } = req.body;

    if (!parties?.sender?.fullName || !parties?.recipient?.fullName) {
      return res.status(400).json({
        success: false,
        message: "Both sender and recipient full names are required.",
      });
    }

    // Generate pickup code for recipient
    const recipientPickupCode = generatePickupCode(
      parties.sender.fullName,
      parties.recipient.fullName
    );

    const parcelData = {
      ...restData,
      requestedBy: req.user,
      parties: {
        sender: {
          ...parties.sender,
          pickupCode: null, // Optional for sender
        },
        recipient: {
          ...parties.recipient,
          pickupCode: recipientPickupCode, // ← Generated here
        },
      },
    };

    const newParcel = await Parcel.create(parcelData);

    console.log(
      `[BOOKING] New parcel booked by: ${req.user} | Recipient Code: ${recipientPickupCode}`
    );

    res.status(201).json({
      success: true,
      message: "Parcel booked successfully.",
      data: newParcel,
      recipientPickupCode, // Return code to frontend
    });
  } catch (error) {
    console.error("[BOOKING ERROR]", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.createJoinRide = async (req, res) => {
  console.log(`🚀 [JOIN RIDE CREATION] Initialized by User: ${req.user}`);

  try {
    const userId = req.user;
    const { route, schedule, notes, senderName, recipientName } = req.body; // Add these from frontend

    // 1. Structural Validation
    if (!route || !route.pickupAddress || !route.deliveryAddress) {
      return res.status(400).json({
        success: false,
        message: "Both pickup and delivery addresses are required.",
      });
    }

    if (!schedule || !schedule.type) {
      return res.status(400).json({
        success: false,
        message: "Schedule type is required.",
      });
    }

    // Generate Pickup Code (scrambled letters + random number)
    const pickupCode = generatePickupCode(
      senderName || "",
      recipientName || ""
    );

    // 2. Schedule Date Parsing
    let parsedDate = new Date();
    if (schedule.date) {
      parsedDate = new Date(schedule.date);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid schedule date format.",
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
      pickupCode, // ← Generated here
      schedule: {
        type: schedule.type,
        date: parsedDate,
      },
      notes: notes || "",
      status: "pending",
    });

    // 4. Save
    const savedJoinRide = await newJoinRide.save();

    console.log(
      `✅ [JOIN RIDE CREATED] ID: ${savedJoinRide._id} | Pickup Code: ${pickupCode}`
    );

    return res.status(201).json({
      success: true,
      message: "Ride request created successfully.",
      data: savedJoinRide,
      pickupCode, // Return to frontend
    });
  } catch (error) {
    console.error("💥 [JOIN RIDE ERROR]:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
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
  // Destructure both id and type from params
  try {
    const { type, id } = req.params;
    let changesMade = false;
    let document = null;

    // Standardize type string to lower case to prevent casing issues (e.g., 'Parcel' vs 'parcel')
    const normalizedType = type?.toLowerCase();

    // 1. Fetch from the specific collection based on the route parameter type
    if (normalizedType === "parcel") {
      document = await Parcel.findOne({ _id: id, requestedBy: req.user });
    } else if (normalizedType === "joinride" || normalizedType === "ride") {
      document = await JoinRide.findOne({ _id: id, requestedBy: req.user });
    } else {
      // Handle edge case where a completely invalid type string is passed
      return res.status(400).json({
        success: false,
        message: "Invalid type parameter. Must be 'parcel' or 'joinride'.",
      });
    }

    // 2. If item doesn't exist or user isn't authorized
    if (!document) {
      console.warn(
        `[NOT FOUND] ${type} with ID: ${id} not found or unauthorized for user: ${
          req.user?._id || req.user
        }`
      );
      return res.status(404).json({
        success: false,
        message: `${type} not found or unauthorized access`,
      });
    }

    // 3. Handle logic if the item is a PARCEL
    if (normalizedType === "parcel") {
      if (!document.parties) {
        document.parties = { sender: {}, recipient: {} };
      }
      if (!document.parties.sender) document.parties.sender = {};
      if (!document.parties.recipient) document.parties.recipient = {};

      if (!document.parties.sender.pickupCode) {
        const code = generatePickupCode(
          document.parties.sender.fullName || "",
          document.parties.recipient.fullName || ""
        );
        document.set("parties.sender.pickupCode", code);
        changesMade = true;
      }

      if (!document.parties.recipient.pickupCode) {
        const code = generatePickupCode(
          document.parties.sender.fullName || "",
          document.parties.recipient.fullName || ""
        );
        document.set("parties.recipient.pickupCode", code);
        changesMade = true;
      }

      if (changesMade) {
        document.markModified("parties");
      }
    }
    // 4. Handle logic if the item is a JOINRIDE
    else {
      if (!document.pickupCode) {
        const code = generatePickupCode("", "");
        document.set("pickupCode", code);
        changesMade = true;
      }
    }

    // 5. Save if any new codes were generated
    if (changesMade) {
      await document.save();
    }

    // Convert document to a clean JavaScript object for guaranteed JSON serialization
    const responseData = document.toObject();

    // 6. Detailed Console Logging
    if (normalizedType === "parcel") {
      console.warn(
        "--- [PARCEL LOG] ---",
        JSON.stringify(
          {
            parcelId: responseData._id,
            senderPickupCode: responseData.parties?.sender?.pickupCode,
            recipientPickupCode: responseData.parties?.recipient?.pickupCode,
          },
          null,
          2
        )
      );
    } else {
      console.warn(
        "--- [JOINRIDE LOG] ---",
        JSON.stringify(
          {
            rideId: responseData._id,
            ridePickupCode: responseData.pickupCode,
          },
          null,
          2
        )
      );
    }

    // Return the response data safely
    return res.status(200).json({ success: true, data: responseData });
  } catch (error) {
    console.error("[GET SINGLE ITEM ERROR]", error);

    if (error.kind === "ObjectId") {
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });
    }

    return res.status(500).json({ success: false, message: "Server error" });
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
