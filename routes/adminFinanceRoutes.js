const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../middlewares/adminAuth");

// Models
const DonationCampaign = require("../models/DonationCampaign");
const Contribution = require("../models/Contribution");
const Family = require("../models/Family");

/**
 * @route   GET /api/v1/admin-finance/campaigns
 * @desc    Get all campaigns across the platform (Master Audit)
 */
router.get("/campaigns", protectAdmin, async (req, res) => {
  try {
    const campaigns = await DonationCampaign.find()
      .populate("family", "familyName")
      .populate("createdBy", "firstName lastName email")
      .sort({ createdAt: -1 });

    res.status(200).json(campaigns);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch platform campaigns" });
  }
});

/**
 * @route   GET /api/v1/admin-finance/campaigns/:campaignId/contributions
 * @desc    Get all contributions for a specific campaign
 */
router.get(
  "/campaigns/:campaignId/contributions",
  protectAdmin,
  async (req, res) => {
    try {
      const contributions = await Contribution.find({
        campaign: req.params.campaignId,
      })
        .populate("contributor", "firstName lastName email")
        .sort({ createdAt: -1 });

      res.status(200).json(contributions);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Failed to fetch contributions for this campaign" });
    }
  }
);

/**
 * @route   GET /api/v1/admin-finance/family/:familyId
 * @desc    Get all financial activity for a specific family
 */
router.get("/family/:familyId", protectAdmin, async (req, res) => {
  try {
    const campaigns = await DonationCampaign.find({
      family: req.params.familyId,
    }).sort({ createdAt: -1 });

    // Get all contributions linked to these campaigns
    const campaignIds = campaigns.map((c) => c._id);
    const contributions = await Contribution.find({
      campaign: { $in: campaignIds },
    })
      .populate("contributor", "firstName lastName")
      .populate("campaign", "title");

    res.status(200).json({
      campaigns,
      contributions,
      totalRaisedAcrossFamily: campaigns.reduce(
        (acc, curr) => acc + curr.totalRaised,
        0
      ),
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch family financial records" });
  }
});

/**
 * @route   PATCH /api/v1/admin-finance/verify-contribution/:contributionId
 * @desc    Admin override to verify/reject a contribution
 */
router.patch(
  "/verify-contribution/:contributionId",
  protectAdmin,
  async (req, res) => {
    const { status, rejectionReason } = req.body; // status: "VERIFIED" or "REJECTED"

    try {
      const contribution = await Contribution.findById(
        req.params.contributionId
      );
      if (!contribution)
        return res
          .status(404)
          .json({ message: "Contribution record not found" });

      // Prevent double verification
      if (contribution.verificationStatus === "VERIFIED") {
        return res
          .status(400)
          .json({ message: "Contribution is already verified" });
      }

      contribution.verificationStatus = status;
      if (rejectionReason) contribution.rejectionReason = rejectionReason;

      await contribution.save(); // Note: This triggers the 'post save' hook in the model to update totalRaised

      res.status(200).json({ message: `Payment ${status}`, contribution });
    } catch (error) {
      res.status(500).json({ message: "Verification update failed" });
    }
  }
);

/**
 * @route   DELETE /api/v1/admin-finance/campaign/:id
 * @desc    Nuclear delete a campaign and its contributions
 */
router.delete("/campaign/:id", protectAdmin, async (req, res) => {
  try {
    await Contribution.deleteMany({ campaign: req.params.id });
    await DonationCampaign.findByIdAndDelete(req.params.id);

    res
      .status(200)
      .json({ message: "Campaign and all linked contributions purged" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete campaign" });
  }
});

module.exports = router;
