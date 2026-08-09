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

// ---------------------------------------------------------
// 1️⃣ CREATE SAFETY NET
// ---------------------------------------------------------
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
      const { title, description, triggerDate, assignedUsers } = req.body;

      console.warn(
        title,
        description,
        triggerDate,
        assignedUsers,
        "assignedUsers"
      );

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
      });

      console.log(safetyNet, "safetyNet");
      res.status(201).json({ message: "Safety Net created", safetyNet });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// ---------------------------------------------------------
// 2️⃣ GET ALL SAFETY NETS FOR A FAMILY
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

    if (!net) {
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
      console.log(
        "🔒 [STRICT BLOCK] Beneficiary tried to fetch before triggerDate."
      );
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
// 3️⃣ UPDATE SAFETY NET
// ---------------------------------------------------------
router.put("/:id", protect, async (req, res) => {
  console.log("🚀 [UPDATE START] Safety Net ID:", req.params.id);
  console.log("👤 [USER] Requesting User ID:", req.user?._id);
  console.log("📦 [PAYLOAD] req.body:", JSON.stringify(req.body, null, 2));

  try {
    const net = await SafetyNet.findById(req.params.id);

    if (!net) {
      console.error("❌ [NOT FOUND] No SafetyNet exists with this ID.");
      return res.status(404).json({ message: "Safety net not found" });
    }

    console.log(
      "🔍 [DATABASE] Existing record found. CreatedBy:",
      net.createdBy
    );

    const isOwner = net.createdBy.toString() === req.user._id.toString();
    console.log(
      `⚖️ [AUTH CHECK] Match? ${isOwner} (Creator: ${net.createdBy} vs User: ${req.user._id})`
    );

    if (!isOwner) {
      console.warn("🚫 [FORBIDDEN] Unauthorized attempt to edit.");
      return res
        .status(403)
        .json({ message: "Only the creator can edit this" });
    }

    let updateFields = { ...req.body };

    if (typeof updateFields.assignedUsers === "string") {
      try {
        updateFields.assignedUsers = JSON.parse(updateFields.assignedUsers);
        console.log("📎 [PARSED] assignedUsers converted to Array.");
      } catch (e) {
        console.warn("⚠️ [PARSE ERROR] assignedUsers remains a string.");
      }
    }

    console.log("📝 [SAVING] Applying updates to DB...");
    const updatedNet = await SafetyNet.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    console.log(
      "✅ [SUCCESS] Updated Record:",
      JSON.stringify(updatedNet, null, 2)
    );
    console.log("✨ [FINAL DESCRIPTION]:", updatedNet.description);
    console.log("--- UPDATE END ---");

    res.status(200).json({
      message: "Updated successfully",
      safetyNet: updatedNet,
    });
  } catch (error) {
    console.error("🔥 [CRITICAL ERROR] Update failed:", error.message);
    res.status(500).json({ message: "Update failed", error: error.message });
  }
});

// ---------------------------------------------------------
// 4️⃣ DELETE SAFETY NET
// ---------------------------------------------------------
router.delete("/:id", protect, async (req, res) => {
  try {
    const net = await SafetyNet.findById(req.params.id);
    if (!net) return res.status(404).json({ message: "Safety net not found" });

    const family = await Family.findById(net.family);
    const isCreator = net.createdBy.toString() === req.user._id.toString();
    const isOwner = family ? isUserOwner(family, req.user._id) : false;

    // Uncomment if you want strict permission:
    // if (!isCreator && !isOwner) {
    //   return res.status(403).json({ message: "Unauthorized deletion" });
    // }

    await net.deleteOne();
    res.status(200).json({ message: "Safety Net removed" });
  } catch (error) {
    res.status(500).json({ message: "Deletion failed" });
  }
});

// ---------------------------------------------------------
// 5️⃣ GET VAULTS ASSIGNED TO ME
// ---------------------------------------------------------
router.get("/assigned/:familyId", protect, async (req, res) => {
  try {
    const { familyId } = req.params;
    const now = new Date();

    const vaults = await SafetyNet.find({
      family: familyId,
      assignedUsers: req.user._id,
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

// ---------------------------------------------------------
// 6️⃣ GET SPECIFIC VAULT DETAILS (Reveal Logic)
// ---------------------------------------------------------
router.get("/details/:id", protect, async (req, res) => {
  try {
    const net = await SafetyNet.findById(req.params.id)
      .populate("createdBy", "firstName lastName email")
      .populate("assignedUsers", "firstName lastName");

    if (!net) return res.status(404).json({ message: "Vault not found" });

    const isCreator = net.createdBy._id.toString() === req.user._id.toString();
    const isAssigned = net.assignedUsers.some(
      (u) => u._id.toString() === req.user._id.toString()
    );

    if (!isCreator && !isAssigned) {
      return res
        .status(403)
        .json({ message: "Unauthorized access to this vault" });
    }

    if (!isCreator && net.status === "PENDING") {
      return res.status(200).json({
        ...net._doc,
        imageUrls: [],
        audioUrls: [],
        videoUrls: [],
        isLocked: true,
        message: "Media is locked until the trigger date.",
      });
    }

    res.status(200).json({ ...net._doc, isLocked: false });
  } catch (error) {
    res.status(500).json({ message: "Error fetching vault details" });
  }
});

module.exports = router;
