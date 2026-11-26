const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../../middlewares/kokohor/adminAuth");
// Models
const Family = require("../../models/kokohor/Family");
const User = require("../../models/kokohor/User");
const Task = require("../../models/kokohor/Task");
const Poll = require("../../models/kokohor/Poll");
const Suggestion = require("../../models/kokohor/Suggestion");
const Report = require("../../models/kokohor/Report");
const News = require("../../models/kokohor/News");
const FamilyContent = require("../../models/kokohor/FamilyContent");
const DonationCampaign = require("../../models/kokohor/DonationCampaign");
const Contribution = require("../../models/kokohor/Contribution");
const SafetyNet = require("../../models/kokohor/SafetyNet");

router.get("/master-stats",  protectAdmin, async (req, res) => {
  console.log("--- [START] MASTER ADMIN DATA AGGREGATION ---");
  try {
    // Parallel Execution for maximum speed
    const [
      totalFamilies,
      totalUsers,
      totalTasks,
      activePolls,
      totalSuggestions,
      totalReports,
      totalNews,
      totalCampaigns,
      totalSafetyNets,
      totalContributions,
    ] = await Promise.all([
      Family.countDocuments(),
      User.countDocuments(),
      Task.countDocuments(),
      Poll.countDocuments({ status: "active" }),
      Suggestion.countDocuments(),
      Report.countDocuments(),
      News.countDocuments(),
      DonationCampaign.countDocuments(),
      SafetyNet.countDocuments(),
      Contribution.countDocuments(),
    ]);

    // Aggregate Content Distribution across the ENTIRE platform
    const contentStats = await FamilyContent.aggregate([
      { $group: { _id: "$contentType", count: { $sum: 1 } } },
    ]);

    const contentSummary = {
      "Family Tree": 0,
      History: 0,
      "Village Tradition": 0,
      "Language Lesson": 0,
      King: 0,
      Patriarch: 0,
      Resolution: 0,
      "My Village": 0,
      "Suggestion Box": 0,
    };

    contentStats.forEach((stat) => {
      if (contentSummary.hasOwnProperty(stat._id)) {
        contentSummary[stat._id] = stat.count;
      }
    });

    const masterStats = {
      overview: {
        totalUsers,
        totalFamilies,
        platformActivityScore: totalTasks + totalReports + totalNews,
      },
      features: {
        tasks: totalTasks,
        activePolls,
        suggestions: totalSuggestions,
        reports: totalReports,
        news: totalNews,
        safetyNets: totalSafetyNets,
      },
      finance: {
        campaigns: totalCampaigns,
        contributions: totalContributions,
      },
      content: contentSummary,
    };

    console.log("✅ [SUCCESS] Master Stats Generated.");
    res.status(200).json(masterStats);
  } catch (error) {
    console.error("🚨 Master Stats Error:", error);
    res.status(500).json({ message: "System failed to aggregate master data" });
  }
});

module.exports = router;
