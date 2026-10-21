const express = require("express");
const router = express.Router();
const DonationCampaign = require("../models/DonationCampaign");
const Contribution = require("../models/Contribution");
const Family = require("../models/Family");
const { protect } = require("../middlewares/authMiddleware");
const { createFamilyNotifications } = require("../utils/notificationHelper");
const multer = require("multer");
const { uploadToBackblaze } = require("../utils/uploadToBackblaze");

// Use memoryStorage so the file buffer is passed to Backblaze correctly
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB Limit
});

/**
 * 🔐 Helpers – owner is now an array
 */
const isUserOwner = (family, userId) => {
  const owners = Array.isArray(family.owner)
    ? family.owner
    : family.owner
    ? [family.owner]
    : [];
  return owners.some((o) => {
    const id = o._id ? o._id.toString() : o.toString();
    return id === userId.toString();
  });
};

const hasFamilyAccess = (family, userId) => {
  return (
    isUserOwner(family, userId) ||
    family.members.some((m) => m.toString() === userId.toString())
  );
};

const canManageCampaign = (campaign, family, userId) => {
  return (
    campaign.createdBy.toString() === userId.toString() ||
    isUserOwner(family, userId)
  );
};

// ---------------------------------------------------------
// 1️⃣ CREATE DONATION CAMPAIGN
// ---------------------------------------------------------
router.post("/families/:familyId/donations", protect, async (req, res) => {
  try {
    const { familyId } = req.params;
    const {
      title,
      purpose,
      targetAmount,
      minimumDonation,
      deadline,
      accountDetails,
      visibility,
    } = req.body;

    const family = await Family.findById(familyId);
    if (!family) return res.status(404).json({ message: "Family not found" });

    if (!hasFamilyAccess(family, req.user._id.toString())) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const campaign = await DonationCampaign.create({
      family: familyId,
      createdBy: req.user._id,
      title,
      purpose,
      targetAmount: Number(targetAmount),
      minimumDonation: Number(minimumDonation) || 1,
      deadline,
      accountDetails,
      visibility: visibility || "PUBLIC",
    });

    await createFamilyNotifications(familyId, req.user._id, {
      type: "DONATION_CREATED",
      title: "New Donation Campaign",
      message: `${req.user.firstName} started: "${title}"`,
      relatedId: campaign._id,
    });

    res.status(201).json({ message: "Campaign created", campaign });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ---------------------------------------------------------
// 2️⃣ GET ALL CAMPAIGNS (By Family)
// ---------------------------------------------------------
router.get("/families/:familyId/donations", protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { familyId } = req.params;

    const family = await Family.findById(familyId);
    if (!family || !hasFamilyAccess(family, userId.toString())) {
      return res.status(403).json({ message: "Access denied" });
    }

    // 1️⃣ Fetch campaigns
    const campaigns = await DonationCampaign.find({
      family: familyId,
    })
      .populate("createdBy", "firstName lastName")
      .sort({ createdAt: -1 });

    // 2️⃣ Mark ALL campaigns as read
    await DonationCampaign.updateMany(
      { family: familyId },
      { $addToSet: { isRead: userId } }
    );

    // 3️⃣ Mark ALL contributions (for this family) as read
    const familyCampaignIds = campaigns.map((c) => c._id);

    await Contribution.updateMany(
      { campaign: { $in: familyCampaignIds } },
      { $addToSet: { isRead: userId } }
    );

    res.status(200).json(campaigns);
  } catch (error) {
    console.error("❌ Error fetching campaigns:", error);
    res.status(500).json({ message: "Error fetching campaigns" });
  }
});

// ---------------------------------------------------------
// 3️⃣ CONTRIBUTE TO A CAMPAIGN (Submit Proof)
// ---------------------------------------------------------
router.post(
  "/donations/:campaignId/contribute",
  protect,
  upload.single("paymentProof"),
  async (req, res) => {
    try {
      const { campaignId } = req.params;
      const { amountSent, displayPreference } = req.body;

      const campaign = await DonationCampaign.findById(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      if (Number(amountSent) < campaign.minimumDonation) {
        return res.status(400).json({
          message: `Minimum contribution is $${campaign.minimumDonation}`,
        });
      }

      if (!req.file) {
        return res
          .status(400)
          .json({ message: "Payment proof (screenshot/receipt) is required" });
      }

      const proofUrl = await uploadToBackblaze(
        req.file.buffer,
        req.file.originalname,
        "payment-proofs"
      );

      const contribution = await Contribution.create({
        campaign: campaignId,
        contributor: req.user._id,
        amountSent: Number(amountSent),
        paymentProof: {
          url: proofUrl,
          size: req.file.size,
        },
        displayPreference: displayPreference || "NAMED",
      });
      const isAnonymous = (displayPreference || "NAMED") === "ANONYMOUS";

      await createFamilyNotifications(campaign.family, req.user._id, {
        type: "CONTRIBUTION_SUBMITTED",
        title: "Payment Received",
        message: isAnonymous
          ? `An anonymous contribution was submitted for "${campaign.title}"`
          : `${req.user.firstName} submitted a payment for "${campaign.title}"`,
        relatedId: campaign._id,
      });

      res.status(201).json({
        message: "Contribution submitted for verification",
        contribution,
      });
    } catch (error) {
      console.error("Contribution Error:", error);
      res.status(500).json({
        message: error.message || "Error submitting contribution",
      });
    }
  }
);

// ---------------------------------------------------------
// 4️⃣ UPDATE CAMPAIGN (Admin/Creator only)
// ---------------------------------------------------------
router.put("/donations/:campaignId", protect, async (req, res) => {
  try {
    const campaign = await DonationCampaign.findById(req.params.campaignId);
    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    const family = await Family.findById(campaign.family);
    if (!family) {
      return res.status(404).json({ message: "Family not found" });
    }

    if (!canManageCampaign(campaign, family, req.user._id.toString())) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    Object.assign(campaign, req.body);
    await campaign.save();

    res.status(200).json({ message: "Updated successfully", campaign });
  } catch (error) {
    res.status(500).json({ message: "Update failed" });
  }
});

// ---------------------------------------------------------
// 5️⃣ DELETE DONATION CAMPAIGN
// ---------------------------------------------------------
router.delete("/donations/:campaignId", protect, async (req, res) => {
  try {
    const { campaignId } = req.params;

    const campaign = await DonationCampaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ message: "Donation campaign not found" });
    }

    const family = await Family.findById(campaign.family);
    if (!family) {
      return res.status(404).json({ message: "Associated family not found" });
    }

    if (!canManageCampaign(campaign, family, req.user._id.toString())) {
      return res.status(403).json({
        message:
          "Unauthorized: Only the creator or family owner can delete this campaign",
      });
    }

    const campaignTitle = campaign.title;
    const familyId = family._id;

    // Cleanup: Delete all contributions linked to this campaign
    await Contribution.deleteMany({ campaign: campaignId });

    // Delete the campaign itself
    await campaign.deleteOne();

    // Notify family
    await createFamilyNotifications(familyId, req.user._id, {
      type: "DONATION_DELETED",
      title: "Campaign Removed",
      message: `The campaign "${campaignTitle}" has been deleted by ${req.user.firstName}.`,
      relatedId: familyId,
    });

    res.status(200).json({
      message: "Donation campaign and all related records deleted successfully",
    });
  } catch (error) {
    console.error("Delete campaign error:", error);
    res
      .status(500)
      .json({ message: "Server error deleting donation campaign" });
  }
});

