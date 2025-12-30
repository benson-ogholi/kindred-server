const express = require("express");
const router = express.Router();
const DonationCampaign = require("../models/DonationCampaign");
const Family = require("../models/Family");
const { protect } = require("../middlewares/authMiddleware");
const { createFamilyNotifications } = require("../utils/notificationHelper");
const stripe = require('stripe')
/**
 * 🔐 Helper: Check family access
 */
const hasFamilyAccess = (family, userId) => {
  return (
    family.owner.toString() === userId ||
    family.members.some((m) => m.toString() === userId)
  );
};

const canManageCampaign = (campaign, family, userId) => {
  return (
    campaign.createdBy.toString() === userId ||
    family.owner.toString() === userId
  );
};

////////////////////////////////////////////////////////////
// 1️⃣ CREATE DONATION CAMPAIGN
// POST /families/:familyId/donations
////////////////////////////////////////////////////////////
router.post("/families/:familyId/donations", protect, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { title, description, targetAmount, minimumDonation, deadline } =
      req.body;

    const family = await Family.findById(familyId);
    if (!family) return res.status(404).json({ message: "Family not found" });

    if (!hasFamilyAccess(family, req.user._id.toString())) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const campaign = await DonationCampaign.create({
      family: familyId,
      createdBy: req.user._id,
      title,
      description,
      targetAmount: Number(targetAmount),
      minimumDonation: minimumDonation ? Number(minimumDonation) : 1,
      deadline,
    });

    // 🔔 CREATE NOTIFICATIONS
    // This sends a notification to everyone in the family
    await createFamilyNotifications(familyId, req.user._id, {
      type: "DONATION_CREATED",
      title: "New Donation Campaign",
      message: `${req.user.firstName} started a new campaign: "${title}"`,
      relatedId: campaign._id,
    });

    res.status(201).json({
      message: "Donation campaign created successfully",
      campaign,
    });
  } catch (error) {
    console.error("Create donation campaign error:", error);
    res
      .status(500)
      .json({ message: "Server error creating donation campaign" });
  }
});
////////////////////////////////////////////////////////////
// 2️⃣ GET ALL CAMPAIGNS BY FAMILY ID
// GET /families/:familyId/donations
////////////////////////////////////////////////////////////
router.get("/families/:familyId/donations", protect, async (req, res) => {
  try {
    const { familyId } = req.params;

    const family = await Family.findById(familyId);
    if (!family) {
      return res.status(404).json({ message: "Family not found" });
    }

    if (!hasFamilyAccess(family, req.user._id.toString())) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const campaigns = await DonationCampaign.find({ family: familyId })
      .populate("createdBy", "firstName lastName email")
      .sort({ createdAt: -1 });

    res.status(200).json(campaigns);
  } catch (error) {
    console.error("Get donation campaigns error:", error);
    res.status(500).json({
      message: "Server error fetching donation campaigns",
    });
  }
});

////////////////////////////////////////////////////////////
// 3️⃣ UPDATE DONATION CAMPAIGN
// PUT /donations/:campaignId
////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////
// 3️⃣ UPDATE DONATION CAMPAIGN
////////////////////////////////////////////////////////////
router.put("/donations/:campaignId", protect, async (req, res) => {
  try {
    const { campaignId } = req.params;

    const campaign = await DonationCampaign.findById(campaignId);
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

    const allowedUpdates = [
      "title",
      "description",
      "targetAmount",
      "minimumDonation",
      "deadline",
      "status",
    ];

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        campaign[field] = req.body[field];
      }
    });

    await campaign.save();

    // 🔔 NOTIFY FAMILY OF UPDATE
    await createFamilyNotifications(family._id, req.user._id, {
      type: "DONATION_UPDATED",
      title: "Campaign Updated",
      message: `${req.user.firstName} updated the details for "${campaign.title}"`,
      relatedId: campaign._id,
    });

    res.status(200).json({
      message: "Donation campaign updated successfully",
      campaign,
    });
  } catch (error) {
    console.error("Update donation campaign error:", error);
    res
      .status(500)
      .json({ message: "Server error updating donation campaign" });
  }
});

////////////////////////////////////////////////////////////
// 4️⃣ DELETE DONATION CAMPAIGN
////////////////////////////////////////////////////////////
router.delete("/donations/:campaignId", protect, async (req, res) => {
  try {
    const { campaignId } = req.params;

    const campaign = await DonationCampaign.findById(campaignId);
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

    // Capture title before deletion for the notification message
    const campaignTitle = campaign.title;
    const familyId = family._id;

    await campaign.deleteOne();

    // 🔔 NOTIFY FAMILY OF DELETION
    await createFamilyNotifications(familyId, req.user._id, {
      type: "DONATION_DELETED",
      title: "Campaign Cancelled",
      message: `The donation campaign "${campaignTitle}" has been removed by ${req.user.firstName}.`,
      relatedId: familyId, // Since campaign is gone, link back to family
    });

    res.status(200).json({
      message: "Donation campaign deleted successfully",
    });
  } catch (error) {
    console.error("Delete donation campaign error:", error);
    res
      .status(500)
      .json({ message: "Server error deleting donation campaign" });
  }
});

router.post("/donations/payment-intent", protect, async (req, res) => {
  const { amount, campaignId } = req.body;

  // Create or find a Stripe Customer (optional but recommended)
  const customer = await stripe.customers.create();

  const ephemeralKey = await stripe.ephemeralKeys.create(
    { customer: customer.id },
    { apiVersion: "2022-11-15" }
  );

  // Create the secret "Payment Intent"
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount,
    currency: "usd",
    customer: customer.id,
    automatic_payment_methods: { enabled: true },
    metadata: { campaignId, userId: req.user._id.toString() },
  });

  res.json({
    paymentIntent: paymentIntent.client_secret,
    ephemeralKey: ephemeralKey.secret,
    customer: customer.id,
  });
});

module.exports = router;
