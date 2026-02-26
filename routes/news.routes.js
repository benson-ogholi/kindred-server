const express = require("express");
const router = express.Router();
const multer = require("multer"); // <-- This is required for upload

// Memory storage to keep files in buffer (needed for Backblaze upload)
const upload = multer({ storage: multer.memoryStorage() });

const { uploadToBackblaze } = require("../utils/uploadToBackblaze");
const News = require("../models/News");
const { protect } = require("../middlewares/authMiddleware");
const { createFamilyNotifications } = require("../utils/notificationHelper");

/**
 * LIKE / UNLIKE NEWS
 */
router.post("/news-news/:newsId/like", protect, async (req, res) => {
  try {
    const news = await News.findById(req.params.newsId);
    if (!news) return res.status(404).json({ message: "News not found" });

    const isLiked = news.likes.includes(req.user._id);

    if (isLiked) {
      // Unlike
      news.likes = news.likes.filter(
        (id) => id.toString() !== req.user._id.toString()
      );
    } else {
      // Like
      news.likes.push(req.user._id);
    }

    await news.save();
    res.status(200).json({ likes: news.likes, isLiked: !isLiked });
  } catch (error) {
    res.status(500).json({ message: "Error processing like" });
  }
});

/**
 * ADD COMMENT
 */
// Add 'protect' here
router.post("/news-news/:newsId/comment", protect, async (req, res) => {
  try {
    const { text } = req.body;

    // 1. Check if user exists (Safety check)
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Not authorized, user missing" });
    }

    if (!text)
      return res.status(400).json({ message: "Comment text is required" });

    const news = await News.findById(req.params.newsId);
    if (!news) return res.status(404).json({ message: "News not found" });

    // 2. Create the comment object using the now-available req.user._id
    const newComment = {
      author: req.user._id,
      text,
    };

    news.comments.push(newComment);
    await news.save();

    // 3. Re-fetch and populate so the frontend gets the author's name immediately
    const updatedNews = await News.findById(req.params.newsId).populate(
      "comments.author",
      "firstName lastName"
    );

    const addedComment = updatedNews.comments[updatedNews.comments.length - 1];

    res.status(201).json({ comment: addedComment });
  } catch (error) {
    console.error("❌ Add Comment Error:", error);
    res.status(500).json({ message: "Failed to add comment" });
  }
});
/**
 * DELETE COMMENT
 */
router.delete("/news-news/:newsId/comment/:commentId", async (req, res) => {
  try {
    const news = await News.findById(req.params.newsId);
    if (!news) return res.status(404).json({ message: "News not found" });

    const comment = news.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    // Only comment author or news author can delete
    if (
      comment.author.toString() !== req.user._id.toString() &&
      news.author.toString() !== req.user._id.toString()
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this comment" });
    }

    comment.deleteOne();
    await news.save();

    res.status(200).json({ message: "Comment deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete comment" });
  }
});

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
      .populate("comments.author", "firstName lastName") // ✅ populate comment authors
      .sort({ createdAt: -1 });

    const enrichedNews = news.map((item) => {
      const obj = item.toObject();

      const isReadArray = Array.isArray(obj.isRead) ? obj.isRead : [];

      return {
        ...obj,
        isNew: !isReadArray.some(
          (id) => id && id.toString() === userId.toString()
        ),
      };
    });

    // ✅ Mark all as read
    await News.updateMany(
      { family: familyId, isRead: { $ne: userId } },
      { $addToSet: { isRead: userId } }
    );

    return res.status(200).json({
      status: "success",
      news: enrichedNews,
    });
  } catch (error) {
    console.error("❌ Fetch News Error:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch news",
    });
  }
});

router.put("/:newsId", protect, async (req, res) => {
  console.log("🟢 UPDATE NEWS HIT (NO MULTER)");

  try {
    console.log("➡️ req.params:", req.params);
    console.log("➡️ req.body:", req.body);
    console.log("➡️ Content-Type:", req.headers["content-type"]);

    const news = await News.findById(req.params.newsId);
    console.log("news.author.toString()", news.author.toString());
    if (!news) {
      console.log("❌ News not found");
      return res.status(404).json({ message: "News not found" });
    }

    if (req.user._id.toString()) {
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
