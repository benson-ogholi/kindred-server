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

router.post("/", protect, upload.single("image"), async (req, res) => {
  try {
    const { title, description, familyId } = req.body;
    let imageUrl = null;

    // Handle Image Upload if file exists
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
    console.error(error);
    res
      .status(500)
      .json({ message: error.message || "Failed to add suggestion" });
  }
});

router.get("/family/:familyId", protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { familyId } = req.params;

    const suggestions = await Suggestion.find({ familyId })
      .populate("sender", "firstName lastName profilePicture")
      .sort({ createdAt: -1 });

    const enrichedSuggestions = suggestions.map((s) => {
      const obj = s.toObject();
      return {
        ...obj,
        isOwner: s.sender._id.toString() === userId.toString(),
        upvoteCount: s.upvotes.length,
        hasUpvoted: s.upvotes.includes(userId),
        isNew: !s.isRead.some(id => id.toString() === userId.toString())
      };
    });

    await Suggestion.updateMany(
      { familyId, isRead: { $ne: userId } },
      { $addToSet: { isRead: userId } }
    );

    res.json({ success: true, suggestions: enrichedSuggestions });
  } catch (error) {
    res.status(500).json({ message: "Error fetching suggestions" });
  }
});

router.patch("/:id/upvote", protect, async (req, res) => {
  try {
    const suggestion = await Suggestion.findById(req.params.id);
    if (!suggestion) return res.status(404).json({ message: "Not found" });

    const upvoteIndex = suggestion.upvotes.indexOf(req.user._id);

    if (upvoteIndex === -1) {
      suggestion.upvotes.push(req.user._id); // Upvote
    } else {
      suggestion.upvotes.splice(upvoteIndex, 1); // Remove upvote
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
