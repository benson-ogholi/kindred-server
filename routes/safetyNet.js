const express = require("express");
const router = express.Router();
const SafetyNet = require("../models/SafetyNet");
const Family = require("../models/Family");
const { protect } = require("../middlewares/authMiddleware");
const { uploadToBackblaze } = require("../utils/uploadToBackblaze");
const multer = require("multer");

// Multer setup using memory storage for Backblaze buffer
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

/**
 * 🔐 Helper: Check family access
 */
const hasFamilyAccess = (family, userId) => {
  return (
    family.owner.toString() === userId ||
    family.members.some((m) => m.toString() === userId)
  );
};

// ---------------------------------------------------------
// 1️⃣ CREATE SAFETY NET (with FormData & Multimedia)
// POST /api/v1/safety-net/:familyId
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
      const { title, description, triggerDate, assignedUsers } = req.body; // Added description


      console.warn(title, description, triggerDate, assignedUsers, 'assignedUsersassignedUsers')
      const family = await Family.findById(familyId);
      if (!family || !description ||  !hasFamilyAccess(family, req.user._id.toString())) {
        return res
          .status(403)
          .json({ message: "Unauthorized access to family" });
      }

      // Process file uploads to Backblaze
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
        description, // Saved to DB
        imageUrls,
        audioUrls,
        videoUrls,
        assignedUsers: assignedUsers ? JSON.parse(assignedUsers) : [],
        triggerDate,
      });

      console.log(safetyNet, 'safetyNetsafetyNet')
      res.status(201).json({ message: "Safety Net created", safetyNet });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// ---------------------------------------------------------
// 2️⃣ GET ALL SAFETY NETS FOR A FAMILY
// GET /api/v1/safety-net/family/:familyId
// ---------------------------------------------------------
router.get("/family/:familyId", protect, async (req, res) => {
  console.log(
    "📂 [GET ALL] Fetching family vaults for ID:",
    req.params.familyId
  );

  try {
    const { familyId } = req.params;

    // Populate BOTH createdBy and assignedUsers with the FULL schema
    const nets = await SafetyNet.find({ family: familyId })
      .populate("createdBy", "-password") // Get full owner info (minus password)
      .populate("assignedUsers", "-password") // Get full list of beneficiaries
      .sort({ createdAt: -1 });

    console.log(`✅ [GET ALL SUCCESS] Found ${nets.length} vaults.`);

    // Debug Log: Check the first user of the first vault
    if (nets.length > 0 && nets[0].assignedUsers.length > 0) {
      console.log("👤 [USER DATA SAMPLE]:", {
        name: `${nets[0].assignedUsers[0].firstName} ${nets[0].assignedUsers[0].lastName}`,
        email: nets[0].assignedUsers[0].email,
        id: nets[0].assignedUsers[0]._id,
      });
    }

    res.status(200).json(nets);
  } catch (error) {
    console.error("🔥 [GET ALL ERROR]:", error.message);
    res.status(500).json({ message: "Error fetching safety nets" });
  }
});

// ---------------------------------------------------------
// 7️⃣ GET SINGLE SAFETY NET BY ID
// GET /api/v1/safety-net/:id
// ---------------------------------------------------------
router.get("/:id", protect, async (req, res) => {
  console.log("🔍 [GET SINGLE] Fetching vault ID:", req.params.id);

  try {
    const net = await SafetyNet.findById(req.params.id)
      .populate("createdBy", "firstName lastName email avatar") // Populate creator
      .populate("assignedUsers", "firstName lastName email avatar"); // Populate beneficiaries

    if (!net) {
      return res.status(404).json({ message: "Safety net not found" });
    }

    // 1. Authorization Check
    const isCreator = net.createdBy._id.toString() === req.user._id.toString();
    const isAssigned = net.assignedUsers.some(
      (u) => u._id.toString() === req.user._id.toString()
    );

    if (!isCreator && !isAssigned) {
      return res
        .status(403)
        .json({ message: "Unauthorized access to this vault" });
    }

    // 2. Release Logic Check
    const isReleased = new Date(net.triggerDate) <= new Date();

    // 3. Privacy Filter: If not creator and not yet released, hide media
    if (!isCreator && !isReleased) {
      console.log(
        "🔒 [LOCKED] Beneficiary accessing before triggerDate. Hiding media."
      );

      // Return the object but empty out the media arrays
      const lockedData = net.toObject();
      return res.status(200).json({
        ...lockedData,
        imageUrls: [],
        audioUrls: [],
        videoUrls: [],
        isLocked: true, // Frontend flag
        message:
          "This vault is secured. Media will be revealed on the release date.",
      });
    }

    // 4. Return Full Data (If Creator or if Released)
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
// PUT /api/v1/safety-net/:id
// ---------------------------------------------------------
router.put("/:id", protect, async (req, res) => {
  console.log("🚀 [UPDATE START] Safety Net ID:", req.params.id);
  console.log("👤 [USER] Requesting User ID:", req.user?._id);
  console.log("📦 [PAYLOAD] req.body:", JSON.stringify(req.body, null, 2));

  try {
    // 1. Fetch existing record
    const net = await SafetyNet.findById(req.params.id);

    if (!net) {
      console.error("❌ [NOT FOUND] No SafetyNet exists with this ID.");
      return res.status(404).json({ message: "Safety net not found" });
    }

    console.log(
      "🔍 [DATABASE] Existing record found. CreatedBy:",
      net.createdBy
    );

    // 2. Ownership Check
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

    // 3. Data Transformation (Handle stringified data if using FormData)
    let updateFields = { ...req.body };

    if (typeof updateFields.assignedUsers === "string") {
      try {
        updateFields.assignedUsers = JSON.parse(updateFields.assignedUsers);
        console.log("📎 [PARSED] assignedUsers converted to Array.");
      } catch (e) {
        console.warn("⚠️ [PARSE ERROR] assignedUsers remains a string.");
      }
    }

    // 4. Update the record
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
    const isOwner = family.owner.toString() === req.user._id.toString();

    if (!isCreator && !isOwner) {
      return res.status(403).json({ message: "Unauthorized deletion" });
    }

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
    const now = new Date(); // Get current date and time

    const vaults = await SafetyNet.find({
      family: familyId,
      assignedUsers: req.user._id,
      // Only include vaults where triggerDate is less than or equal to now
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

    // REVEAL LOGIC: description is ALWAYS visible, media is locked until trigger
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
