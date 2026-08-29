const HireEquipment = require("../../models/padiman_utility_models/HireEquipment");
const PRUtility = require("../../models/padiman_utility_models/PRUtility");
const Requesting = require("../../models/padiman_utility_models/Requesting");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");

// ==========================================
// 1. CREATE HIRE EQUIPMENT CONTROLLER
// ==========================================
const createHireEquipment = async (req, res) => {
  try {
    const user = await PRUtility.findById(req.user.id || req.user._id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const {
      equipmentTitle,
      category,
      customCategory,
      modelYear,
      color,
      notes,
      hiringPrice,
      pricePerUnit,
      plateNumber,
      registrationDocumentsComplete,
      country,
      state,
      city,
      meta,
    } = req.body;

    const imageUrls = [];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const url = await uploadToBackblaze(
          file.buffer,
          file.originalname,
          "equipment"
        );
        imageUrls.push(url);
      }
    }

    const parseJSONField = (field, fallback) => {
      if (typeof field === "string") {
        try {
          return JSON.parse(field);
        } catch (e) {
          return fallback;
        }
      }
      return field || fallback;
    };

    const newEquipment = await HireEquipment.create({
      owner: user._id,
      equipmentTitle,
      category,
      customCategory: category === "Others" ? customCategory : undefined,
      modelYear: modelYear ? Number(modelYear) : undefined,
      color,
      images: imageUrls,
      notes,
      hiringPrice: Number(hiringPrice),
      pricePerUnit: pricePerUnit || "day",
      plateNumber,
      registrationDocumentsComplete:
        registrationDocumentsComplete === true ||
        registrationDocumentsComplete === "true",
      contactEmail: user.email,
      contactPhone: user.phone,
      country,
      state,
      city,
      meta: parseJSONField(meta, {}),
    });

    res.status(201).json({
      success: true,
      message: "Equipment listed for hire successfully",
      equipment: newEquipment,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================================
// 2. GET ALL EQUIPMENT FOR LOGGED-IN OWNER
// ==========================================
const getMyHireEquipment = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const rawEquipment = await HireEquipment.find({ owner: userId })
      .populate("owner", "fullName username email phone profilePicture")
      .sort({ createdAt: -1 });

    const equipmentList = rawEquipment.map((item) => {
      const itemObj = item.toObject();
      return {
        ...itemObj,
        isOwner: true,
      };
    });

    return res.status(200).json({
      success: true,
      count: equipmentList.length,
      equipment: equipmentList,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================================
// 3. GET ALL AVAILABLE HIRE EQUIPMENT (PUBLIC)
// ==========================================
const getAvailableHireEquipment = async (req, res) => {
  try {
    const currentUserId = req.user ? req.user.id || req.user._id : null;

    const rawEquipment = await HireEquipment.find()
      .populate({
        path: "owner",
        model: "PRUtility",
        match: { isAvailable: true },
        select:
          "fullName username email phone profilePicture city isAvailable gender",
      })
      .sort({ createdAt: -1 });

    const equipmentList = rawEquipment
      .filter((item) => {
        // Drop items whose owner is unavailable (populate match failed)
        if (item.owner === null) return false;

        // Drop equipment listed by the currently logged-in user
        if (currentUserId) {
          const ownerId = item.owner?._id?.toString() || item.owner?.toString();
          if (ownerId === currentUserId.toString()) return false;
        }

        return true;
      })
      .map((item) => {
        const itemObj = item.toObject();

        return {
          ...itemObj,
          isOwner: false, // always false here since we filtered out own listings
          fullName: itemObj.owner?.fullName || null,
          ownerName: itemObj.owner?.fullName || null,
        };
      });

    return res.status(200).json({
      success: true,
      count: equipmentList.length,
      equipment: equipmentList,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
// ==========================================
// 4. GET SINGLE HIRE EQUIPMENT BY ID
// ==========================================
const getHireEquipmentById = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const equipmentId = req.params.id;

    const equipment = await HireEquipment.findById(equipmentId).populate(
      "owner",
      "fullName username email phone profilePicture city isAvailable"
    );

    if (!equipment) {
      return res
        .status(404)
        .json({ success: false, message: "Equipment not found" });
    }

    const equipmentObj = equipment.toObject();
    const ownerId =
      equipmentObj.owner?._id?.toString() || equipmentObj.owner?.toString();
    const isCreatorOwner = ownerId === userId.toString();

    // Check if a request already exists for this equipment item involving this user
    const existingRequest = await Requesting.findOne({
      targetItem: equipmentId,
      $or: [{ requester: userId }, { requested: userId }],
    });

    // Check if the current user is the one who made the request (requester)
    const isHiring = existingRequest
      ? existingRequest.requester.toString() === userId.toString()
      : false;

    const responseEquipment = {
      ...equipmentObj,
      isOwner: isCreatorOwner,
      existingRequest: existingRequest ? existingRequest._id : null,
      isHiring: true,
    };

    return res
      .status(200)
      .json({ success: true, equipment: responseEquipment });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================================
// 5. UPDATE HIRE EQUIPMENT CONTROLLER
// ==========================================
const updateHireEquipment = async (req, res) => {
  try {
    const {
      equipmentTitle,
      category,
      customCategory,
      modelYear,
      color,
      notes,
      hiringPrice,
      pricePerUnit,
      plateNumber,
      registrationDocumentsComplete,
      contactEmail,
      contactPhone,
      country,
      state,
      city,
      meta,
      isPaused,
    } = req.body;

    const updateData = {
      equipmentTitle,
      category,
      customCategory: category === "Others" ? customCategory : undefined,
      modelYear: modelYear ? Number(modelYear) : undefined,
      color,
      notes,
      hiringPrice: hiringPrice !== undefined ? Number(hiringPrice) : undefined,
      pricePerUnit,
      plateNumber,
      registrationDocumentsComplete:
        registrationDocumentsComplete !== undefined
          ? registrationDocumentsComplete === true ||
            registrationDocumentsComplete === "true"
          : undefined,
      contactEmail: contactEmail
        ? contactEmail.trim().toLowerCase()
        : undefined,
      contactPhone: contactPhone ? contactPhone.trim() : undefined,
      country,
      state,
      city,
    };

    if (isPaused !== undefined) updateData.isPaused = isPaused;

    if (meta) {
      updateData.meta = typeof meta === "string" ? JSON.parse(meta) : meta;
    }

    if (req.files && req.files.length > 0) {
      const imageUrls = [];
      for (const file of req.files) {
        const url = await uploadToBackblaze(
          file.buffer,
          file.originalname,
          "equipment"
        );
        imageUrls.push(url);
      }
      updateData.images = imageUrls;
    }

    const updatedEquipment = await HireEquipment.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id || req.user._id },
      updateData,
      { new: true }
    );

    if (!updatedEquipment) {
      return res.status(404).json({
        success: false,
        message: "Equipment not found or unauthorized",
      });
    }

    res.status(200).json({
      success: true,
      message: "Equipment updated successfully",
      equipment: updatedEquipment,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================================
// 6. TOGGLE PAUSE / UNPAUSE EQUIPMENT
// ==========================================
const togglePauseHireEquipment = async (req, res) => {
  try {
    const equipment = await HireEquipment.findOne({
      _id: req.params.id,
      owner: req.user.id || req.user._id,
    });

    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: "Equipment not found or unauthorized",
      });
    }

    equipment.isPaused = !equipment.isPaused;
    await equipment.save();

    res.status(200).json({
      success: true,
      message: `Equipment successfully ${
        equipment.isPaused ? "paused" : "unpaused"
      }`,
      equipment,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================================
// 7. DELETE HIRE EQUIPMENT CONTROLLER
// ==========================================
const deleteHireEquipment = async (req, res) => {
  try {
    const equipment = await HireEquipment.findOneAndDelete({
      _id: req.params.id,
      owner: req.user.id || req.user._id,
    });

    if (!equipment) {
      return res.status(404).json({
        success: false,
        message: "Equipment not found or unauthorized",
      });
    }

    res.status(200).json({
      success: true,
      message: "Equipment deleted successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  createHireEquipment,
  getMyHireEquipment,
  getAvailableHireEquipment,
  getHireEquipmentById,
  updateHireEquipment,
  togglePauseHireEquipment,
  deleteHireEquipment,
};
