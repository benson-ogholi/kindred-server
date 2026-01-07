const express = require("express");
const router = express.Router();
const FamilyContent = require("../models/FamilyContent");
const Family = require("../models/Family");
const { protect } = require("../middlewares/authMiddleware");
const { createFamilyNotifications } = require("../utils/notificationHelper");
const multer = require("multer"); // <-- This is required for upload
const { uploadToBackblaze } = require("../utils/uploadToBackblaze");

// Memory storage to keep files in buffer (needed for Backblaze upload)
const upload = multer({ storage: multer.memoryStorage() });

// ===============================
// CREATE FAMILY CONTENT
// ===============================
// @route   POST /api/family-content
// @access  Private
// ===============================
router.post(
  "/",
  protect,
  // ADD THIS MIDDLEWARE HERE TOO!
  upload.fields([
    { name: "images", maxCount: 5 },
    { name: "voiceNote", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      // Now req.body will NOT be undefined
      const {
        familyId,
        contentType,
        title,
        description,
        voiceDuration,
        metadata,
      } = req.body;

      if (!familyId) {
        return res.status(400).json({ message: "familyId is required" });
      }

      // 1. Handle Multiple Image Uploads
      let images = [];
      if (req.files?.images) {
        for (const file of req.files.images) {
          const url = await uploadToBackblaze(
            file.buffer,
            file.originalname,
            `family-content/${contentType}/images`
          );
          images.push({ url });
        }
      }

      // 2. Handle Voice Note Upload
      let voiceNote = null;
      if (req.files?.voiceNote?.[0]) {
        const audioFile = req.files.voiceNote[0];
        const audioUrl = await uploadToBackblaze(
          audioFile.buffer,
          audioFile.originalname,
          `family-content/${contentType}/voice-notes`
        );

        voiceNote = {
          url: audioUrl,
          duration: Number(voiceDuration) || null,
        };
      }

      // 3. Create content
      const content = await FamilyContent.create({
        familyId,
        contentType,
        title,
        description,
        images, // store the array of URLs
        voiceNote,
        metadata: metadata ? JSON.parse(metadata) : {},
        creator: req.user._id,
      });

      // 4. Get family name for notification
      const family = await Family.findById(familyId).select("familyName");

      if (family) {
        await createFamilyNotifications(familyId, req.user._id, {
          type: "FAMILY_UPDATE",
          title: `${family.familyName} Updates`,
          message: `${title || "New content"} (${contentType})`,
          relatedId: content._id,
        });
      }

      res.status(201).json({ success: true, content });
    } catch (error) {
      console.error("Create Error:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// ===============================
// GET ALL CONTENT BY FAMILY & TYPE
// ===============================
// @route   GET /api/family-content/family/:familyId/:type
// @access  Private
router.get("/family/:familyId/:type", protect, async (req, res) => {
  try {
    const { familyId, type } = req.params;
    const currentUserId = req.user._id;

    // 1. 🔹 Fetch the contents
    const contents = await FamilyContent.find({
      familyId: familyId,
      contentType: type,
    })
      .populate("creator", "firstName lastName profilePicture")
      .sort({ createdAt: -1 });

    // 2. 🔹 Map the data FIRST to capture the "New" status
    const enriched = contents.map((item) => {
      const itemObj = item.toObject();

      // If the user's ID is NOT in the isRead array, it's a NEW post for them
      const isNewForUser = !itemObj.isRead.some(
        (id) => id.toString() === currentUserId.toString()
      );

      return {
        ...itemObj,
        isOwner: itemObj.creator?._id.toString() === currentUserId.toString(),
        isNew: isNewForUser, // <--- This tells the frontend to show a "NEW" badge
      };
    });

    // 3. 🔹 NOW update the database in the background
    // This ensures that next time they open the app, these won't be "New"
    await FamilyContent.updateMany(
      {
        familyId: familyId,
        contentType: type,
        isRead: { $ne: currentUserId },
      },
      {
        $addToSet: { isRead: currentUserId },
      }
    );

    res.json({
      success: true,
      contents: enriched,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===============================
// UPDATE CONTENT
// ===============================
// @route   PUT /api/family-content/:id
// @access  Private
// PUT /api/family-content/:id
router.put(
  "/:id",
  protect,
  upload.fields([
    { name: "images", maxCount: 5 },
    { name: "voiceNote", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const content = await FamilyContent.findById(req.params.id);

      if (!content) {
        return res.status(404).json({ message: "Content not found" });
      }

      // Check authorization
      if (content.creator.toString() !== req.user._id.toString()) {
        return res
          .status(403)
          .json({ message: "Not authorized to update this content" });
      }

      // 1. Update Text Fields
      const { title, description, voiceDuration, metadata } = req.body;
      if (title) content.title = title;
      if (description) content.description = description;

      if (metadata) {
        // Parse metadata if it comes in as a string from FormData
        content.metadata =
          typeof metadata === "string" ? JSON.parse(metadata) : metadata;
      }

      // 2. Handle NEW Image Uploads (Append to existing or replace)
      if (req.files?.images) {
        const newImages = [];
        for (const file of req.files.images) {
          const url = await uploadToBackblaze(
            file.buffer,
            file.originalname,
            `family-content/${content.contentType}/images`
          );
          newImages.push({ url });
        }
        // Logic: Here we append new images to the existing array
        content.images = [...content.images, ...newImages];
      }

      // 3. Handle NEW Voice Note Upload
      if (req.files?.voiceNote?.[0]) {
        const audioFile = req.files.voiceNote[0];
        const audioUrl = await uploadToBackblaze(
          audioFile.buffer,
          audioFile.originalname,
          `family-content/${content.contentType}/voice-notes`
        );

        content.voiceNote = {
          url: audioUrl,
          duration: Number(voiceDuration) || content.voiceNote?.duration,
        };
      } else if (voiceDuration && content.voiceNote) {
        // Just update duration if no new file provided
        content.voiceNote.duration = Number(voiceDuration);
      }

      await content.save();
      res.status(200).json({ success: true, content });
    } catch (error) {
      console.error("Update content error:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// ===============================
// DELETE CONTENT
// ===============================
// @route   DELETE /api/family-content/:id
// @access  Private
router.delete("/:id", protect, async (req, res) => {
  try {
    const content = await FamilyContent.findById(req.params.id);
    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    if (content.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await content.deleteOne();
    res.json({ success: true, message: "Content deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
