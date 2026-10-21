const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const { News, Task, Suggestion, Poll } = require("../models/FeatureModels");

// --- HELPER: GET BY FAMILY ---
const getByFamily = (Model) => async (req, res) => {
  try {
    const items = await Model.find({ family: req.params.familyId }).populate(
      "author user creator",
      "name firstName lastName"
    );
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

router.post("/:familyId/news", protect, async (req, res) => {
  try {
    const news = await News.create({
      ...req.body,
      family: req.params.familyId,
      author: req.user._id,
    });
    res.status(201).json(news);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/:familyId/news", protect, getByFamily(News));

router.delete("/news/:id", protect, async (req, res) => {
  try {
    const news = await News.findByIdAndDelete(req.params.id);
    if (!news) return res.status(404).json({ message: "News not found" });
    res.json({ message: "News deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- TASKS ---
router.post("/:familyId/tasks", protect, async (req, res) => {
  try {
    const task = await Task.create({
      ...req.body,
      family: req.params.familyId,
    });
    res.status(201).json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/:familyId/tasks", protect, getByFamily(Task));

router.delete("/tasks/:id", protect, async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.json({ message: "Task deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SUGGESTIONS ---
router.post("/:familyId/suggestions", protect, async (req, res) => {
  try {
    const suggestion = await Suggestion.create({
      ...req.body,
      family: req.params.familyId,
      user: req.body.isAnonymous ? null : req.user._id,
    });
    res.status(201).json(suggestion);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/:familyId/suggestions", protect, getByFamily(Suggestion));

router.delete("/suggestions/:id", protect, async (req, res) => {
  try {
    const suggestion = await Suggestion.findByIdAndDelete(req.params.id);
    if (!suggestion)
      return res.status(404).json({ message: "Suggestion not found" });
    res.json({ message: "Suggestion deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- POLLS ---
router.post("/:familyId/polls", protect, async (req, res) => {
  try {
    const poll = await Poll.create({
      ...req.body,
      family: req.params.familyId,
      creator: req.user._id,
    });
    res.status(201).json(poll);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/:familyId/polls", protect, getByFamily(Poll));

router.delete("/polls/:id", protect, async (req, res) => {
  try {
    const poll = await Poll.findByIdAndDelete(req.params.id);
    if (!poll) return res.status(404).json({ message: "Poll not found" });
    res.json({ message: "Poll deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
