const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../middlewares/adminAuth");

// Models
const Family = require("../models/Family");
const Task = require("../models/Task");
const Poll = require("../models/Poll");
const Suggestion = require("../models/Suggestion");
const Report = require("../models/Report");
const News = require("../models/News");
const FamilyContent = require("../models/FamilyContent");
const DonationCampaign = require("../models/DonationCampaign");
const SafetyNet = require("../models/SafetyNet");

/**
 * @route   GET /api/v1/admin-family/all
 * @desc    Get all families with basic member/owner info
 */
router.get("/all", protectAdmin, async (req, res) => {
  try {
    const families = await Family.find()
      .populate("owner", "firstName lastName email")
      .sort({ createdAt: -1 });
    res.status(200).json(families);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch family directory" });
  }
});

/**
 * @route   GET /api/v1/admin-family/details/:familyId
 * @desc    DEEP DIVE: Get EVERYTHING related to a specific family
 */
router.get("/details/:familyId", protectAdmin, async (req, res) => {
  const { familyId } = req.params;
  console.log(`🔍 [MASTER DIVE] Fetching all assets for Family: ${familyId}`);

  try {
    const [
      familyInfo,
      tasks,
      polls,
      suggestions,
      reports,
      news,
      content,
      campaigns,
      safetyNets,
    ] = await Promise.all([
      Family.findById(familyId).populate(
        "owner members",
        "firstName lastName email"
      ),
      Task.find({ family: familyId }),
      Poll.find({ familyId: familyId }),
      Suggestion.find({ familyId: familyId }),
      Report.find({ familyId: familyId }),
      News.find({ family: familyId }),
      FamilyContent.find({ familyId: familyId }),
      DonationCampaign.find({ family: familyId }),
      SafetyNet.find({ family: familyId }),
    ]);

    if (!familyInfo)
      return res.status(404).json({ message: "Family not found" });

    res.status(200).json({
      familyInfo,
      assets: {
        tasks,
        polls,
        suggestions,
        reports,
        news,
        content,
        campaigns,
        safetyNets,
        countSummary: {
          tasks: tasks.length,
          polls: polls.length,
          content: content.length,
          campaigns: campaigns.length,
        },
      },
    });
  } catch (error) {
    console.error("🚨 Deep Dive Error:", error);
    res.status(500).json({ message: "Error retrieving family assets" });
  }
});

/**
 * @route   PATCH /api/v1/admin-family/:familyId/suspend
 * @desc    Toggle Family suspension (Blocks access for all members)
 */
router.patch("/:familyId/suspend", protectAdmin, async (req, res) => {
  try {
    const family = await Family.findById(req.params.familyId);
    if (!family) return res.status(404).json({ message: "Family not found" });

    family.status = family.status === "active" ? "suspended" : "active";
    await family.save();

    console.log(
      `🔒 [STATUS] Family ${family.familyName} is now ${family.status}`
    );
    res
      .status(200)
      .json({ message: `Family ${family.status}`, status: family.status });
  } catch (error) {
    res.status(500).json({ message: "Suspension toggle failed" });
  }
});

/**
 * @route   DELETE /api/v1/admin-family/:familyId
 * @desc    NUCLEAR OPTION: Delete family and all associated content
 */
router.delete("/:familyId", protectAdmin, async (req, res) => {
  const { familyId } = req.params;
  console.log(`☢️ [NUCLEAR] Purging Family: ${familyId}`);

  try {
    // 1. Delete all associated assets in parallel
    await Promise.all([
      Task.deleteMany({ family: familyId }),
      Poll.deleteMany({ familyId: familyId }),
      Suggestion.deleteMany({ familyId: familyId }),
      Report.deleteMany({ familyId: familyId }),
      News.deleteMany({ family: familyId }),
      FamilyContent.deleteMany({ familyId: familyId }),
      DonationCampaign.deleteMany({ family: familyId }),
      SafetyNet.deleteMany({ family: familyId }),
      Family.findByIdAndDelete(familyId),
    ]);

    console.log("🗑️ [SUCCESS] Family and all nested assets purged.");
    res
      .status(200)
      .json({ message: "Family and all related data permanently deleted" });
  } catch (error) {
    res.status(500).json({ message: "Nuclear delete failed" });
  }
});

router.get("/:familyId/assets/:assetType", protectAdmin, async (req, res) => {
  const { familyId, assetType } = req.params;

  try {
    let data;
    switch (assetType.toLowerCase()) {
      case "tasks":
        data = await Task.find({ family: familyId }).sort({ createdAt: -1 });
        break;
      case "polls":
        data = await Poll.find({ familyId: familyId }).sort({ createdAt: -1 });
        break;
      case "news":
        data = await News.find({ family: familyId }).sort({ createdAt: -1 });
        break;
      case "reports":
        data = await Report.find({ familyId: familyId }).sort({
          createdAt: -1,
        });
        break;
      case "suggestions":
        data = await Suggestion.find({ familyId: familyId }).sort({
          createdAt: -1,
        });
        break;
      case "campaigns":
        data = await DonationCampaign.find({ family: familyId }).sort({
          createdAt: -1,
        });
        break;
      case "safetynets":
        data = await SafetyNet.find({ family: familyId }).sort({
          createdAt: -1,
        });
        break;
      default:
        return res.status(400).json({ message: "Invalid asset type" });
    }
    res.status(200).json({ count: data.length, data });
  } catch (error) {
    res.status(500).json({ message: `Error fetching ${assetType}` });
  }
});

