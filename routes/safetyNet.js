const express = require("express");
const router = express.Router();
const SafetyNet = require("../models/SafetyNet");
const Family = require("../models/Family");
const { protect } = require("../middlewares/authMiddleware");
const { uploadToBackblaze } = require("../utils/uploadToBackblaze");
const multer = require("multer");

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// Helper: owner is now an array
const isUserOwner = (family, userId) => {
  const owners = Array.isArray(family.owner)
    ? family.owner
    : family.owner
    ? [family.owner]
    : [];
  return owners.some((o) => {
    const id = o._id ? o._id.toString() : o.toString();
    return id === userId.toString();
  });
};

/**
 * 🔐 Helper: Check family access (owner array + members)
 */
const hasFamilyAccess = (family, userId) => {
  return (
    isUserOwner(family, userId) ||
    family.members.some((m) => m.toString() === userId.toString())
  );
};

router.post(
  "/:familyId",
  protect,
  upload.fields([
    { name: "images", maxCount: 5 },
    { name: "audios", maxCount: 5 },
    { name: "videos", maxCount: 2 },
  ]),
  async (req, res) => {
    try {
      const { familyId } = req.params;
      const { title, description, triggerDate, assignedUsers, isEditable } =
        req.body;

      const family = await Family.findById(familyId);
      if (
        !family ||
        !description ||
        !hasFamilyAccess(family, req.user._id.toString())
      ) {
        return res
          .status(403)
          .json({ message: "Unauthorized access to family" });
      }

      const processFiles = async (files, folder) => {
        if (!files) return [];
        return Promise.all(
          files.map((file) =>
            uploadToBackblaze(file.buffer, file.originalname, folder)
          )
        );
      };

      const [imageUrls, audioUrls, videoUrls] = await Promise.all([
        processFiles(req.files["images"], "safety-nets/images"),
        processFiles(req.files["audios"], "safety-nets/audios"),
        processFiles(req.files["videos"], "safety-nets/videos"),
      ]);

      const safetyNet = await SafetyNet.create({
        family: familyId,
        createdBy: req.user._id,
        title,
        description,
        imageUrls,
        audioUrls,
        videoUrls,
        assignedUsers: assignedUsers ? JSON.parse(assignedUsers) : [],
        triggerDate,
        isEditable: isEditable !== undefined ? JSON.parse(isEditable) : true,
      });

      res.status(201).json({ message: "Safety Net created", safetyNet });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

router.put(
  "/:id",
  protect,
  upload.fields([
    { name: "images", maxCount: 5 },
    { name: "audios", maxCount: 5 },
    { name: "videos", maxCount: 2 },
  ]),
  async (req, res) => {
    try {
      const net = await SafetyNet.findById(req.params.id);
      if (!net)
        return res.status(404).json({ message: "Safety net not found" });

      const isOwner = net.createdBy.toString() === req.user._id.toString();
      if (!isOwner) {
        return res
          .status(403)
          .json({ message: "Only the creator can edit this" });
      }

      if (net.isEditable === false) {
        return res.status(400).json({
          message:
            "This vault was set to Non-Editable and can no longer be changed.",
        });
      }

      if (new Date(net.triggerDate) <= new Date()) {
        return res.status(400).json({
          message:
            "Cannot edit this vault because its trigger time has passed.",
        });
      }

      const processFiles = async (files, folder) => {
        if (!files) return [];
        return Promise.all(
          files.map((file) =>
            uploadToBackblaze(file.buffer, file.originalname, folder)
          )
        );
      };

      const [newImages, newAudios, newVideos] = await Promise.all([
        processFiles(req.files?.["images"], "safety-nets/images"),
        processFiles(req.files?.["audios"], "safety-nets/audios"),
        processFiles(req.files?.["videos"], "safety-nets/videos"),
      ]);

      let updateFields = { ...req.body };
      if (typeof updateFields.assignedUsers === "string") {
        try {
          updateFields.assignedUsers = JSON.parse(updateFields.assignedUsers);
        } catch (e) {}
      }

      // Append new files if uploaded, or keep existing ones
      if (newImages.length > 0)
        updateFields.imageUrls = [...net.imageUrls, ...newImages];
      if (newAudios.length > 0)
        updateFields.audioUrls = [...net.audioUrls, ...newAudios];
      if (newVideos.length > 0)
        updateFields.videoUrls = [...net.videoUrls, ...newVideos];

      const updatedNet = await SafetyNet.findByIdAndUpdate(
        req.params.id,
        { $set: updateFields },
        { new: true, runValidators: true }
      );

      res.status(200).json({
        message: "Updated successfully",
        safetyNet: updatedNet,
      });
    } catch (error) {
      res.status(500).json({ message: "Update failed", error: error.message });
    }
  }
);

// ---------------------------------------------------------
// 2️⃣ GET ALL SAFETY NETS FOR A FAMILY (Excludes hidden items)
// ---------------------------------------------------------
router.get("/family/:familyId", protect, async (req, res) => {
  const userId = req.user._id;
  const { familyId } = req.params;
  const now = new Date();

  console.log("📂 [GET ALL] Fetching vaults for family:", familyId);

  try {
    await SafetyNet.updateMany(
      {
        family: familyId,
        assignedUsers: userId,
        status: "RELEASED",
        isRead: { $ne: userId },
      },
      { $addToSet: { isRead: userId } }
    );

    const nets = await SafetyNet.find({
      family: familyId,
      hiddenFor: { $ne: userId },
      $or: [{ createdBy: userId }, { triggerDate: { $lte: now } }],
    })
      .populate("createdBy", "-password")
      .populate("assignedUsers", "-password")
      .sort({ createdAt: -1 });

    console.log(`✅ [GET ALL SUCCESS] Found ${nets.length} visible vaults.`);
    res.status(200).json(nets);
  } catch (error) {
    console.error("🔥 [GET ALL ERROR]:", error.message);
    res.status(500).json({ message: "Error fetching safety nets" });
  }
});

// ---------------------------------------------------------
// 7️⃣ GET SINGLE SAFETY NET BY ID
// ---------------------------------------------------------
router.get("/:id", protect, async (req, res) => {
  const userId = req.user._id.toString();
  const now = new Date();

  try {
    const net = await SafetyNet.findById(req.params.id)
      .populate("createdBy", "firstName lastName email avatar")
      .populate("assignedUsers", "firstName lastName email avatar");

    if (!net || net.hiddenFor?.includes(userId)) {
      return res.status(404).json({ message: "Safety net not found" });
    }

    const isCreator = net.createdBy._id.toString() === userId;
    const isAssigned = net.assignedUsers.some(
      (u) => u._id.toString() === userId
    );
    const isTriggered = new Date(net.triggerDate) <= now;

    if (!isCreator && !isAssigned) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    if (!isCreator && !isTriggered) {
      return res.status(403).json({
        message: "This vault is sealed until the trigger date.",
        unlockDate: net.triggerDate,
      });
    }

    res.status(200).json({
      ...net.toObject(),
      isLocked: false,
    });
  } catch (error) {
    console.error("🔥 [GET SINGLE ERROR]:", error.message);
    res.status(500).json({ message: "Error fetching safety net details" });
  }
});

// ---------------------------------------------------------
// 4️⃣ DELETE / HIDE SAFETY NET (FOR ME ONLY)
// ---------------------------------------------------------
router.delete("/:id", protect, async (req, res) => {
  try {
    const net = await SafetyNet.findById(req.params.id);
    if (!net) return res.status(404).json({ message: "Safety net not found" });

    const userId = req.user._id;
    const family = await Family.findById(net.family);
    const isCreator = net.createdBy.toString() === userId.toString();
    const isAssigned = net.assignedUsers.some(
      (u) => u.toString() === userId.toString()
    );
    const isOwner = family ? isUserOwner(family, userId) : false;

    if (!isCreator && !isAssigned && !isOwner) {
      return res.status(403).json({ message: "Unauthorized action" });
    }

    // Hide for the requester only instead of deleting globally
    await SafetyNet.findByIdAndUpdate(req.params.id, {
      $addToSet: { hiddenFor: userId },
    });

    res.status(200).json({ message: "Safety Net removed from your view" });
  } catch (error) {
    res.status(500).json({ message: "Deletion failed", error: error.message });
  }
});

// ---------------------------------------------------------
// 5️⃣ GET VAULTS ASSIGNED TO ME (Excludes hidden items)
// ---------------------------------------------------------
router.get("/assigned/:familyId", protect, async (req, res) => {
  try {
    const { familyId } = req.params;
    const now = new Date();

    const vaults = await SafetyNet.find({
      family: familyId,
      assignedUsers: req.user._id,
      hiddenFor: { $ne: req.user._id },
      triggerDate: { $lte: now },
    })
      .populate("createdBy", "firstName lastName")
      .sort({ triggerDate: 1 });

    res.status(200).json(vaults);
  } catch (error) {
    console.error("Fetch Vaults Error:", error);
    res.status(500).json({ message: "Error fetching assigned vaults" });
  }
});

module.exports = router;
