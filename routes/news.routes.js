const express = require("express");
const router = express.Router();
const multer = require("multer"); // <-- This is required for upload

// Memory storage to keep files in buffer (needed for Backblaze upload)
const upload = multer({ storage: multer.memoryStorage() });

const { uploadToBackblaze } = require("../utils/uploadToBackblaze");
const News = require("../models/News");
const { protect } = require("../middlewares/authMiddleware");
const { createFamilyNotifications } = require("../utils/notificationHelper");


router.post(
  "/family/:familyId",
  protect,
  upload.fields([
    { name: "images", maxCount: 5 },
    { name: "voiceNote", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { title, content } = req.body;
      const { familyId } = req.params;

      if (!title || !content) {
        return res
          .status(400)
          .json({ message: "Title and content are required" });
      }


      let images = [];
      if (req.files?.images) {
        for (const file of req.files.images) {
          const url = await uploadToBackblaze(
            file.buffer,
            file.originalname,
            "news/images"
          );
          images.push({ url });
        }
      }


      let voiceNote = null;
      if (req.files?.voiceNote?.[0]) {
        const audioFile = req.files.voiceNote[0];
        const audioUrl = await uploadToBackblaze(
          audioFile.buffer,
          audioFile.originalname,
          "news/voice-notes"
        );

        voiceNote = {
          url: audioUrl,
          duration: Number(req.body.voiceDuration) || null,
        };
      }

      const news = await News.create({
        family: familyId,
        author: req.user._id,
        title,
        content,
        images,
        voiceNote,
      });

      await news.populate("author", "firstName lastName");

      await createFamilyNotifications(familyId, req.user._id, {
        type: 'NEWS_UPDATE',
        title: 'Family Update',
        message: `New post: ${title}`,
        relatedId: news._id
      });

      res.status(201).json({ news });
    } catch (error) {
      console.error("Create news error:", error);
      res.status(500).json({ message: "Failed to create news" });
    }
  }
);

/**
 * GET ALL NEWS FOR A FAMILY
 */
router.get("/family/:familyId", protect, async (req, res) => {
  try {
    const { familyId } = req.params;

    const news = await News.find({ family: familyId })
      .populate("author", "firstName lastName")
      .sort({ createdAt: -1 });

    res.status(200).json({ news });
  } catch (error) {
    console.error("Fetch news error:", error);
    res.status(500).json({ message: "Failed to fetch news" });
  }
});


router.put("/:newsId", protect, async (req, res) => {
  console.log("🟢 UPDATE NEWS HIT (NO MULTER)");

  try {
    console.log("➡️ req.params:", req.params);
    console.log("➡️ req.body:", req.body);
    console.log("➡️ Content-Type:", req.headers["content-type"]);

    const news = await News.findById(req.params.newsId);

    if (!news) {
      console.log("❌ News not found");
      return res.status(404).json({ message: "News not found" });
    }

    if (news.author.toString() !== req.user._id.toString()) {
      console.log("🚫 Unauthorized update attempt");
      return res
        .status(403)
        .json({ message: "Not authorized to update this news" });
    }

    // ===== UPDATE FIELDS =====
    if (req.body.title !== undefined) {
      news.title = req.body.title;
    }

    if (req.body.content !== undefined) {
      news.content = req.body.content;
    }

    // Optional: update voice duration only (no file)
    if (req.body.voiceDuration !== undefined && news.voiceNote) {
      news.voiceNote.duration = Number(req.body.voiceDuration);
    }

    await news.save();
    await news.populate("author", "firstName lastName");

    console.log("✅ News updated:", news._id);

    res.status(200).json({ news });
  } catch (error) {
    console.error("🔥 Update news error:", error);
    res.status(500).json({ message: "Failed to update news" });
  }
});


/**
 * DELETE NEWS
 */
router.delete("/:newsId", protect, async (req, res) => {
  try {
    const news = await News.findById(req.params.newsId);

    if (!news) {
      return res.status(404).json({ message: "News not found" });
    }

    if (news.author.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this news" });
    }

    await news.deleteOne();

    res.status(200).json({ message: "News deleted successfully" });
  } catch (error) {
    console.error("Delete news error:", error);
    res.status(500).json({ message: "Failed to delete news" });
  }
});

/**
 * GET SINGLE NEWS ITEM
 */
router.get("/:newsId", protect, async (req, res) => {
  try {
    const news = await News.findById(req.params.newsId).populate(
      "author",
      "firstName lastName"
    );

    if (!news) {
      return res.status(404).json({ message: "News not found" });
    }

    res.status(200).json({ news });
  } catch (error) {
    console.error("Get single news error:", error);
    res.status(500).json({ message: "Failed to fetch news" });
  }
});

module.exports = router;