/**
 * @route   GET /api/v1/admin-family/:familyId/content-dive/:contentType
 * @desc    Fetch specialized content filtered by your specific Enum
 * @params  contentType: Must match one of the defined content enums
 */
router.get(
  "/:familyId/content-dive/:contentType",
  protectAdmin,
  async (req, res) => {
    const { familyId, contentType } = req.params;

    // Your Specific Content Enums
    const allowedEnums = [
      "Family Tree",
      "Family History",
      "Village Story",
      "Village Tradition",
      "Language Lesson",
      "King",
      "Patriarch",
      "Resolution",
      "Suggestion Box",
      "My Village",
      "Key Date",
      "Task",
      "History",
    ];

    // Logic: Ensure the requested type exists in our system
    if (!allowedEnums.includes(contentType)) {
      return res.status(400).json({
        message: "Invalid Content Type",
        validOptions: allowedEnums,
      });
    }

    try {
      console.log(`📖 [DIVE] Auditing ${contentType} for Family: ${familyId}`);

      const content = await FamilyContent.find({
        familyId,
        contentType: contentType, // Filtering by your Enum
      }).sort({ createdAt: -1 });

      res.status(200).json({
        familyId,
        contentType,
        count: content.length,
        data: content,
      });
    } catch (error) {
      console.error("🚨 Content Dive Error:", error);
      res.status(500).json({ message: "Failed to retrieve filtered content" });
    }
  }
);

/**
 * @route   GET /api/v1/admin-family/global-assets/:assetType
 * @desc    Fetch ALL assets of a specific type across the entire platform
 * @params  assetType: "polls" | "news" | "tasks" | "reports" | "suggestions" | "campaigns" | "safetynets"
 */
router.get("/global-assets/:assetType", protectAdmin, async (req, res) => {
  const { assetType } = req.params;
  console.log(`🌍 [GLOBAL AUDIT] Fetching all ${assetType} platform-wide`);

  try {
    let data;
    // We populate 'family' or 'familyId' so the Admin knows where the content originated
    switch (assetType.toLowerCase()) {
      case "tasks":
        data = await Task.find()
          .populate("family", "familyName")
          .sort({ createdAt: -1 });
        break;
      case "polls":
        data = await Poll.find()
          .populate("familyId", "familyName")
          .sort({ createdAt: -1 });
        break;
      case "news":
        data = await News.find()
          .populate("family", "familyName")
          .sort({ createdAt: -1 });
        break;
      case "reports":
        data = await Report.find()
          .populate("familyId", "familyName")
          .sort({ createdAt: -1 });
        break;
      case "suggestions":
        data = await Suggestion.find()
          .populate("familyId", "familyName")
          .sort({ createdAt: -1 });
        break;
      case "campaigns":
        data = await DonationCampaign.find()
          .populate("family", "familyName")
          .sort({ createdAt: -1 });
        break;
      case "safetynets":
        data = await SafetyNet.find()
          .populate("family", "familyName")
          .sort({ createdAt: -1 });
        break;
      default:
        return res.status(400).json({ message: "Invalid asset type" });
    }

    res.status(200).json({
      scope: "GLOBAL",
      type: assetType,
      count: data.length,
      data,
    });
  } catch (error) {
    res.status(500).json({ message: `Error fetching global ${assetType}` });
  }
});

router.get("/global-content/:contentType", protectAdmin, async (req, res) => {
  const { contentType } = req.params;

  const allowedEnums = [
    "Family Tree",
    "Family History",
    "Village Story",
    "Village Tradition",
    "Language Lesson",
    "King",
    "Patriarch",
    "Resolution",
    "Suggestion Box",
    "My Village",
    "Key Date",
    "Task",
    "History",
  ];

  if (!allowedEnums.includes(contentType)) {
    return res
      .status(400)
      .json({ message: "Invalid Content Type", validOptions: allowedEnums });
  }

  try {
    console.log(
      `🌍 [GLOBAL CONTENT DIVE] Auditing ${contentType} platform-wide`
    );

    const content = await FamilyContent.find({ contentType })
      .populate("familyId", "familyName")
      .sort({ createdAt: -1 });

    res.status(200).json({
      scope: "GLOBAL",
      contentType,
      count: content.length,
      data: content,
    });
  } catch (error) {
    console.error("🚨 Global Content Error:", error);
    res.status(500).json({ message: "Failed to retrieve global content" });
  }
});

router.delete(
  "/global-assets/:assetType/:id",
  protectAdmin,
  async (req, res) => {
    const { assetType, id } = req.params;
    console.log(`🗑️ [AUDIT DELETE] Purging ${assetType} ID: ${id}`);

    try {
      let Model;
      switch (assetType.toLowerCase()) {
        case "tasks":
          Model = Task;
          break;
        case "polls":
          Model = Poll;
          break;
        case "news":
          Model = News;
          break;
        case "reports":
          Model = Report;
          break;
        case "suggestions":
          Model = Suggestion;
          break;
        case "campaigns":
          Model = DonationCampaign;
          break;
        case "safetynets":
          Model = SafetyNet;
          break;
        default:
          return res.status(400).json({ message: "Invalid asset type" });
      }

      const deletedItem = await Model.findByIdAndDelete(id);
      if (!deletedItem)
        return res.status(404).json({ message: "Item not found" });

      res
        .status(200)
        .json({ message: `${assetType} item deleted successfully`, id });
    } catch (error) {
      res.status(500).json({ message: "Delete operation failed" });
    }
  }
);

module.exports = router;
