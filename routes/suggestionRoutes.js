const express = require("express");
const router = express.Router();
const multer = require("multer");
const Suggestion = require("../models/Suggestion");
const { protect } = require("../middlewares/authMiddleware");
const { uploadToBackblaze } = require("../utils/uploadToBackblaze");
const { createFamilyNotifications } = require("../utils/notificationHelper");

// Configure Multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// @desc    Create a new suggestion
router.post("/", protect, upload.single("image"), async (req, res) => {
  try {
    const { title, description, familyId } = req.body;
    let imageUrl = null;

    if (req.file) {
      imageUrl = await uploadToBackblaze(
        req.file.buffer,
        req.file.originalname,
        "suggestions"
      );
    }

    const suggestion = await Suggestion.create({
      familyId,
      sender: req.user._id,
      title,
      description,
      imageUrl,
    });

    await createFamilyNotifications(familyId, req.user._id, {
      type: "NEW_SUGGESTION",
      title: "New Suggestion",
      message: `${req.user.firstName} shared a new idea: ${title}`,
      relatedId: suggestion._id,
    });

    res.status(201).json({ success: true, suggestion });
  } catch (error) {
    res
      .status(500)
      .json({ message: error.message || "Failed to add suggestion" });
  }
});

// @desc    Add Comment to Suggestion
router.post("/:id/comment", protect, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message)
      return res.status(400).json({ message: "Message is required" });

    const suggestion = await Suggestion.findById(req.params.id);
    if (!suggestion)
      return res.status(404).json({ message: "Suggestion not found" });

    const newComment = {
      user: req.user._id,
      message,
    };

    suggestion.comments.push(newComment);
    await suggestion.save();

    const populatedSuggestion = await Suggestion.findById(
      suggestion._id
    ).populate("comments.user", "firstName lastName profilePicture");

    res.status(201).json({
      success: true,
      comments: populatedSuggestion.comments,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get all suggestions for a family (Enriched with Likes & Upvotes)
router.get("/family/:familyId/suggestions", protect, async (req, res) => {
  try {
    const { familyId } = req.params;
    const userId = req.user._id;

    const suggestions = await Suggestion.find({ familyId })
      .populate("sender", "firstName lastName profilePicture")
      .populate("comments.user", "firstName lastName profilePicture")
      .sort({ createdAt: -1 });

    const enrichedSuggestions = suggestions.map((s) => {
      const obj = s.toObject();
      return {
        ...obj,
        isOwner: obj.sender?._id?.toString() === userId.toString(),

        // Upvote Logic
        upvoteCount: obj.upvotes?.length || 0,
        hasUpvoted:
          obj.upvotes?.some((u) => u.toString() === userId.toString()) || false,

        // Like Logic (NEW)
        likeCount: obj.likes?.length || 0,
        hasLiked:
          obj.likes?.some((l) => l.toString() === userId.toString()) || false,

        isNew: !obj.isRead?.some((id) => id.toString() === userId.toString()),
      };
    });

    res.json({ success: true, suggestions: enrichedSuggestions });
  } catch (error) {
    res.status(500).json({ message: "Error fetching suggestions" });
  }
});

// @desc    Toggle Like on Suggestion
router.patch("/:id/like", protect, async (req, res) => {
  try {
    const suggestion = await Suggestion.findById(req.params.id);
    if (!suggestion) return res.status(404).json({ message: "Not found" });

    const likeIndex = suggestion.likes.indexOf(req.user._id);

    if (likeIndex === -1) {
      suggestion.likes.push(req.user._id); // Like
    } else {
      suggestion.likes.splice(likeIndex, 1); // Unlike
    }

    await suggestion.save();
    res.json({ success: true, likeCount: suggestion.likes.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Toggle Upvote on Suggestion
router.patch("/:id/upvote", protect, async (req, res) => {
  try {
    const suggestion = await Suggestion.findById(req.params.id);
    if (!suggestion) return res.status(404).json({ message: "Not found" });

    const upvoteIndex = suggestion.upvotes.indexOf(req.user._id);

    if (upvoteIndex === -1) {
      suggestion.upvotes.push(req.user._id);
    } else {
      suggestion.upvotes.splice(upvoteIndex, 1);
    }

    await suggestion.save();
    res.json({ success: true, upvotes: suggestion.upvotes.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Delete Suggestion
router.delete("/:id", protect, async (req, res) => {
  try {
    const suggestion = await Suggestion.findById(req.params.id);
    if (suggestion.sender.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Not authorized" });
    }
    await suggestion.deleteOne();
    res.json({ success: true, message: "Suggestion removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
