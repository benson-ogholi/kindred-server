const express = require("express");
const router = express.Router();
const FamilyContent = require("../models/FamilyContent");
const Family = require("../models/Family");
const { protect } = require("../middlewares/authMiddleware");
const { createFamilyNotifications } = require("../utils/notificationHelper");
const multer = require("multer"); // <-- This is required for upload
const { uploadToBackblaze } = require("../utils/uploadToBackblaze");

// Memory storage to keep files in buffer (needed for Backblaze upload)
// const upload = multer({ storage: multer.memoryStorage() });

// ===============================
// Multer (NO LIMITS ON IMAGES)
// ===============================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
  },
});

// ===============================
// CREATE FAMILY CONTENT
// ===============================
// ===============================
// LIKE / UNLIKE CONTENT
// ===============================
// @route   POST /api/family-content/:id/like
// @access  Private
router.post("/content-content/:id/like", protect, async (req, res) => {
  try {
    const content = await FamilyContent.findById(req.params.id);

    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    // Check if content already liked by user
    const isLiked = content.likes.some(
      (id) => id.toString() === req.user._id.toString()
    );

    if (isLiked) {
      // Unlike: Remove user ID from likes array
      content.likes = content.likes.filter(
        (id) => id.toString() !== req.user._id.toString()
      );
    } else {
      // Like: Add user ID to likes array
      content.likes.push(req.user._id);
    }

    await content.save();

    res.json({
      success: true,
      likesCount: content.likes.length,
      isLiked: !isLiked,
    });
  } catch (error) {
    console.error("❌ Like Content Error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ===============================
// ADD COMMENT
// ===============================
// @route   POST /api/family-content/:id/comment
// @access  Private
router.post("/content-content/:id/comment", protect, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const content = await FamilyContent.findById(req.params.id);

    if (!content) {
      return res.status(404).json({ message: "Content not found" });
    }

    const newComment = {
      user: req.user._id,
      text,
      createdAt: new Date(),
    };

    content.comments.push(newComment);
    await content.save();

    // Populate user info for the last added comment to return it to UI
    const populatedContent = await FamilyContent.findById(content._id).populate(
      "comments.user",
      "firstName lastName profilePicture"
    );

    res.status(201).json({
      success: true,
      comment: populatedContent.comments[populatedContent.comments.length - 1],
    });
  } catch (error) {
    console.error("❌ Add Comment Error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ===============================
// DELETE COMMENT
// ===============================
// @route   DELETE /api/family-content/:id/comment/:commentId
// @access  Private
router.delete(
  "/content-content/:id/comment/:commentId",
  protect,
  async (req, res) => {
    try {
      const content = await FamilyContent.findById(req.params.id);

      if (!content) {
        return res.status(404).json({ message: "Content not found" });
      }

      // Find comment
      const comment = content.comments.id(req.params.commentId);

      if (!comment) {
        return res.status(404).json({ message: "Comment not found" });
      }

      // Check authorization (only comment creator or content creator can delete)
      if (
        comment.user.toString() !== req.user._id.toString() &&
        content.creator.toString() !== req.user._id.toString()
      ) {
        return res
          .status(403)
          .json({ message: "Not authorized to delete this comment" });
      }

      comment.remove();
      await content.save();

      res.json({ success: true, message: "Comment removed" });
    } catch (error) {
      console.error("❌ Delete Comment Error:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

router.post(
  "/",
  protect,
  upload.any(), // accept all files
  async (req, res) => {
    try {
      console.log("📥 BODY:", req.body);
      console.log(
        "📁 FILES:",
        req.files?.map((f) => f.fieldname)
      );

      const {
        familyId,
        contentType,
        title,
        description,
        voiceDuration,
        metadata,
        creator: providedCreator,
      } = req.body;

      if (!familyId || !contentType) {
        return res.status(400).json({
          message: "familyId and contentType are required",
        });
      }

      // ===============================
      // FILE PROCESSING
      // ===============================
      const images = [];
      let voiceNote = null;

      for (const file of req.files || []) {
        // ---- Images
        if (file.mimetype.startsWith("image/")) {
          const url = await uploadToBackblaze(
            file.buffer,
            file.originalname,
            `family-content/${contentType}/images`
          );

          images.push({
            url,
            name: file.originalname,
            type: file.mimetype,
          });
        }

        // ---- Voice Notes
        if (file.mimetype.startsWith("audio/")) {
          const audioUrl = await uploadToBackblaze(
            file.buffer,
            file.originalname,
            `family-content/${contentType}/voice-notes`
          );

          voiceNote = {
            url: audioUrl,
            duration: voiceDuration ? Number(voiceDuration) : null,
            type: file.mimetype,
          };
        }
      }

      // ===============================
      // SAFE METADATA PARSING
      // ===============================
      let parsedMetadata = {};
      if (metadata) {
        try {
          parsedMetadata = JSON.parse(metadata);
        } catch (err) {
          parsedMetadata = {};
        }
      }

      // ===============================
      // CREATE CONTENT
      // ===============================
      const content = await FamilyContent.create({
        familyId,
        contentType,
        title,
        description,
        images,
        voiceNote,
        metadata: parsedMetadata,
        creator: providedCreator || req.user._id, // fallback to current user
      });

      // ===============================
      // NOTIFICATION
      // ===============================
      const family = await Family.findById(familyId).select("familyName");
      if (family) {
        await createFamilyNotifications(familyId, req.user._id, {
          type: "FAMILY_UPDATE",
          title: `${family.familyName} Updates`,
          message: title ? title : `New ${contentType} content added`,
          relatedId: content._id,
        });
      }

      res.status(201).json({
        success: true,
        content,
      });
    } catch (error) {
      console.error("❌ Create Family Content Error:", error);
      res.status(500).json({
        message: "Failed to create family content",
      });
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

    // ===============================
    // 🔐 VISIBILITY-AWARE QUERY
    // ===============================
    const contents = await FamilyContent.find({
      familyId,
      contentType: type,
      $or: [
        // 1️⃣ Family-visible content (everyone sees)
        { "metadata.visibility": "family" },

        // 2️⃣ Private content ONLY if user is creator
        {
          "metadata.visibility": "private",
          creator: currentUserId,
        },
      ],
    })
      .populate("creator", "firstName lastName profilePicture")
      .sort({ createdAt: -1 });

    // ===============================
    // ENRICH RESPONSE
    // ===============================
    const enriched = contents.map((item) => {
      const itemObj = item.toObject();

      const isReadArray = Array.isArray(itemObj.isRead) ? itemObj.isRead : [];

      const isNewForUser = !isReadArray.some(
        (id) => id?.toString() === currentUserId.toString()
      );

      const creatorId = itemObj.creator?._id?.toString();

      return {
        ...itemObj,
        isOwner: creatorId === currentUserId.toString(),
        isNew: isNewForUser,
      };
    });

    // ===============================
    // MARK AS READ (ONLY VISIBLE ITEMS)
    // ===============================
    await FamilyContent.updateMany(
      {
        _id: { $in: contents.map((c) => c._id) },
        isRead: { $ne: currentUserId },
      },
      { $addToSet: { isRead: currentUserId } }
    );

    res.json({
      success: true,
      contents: enriched,
    });
  } catch (error) {
    console.error("❌ Fetch Family Content Error:", error);
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
