const express = require("express");
const router = express.Router();
const Poll = require("../models/Poll");
const { protect } = require("../middlewares/authMiddleware");
const { createFamilyNotifications } = require("../utils/notificationHelper");

// @desc    Create New Poll
// @route   POST /api/polls
router.post("/", protect, async (req, res) => {
  try {
    const { title, description, options, endDate, familyId } = req.body;

    // Format options from string array to object array
    const formattedOptions = options.map((opt) => ({ text: opt, votes: [] }));

    const poll = await Poll.create({
      familyId,
      sender: req.user._id,
      title,
      description,
      options: formattedOptions,
      endDate: endDate || null,
    });
    await createFamilyNotifications(familyId, req.user._id, {
      type: "POLL_CREATED",
      title: "New Family Poll",
      message: `Vote now: ${title}`,
      relatedId: poll._id,
    });

    res.status(201).json({ success: true, poll });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get All Polls for a family
// @route   GET /api/polls/family/:familyId
router.get("/family/:familyId", protect, async (req, res) => {
  try {
    const { familyId } = req.params;
    const currentUserId = req.user._id;

    // 1. 🔹 Fetch the polls
    const polls = await Poll.find({ familyId })
      .populate("sender", "firstName lastName profilePicture") // Adjusted to your User schema fields
      .sort({ createdAt: -1 });

    // 2. 🔹 Enrich data and identify "isNew" before updating the DB
    const enrichedPolls = polls.map((poll) => {
      const pollObj = poll.toObject();
      let totalVotes = 0;
      let userVotedOptionId = null;

      pollObj.options.forEach((opt) => {
        totalVotes += opt.votes.length;
        if (opt.votes.some((v) => v.toString() === currentUserId.toString())) {
          userVotedOptionId = opt._id;
        }
      });

      return {
        ...pollObj,
        isOwner: poll.sender._id.toString() === currentUserId.toString(),
        totalVotes,
        userVotedOptionId,
        isExpired: poll.endDate ? new Date() > new Date(poll.endDate) : false,
        // 🔹 Check if user hasn't seen this yet
        isNew: !poll.isRead.some((id) => id.toString() === currentUserId.toString()),
      };
    });

    // 3. 🔹 Mark all polls in this family as READ for this user
    // This clears the global unread count for the next time they call getFamily
    await Poll.updateMany(
      { 
        familyId, 
        isRead: { $ne: currentUserId } 
      },
      { 
        $addToSet: { isRead: currentUserId } 
      }
    );

    res.json({ success: true, polls: enrichedPolls });
  } catch (error) {
    console.error("❌ Poll Fetch Error:", error);
    res.status(500).json({ message: "Error fetching polls" });
  }
});
// @desc    Vote in a Poll
// @route   PATCH /api/polls/:id/vote
router.patch("/:id/vote", protect, async (req, res) => {
  try {
    const { optionId } = req.body;
    const userId = req.user._id;

    const poll = await Poll.findById(req.params.id);
    if (!poll) return res.status(404).json({ message: "Poll not found" });
    if (
      poll.status === "closed" ||
      (poll.endDate && new Date() > poll.endDate)
    ) {
      return res.status(400).json({ message: "Poll is closed" });
    }

    // Remove user's previous vote from ANY option in this poll (Single choice)
    poll.options.forEach((opt) => {
      opt.votes = opt.votes.filter((v) => v.toString() !== userId.toString());
    });

    // Add vote to the new selection
    const option = poll.options.id(optionId);
    if (option) {
      option.votes.push(userId);
    }

    await poll.save();
    res.json({ success: true, message: "Vote recorded" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Delete Poll
router.delete("/:id", protect, async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id);
    if (poll.sender.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: "Not authorized" });
    }
    await poll.deleteOne();
    res.json({ success: true, message: "Poll removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
