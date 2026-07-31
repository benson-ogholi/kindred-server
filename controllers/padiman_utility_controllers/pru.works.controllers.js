const Work = require("../../models/padiman_utility_models/Work");
const PRUtility = require("../../models/padiman_utility_models/PRUtility");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");
const Requesting = require("../../models/padiman_utility_models/Requesting");

// ==========================================
// 1. CREATE WORK CONTROLLER
// ==========================================
const createWork = async (req, res) => {
  try {
    const user = await PRUtility.findById(req.user.id || req.user._id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const {
      jobTitle,
      category,
      customCategory,
      startingPrice,
      jobDescription,
      links,
      meta,
      country,
      state,
      city,
      age,
      qualifications,
      benefits,
    } = req.body;

    const imageUrls = [];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const url = await uploadToBackblaze(
          file.buffer,
          file.originalname,
          "works"
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

    const newWork = await Work.create({
      workman: user._id,
      jobTitle,
      category,
      customCategory: category === "Others" ? customCategory : undefined,
      startingPrice:
        startingPrice !== undefined && startingPrice !== ""
          ? Number(startingPrice)
          : undefined,
      jobDescription,
      imagesOfPreviousJobs: imageUrls,
      contactEmail: user.email,
      contactPhone: user.phone,
      links: parseJSONField(links, []),
      meta: parseJSONField(meta, {}),
      country,
      state,
      city,
      age: age ? Number(age) : undefined,
      qualifications: parseJSONField(qualifications, []),
      benefits: parseJSONField(benefits, []),
    });

    res.status(201).json({
      success: true,
      message: "Work created successfully",
      work: newWork,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================================
// 2. GET ALL WORKS FOR LOGGED-IN WORKMAN
// ==========================================
const getMyWorks = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const rawWorks = await Work.find({ workman: userId })
      .populate("workman", "fullName username email phone profilePicture")
      .sort({ createdAt: -1 });

    const works = rawWorks.map((work) => {
      const workObj = work.toObject();
      return {
        ...workObj,
        isOwner: true,
      };
    });

    return res.status(200).json({
      success: true,
      count: works.length,
      works,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================================
// 3. GET ALL AVAILABLE WORKS (PUBLIC)
// ==========================================
const getAvailableWorks = async (req, res) => {
  try {
    const currentUserId = req.user ? req.user.id || req.user._id : null;
    const rawWorks = await Work.find({ isPaused: false })
      .populate({
        path: "workman",
        model: "PRUtility",
        match: { isAvailable: true }, // 1. Only populate if the workman is available
        // Added 'gender' to the selected fields
        select: "fullName username email phone profilePicture city isAvailable gender",
      })
      .sort({ createdAt: -1 });

    const works = rawWorks
      .filter((work) => work.workman !== null) // 2. Filter out works where the workman did not match the availability check
      .map((work) => {
        const workObj = work.toObject();
        const workmanId =
          workObj.workman?._id?.toString() || workObj.workman?.toString();
        const isCreatorOwner = currentUserId
          ? workmanId === currentUserId.toString()
          : false;

        return {
          ...workObj,
          isOwner: isCreatorOwner,
          fullName: workObj.workman?.fullName || null,
          workmanName: workObj.workman?.fullName || null,
          // Map gender to the top level for easy access if needed
          gender: workObj.workman?.gender || null,
        };
      });

    return res.status(200).json({
      success: true,
      count: works.length,
      works,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
// ==========================================
// 4. GET SINGLE WORK BY ID
// ==========================================
const getWorkById = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const workId = req.params.id;

    const work = await Work.findById(workId).populate("workman", "fullName username email phone profilePicture isAvailable city");

    if (!work) {
      return res.status(404).json({ success: false, message: "Work not found" });
    }

    const isOwner = work.workman._id.toString() === userId.toString();

    // Check if a request already exists between this user and this work item
    const existingRequest = await Requesting.findOne({
      targetItem: workId,
      $or: [{ requester: userId }, { requested: userId }]
    });

    // Check if the current user is the one who made the request (requester)
    const isHiring = existingRequest ? existingRequest.requester.toString() === userId.toString() : false;

    return res.status(200).json({
      success: true,
      work: {
        ...work.toObject(),
        isOwner,
        existingRequest: existingRequest ? existingRequest._id : null,
        isHiring
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================================
// 5. UPDATE WORK CONTROLLER
// ==========================================
// ==========================================
// 5. UPDATE WORK CONTROLLER
// ==========================================
const updateWork = async (req, res) => {
  try {
    const {
      jobTitle,
      category,
      customCategory,
      startingPrice,
      jobDescription,
      contactEmail,
      contactPhone,
      links,
      meta,
      country,
      state,
      city,
      age,
      qualifications,
      benefits,
      isPaused,
    } = req.body;

    const updateData = {
      jobTitle,
      category,
      customCategory: category === "Others" ? customCategory : undefined,
      startingPrice:
        startingPrice !== undefined && startingPrice !== ""
          ? Number(startingPrice)
          : undefined,
      jobDescription,
      contactEmail: contactEmail ? contactEmail.trim().toLowerCase() : undefined,
      contactPhone: contactPhone ? contactPhone.trim() : undefined,
      country,
      state,
      city,
      age: age ? Number(age) : undefined,
    };

    if (isPaused !== undefined) updateData.isPaused = isPaused;

    if (links) {
      updateData.links =
        typeof links === "string" ? JSON.parse(links) : links;
    }
    if (meta) {
      updateData.meta = typeof meta === "string" ? JSON.parse(meta) : meta;
    }
    if (qualifications) {
      updateData.qualifications =
        typeof qualifications === "string"
          ? JSON.parse(qualifications)
          : qualifications;
    }
    if (benefits) {
      updateData.benefits =
        typeof benefits === "string" ? JSON.parse(benefits) : benefits;
    }

    if (req.files && req.files.length > 0) {
      const imageUrls = [];
      for (const file of req.files) {
        const url = await uploadToBackblaze(
          file.buffer,
          file.originalname,
          "works"
        );
        imageUrls.push(url);
      }
      updateData.imagesOfPreviousJobs = imageUrls;
    }

    const updatedWork = await Work.findOneAndUpdate(
      { _id: req.params.id, workman: req.user.id || req.user._id },
      updateData,
      { new: true }
    );

    if (!updatedWork) {
      return res
        .status(404)
        .json({ success: false, message: "Work not found or unauthorized" });
    }

    res.status(200).json({
      success: true,
      message: "Work updated successfully",
      work: updatedWork,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================================
// 6. TOGGLE PAUSE / UNPAUSE WORK
// ==========================================
const togglePauseWork = async (req, res) => {
  try {
    const work = await Work.findOne({
      _id: req.params.id,
      workman: req.user.id || req.user._id,
    });

    if (!work) {
      return res
        .status(404)
        .json({ success: false, message: "Work not found or unauthorized" });
    }

    work.isPaused = !work.isPaused;
    await work.save();

    res.status(200).json({
      success: true,
      message: `Work successfully ${work.isPaused ? "paused" : "unpaused"}`,
      work,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ==========================================
// 7. DELETE WORK CONTROLLER
// ==========================================
const deleteWork = async (req, res) => {
  try {
    const work = await Work.findOneAndDelete({
      _id: req.params.id,
      workman: req.user.id || req.user._id,
    });

    if (!work) {
      return res
        .status(404)
        .json({ success: false, message: "Work not found or unauthorized" });
    }

    res.status(200).json({
      success: true,
      message: "Work deleted successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  createWork,
  getMyWorks,
  getAvailableWorks,
  getWorkById,
  updateWork,
  togglePauseWork,
  deleteWork,
};