// ---------------------------------------------------------
// 6️⃣ GET ALL CONTRIBUTIONS FOR A FAMILY (Admin View)
// ---------------------------------------------------------
router.get(
  "/families/:familyId/admin/contributions",
  protect,
  async (req, res) => {
    try {
      const { familyId } = req.params;
      const family = await Family.findById(familyId);

      if (!family || !hasFamilyAccess(family, req.user._id.toString())) {
        return res.status(403).json({ message: "Access denied" });
      }

      const campaigns = await DonationCampaign.find({
        family: familyId,
      }).select("_id");
      const campaignIds = campaigns.map((c) => c._id);

      const contributions = await Contribution.find({
        campaign: { $in: campaignIds },
      })
        .populate("contributor", "firstName lastName email")
        .populate("campaign", "title")
        .sort({ createdAt: -1 });

      res.status(200).json(contributions);
    } catch (error) {
      res.status(500).json({ message: "Error fetching family contributions" });
    }
  }
);

// ---------------------------------------------------------
// 7️⃣ VERIFY OR REJECT CONTRIBUTION (Admin Only)
// ---------------------------------------------------------
router.patch(
  "/contributions/:contributionId/verify",
  protect,
  async (req, res) => {
    try {
      const { contributionId } = req.params;
      const { status, rejectionReason } = req.body; // status: "VERIFIED" or "REJECTED"

      const contribution = await Contribution.findById(contributionId).populate(
        "campaign"
      );
      if (!contribution)
        return res.status(404).json({ message: "Contribution not found" });

      const family = await Family.findById(contribution.campaign.family);
      if (!family) {
        return res.status(404).json({ message: "Family not found" });
      }

      // Permission: Only Campaign Creator or Family Owner
      if (
        !canManageCampaign(
          contribution.campaign,
          family,
          req.user._id.toString()
        )
      ) {
        return res
          .status(403)
          .json({ message: "Unauthorized to verify payments" });
      }

      if (contribution.verificationStatus !== "PENDING") {
        return res
          .status(400)
          .json({ message: "This contribution has already been processed" });
      }

      contribution.verificationStatus = status;
      if (status === "REJECTED") {
        contribution.rejectionReason = rejectionReason || "No reason provided";
      }

      await contribution.save();

      // Notify the contributor
      await createFamilyNotifications(family._id, req.user._id, {
        type: status === "VERIFIED" ? "PAYMENT_APPROVED" : "PAYMENT_REJECTED",
        title: status === "VERIFIED" ? "Payment Verified" : "Payment Declined",
        message:
          status === "VERIFIED"
            ? `Your payment of ₦${contribution.amountSent.toLocaleString()} for "${
                contribution.campaign.title
              }" was approved.`
            : `Your payment for "${contribution.campaign.title}" was declined: ${rejectionReason}`,
        relatedId: contribution.campaign._id,
        recipientId: contribution.contributor,
      });

      res.status(200).json({
        message: `Contribution ${status.toLowerCase()} successfully`,
        contribution,
      });
    } catch (error) {
      res.status(500).json({ message: "Error updating verification status" });
    }
  }
);

// ---------------------------------------------------------
// 8️⃣ GET MY CONTRIBUTIONS (User View)
// ---------------------------------------------------------
router.get("/my-contributions", protect, async (req, res) => {
  try {
    const contributions = await Contribution.find({ contributor: req.user._id })
      .populate("campaign", "title status totalRaised targetAmount")
      .sort({ createdAt: -1 });

    res.status(200).json(contributions);
  } catch (error) {
    res.status(500).json({ message: "Error fetching your contributions" });
  }
});

module.exports = router;
