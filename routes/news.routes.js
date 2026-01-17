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
      const { title, content = "" } = req.body;
      const { familyId } = req.params;

      if (!title) {
        return res.status(400).json({ message: "Title is required" });
      }

      // ===== Images =====
      let images = [];
      if (req.files?.images?.length) {
        for (const file of req.files.images) {
          const url = await uploadToBackblaze(
            file.buffer,
            file.originalname,
            "news/images"
          );

          images.push({ url });
        }
      }

      // ===== Voice Note =====
      let voiceNote;
      if (req.files?.voiceNote?.[0]) {
        const audioFile = req.files.voiceNote[0];

        const audioUrl = await uploadToBackblaze(
          audioFile.buffer,
          audioFile.originalname,
          "news/voice-notes"
        );

        voiceNote = {
          url: audioUrl,
          duration: Number(req.body.voiceDuration) || undefined,
        };
      }

      // Ensure at least content or voice note exists
      if (!content && !voiceNote) {
        return res.status(400).json({
          message: "Either content or a voice note is required",
        });
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
        type: "NEWS_UPDATE",
        title: "Family Update",
        message: `New post: ${title}`,
        relatedId: news._id,
      });

      res.status(201).json({ news });
    } catch (error) {
      console.error("Create news error:", error);
      res.status(500).json({ message: "Failed to create news" });
    }
  }
);

router.get("/family/:familyId", protect, async (req, res) => {
  try {
    const { familyId } = req.params;
    const userId = req.user._id;

    const news = await News.find({ family: familyId })
      .populate("author", "firstName lastName")
      .sort({ createdAt: -1 });

    const enrichedNews = news.map((item) => {
      const itemObj = item.toObject();

      // Safely handle isRead
      const isReadArray = Array.isArray(itemObj.isRead) ? itemObj.isRead : [];

      return {
        ...itemObj,
        isNew: !isReadArray.some(
          (id) => id && id.toString() === userId.toString()
        ),
      };
    });

    // Mark all as read for current user
    await News.updateMany(
      { family: familyId, isRead: { $ne: userId } },
      { $addToSet: { isRead: userId } }
    );

    res.status(200).json({ news: enrichedNews });
  } catch (error) {
    console.error("❌ Fetch News Error:", error);
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
