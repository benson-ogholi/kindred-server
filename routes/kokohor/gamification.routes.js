const express = require("express");
const router = express.Router();

const { protect, checkStatus } = require("../../middlewares/kokohor/authMiddleware");
const gamificationService = require("../../services/kokohor/gamificationService");

router.use(protect, checkStatus);

router.get("/balance", async (req, res) => {
  try {
    const balance = await gamificationService.getBalance(req.user._id);
    res.json({ balance });
  } catch (err) {
    console.error("[gamification.routes] balance error:", err);
    res.status(500).json({ message: "Failed to fetch balance" });
  }
});

router.get("/balance/:userId", async (req, res) => {
  try {
    const balance = await gamificationService.getBalance(req.params.userId);
    res.json({ balance });
  } catch (err) {
    console.error("[gamification.routes] balance error:", err);
    res.status(500).json({ message: "Failed to fetch balance" });
  }
});

router.get("/leaderboard", async (req, res) => {
  try {
    const { scope = "global", familyId, limit } = req.query;
    if (scope === "family" && !familyId) {
      return res.status(400).json({ message: "familyId is required when scope=family" });
    }
    const leaderboard = await gamificationService.leaderboard({
      scope,
      familyId,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ leaderboard });
  } catch (err) {
    console.error("[gamification.routes] leaderboard error:", err);
    res.status(500).json({ message: "Failed to fetch leaderboard" });
  }
});

module.exports = router;
