const express = require("express");
const router = express.Router();
const Family = require("../models/Family");
const { protect } = require("../middlewares/authMiddleware");
const { createFamilyNotifications } = require("../utils/notificationHelper");
const User = require("../models/User");
const UnifiedIds = require("../models/UnifiedIds");
const crypto = require("crypto");
const Task = require("../models/Task");
const Poll = require("../models/Poll");
const Suggestion = require("../models/Suggestion");
const Report = require("../models/Report");
const News = require("../models/News");

// 1. CREATE A FAMILY
router.post("/", protect, async (req, res) => {
  try {
    const { familyName, familyType, description } = req.body;
    if (!familyName || !familyType)
      return res.status(400).json({ message: "Required fields missing" });

    const newFamily = await Family.create({
      familyName: familyName.trim(),
      familyType,
      description: description?.trim() || "",
      owner: req.user._id,
      members: [req.user._id],
      inviteCode: Math.random().toString(36).substring(2, 10).toUpperCase(),
    });

    const populatedFamily = await Family.findById(newFamily._id)
      .populate("owner", "firstName lastName email")
      .populate("members", "firstName lastName email");

    res
      .status(201)
      .json({ message: "Family created", family: populatedFamily });
  } catch (error) {
    res.status(500).json({ message: "Server error creating family" });
  }
});

// 2. GET ALL USER'S FAMILIES
router.get("/", protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const families = await Family.find({
      $or: [{ owner: req.user._id }, { members: req.user._id }],
    })
      .populate("owner", "firstName lastName email")
      .populate("members", "firstName lastName email")
      .sort({ createdAt: -1 });

    const familiesWithFlags = families.map((f) => {
      const family = f.toObject();
      const isOwner = family.owner._id.toString() === userId;
      const isMember = family.members.some((m) => m._id.toString() === userId);
      return {
        ...family,
        isOwner,
        isMember,
        isNotMember: !(isOwner || isMember),
      };
    });

    res.status(200).json(familiesWithFlags);
  } catch (error) {
    res.status(500).json({ message: "Server error fetching families" });
  }
});

router.get("/:id", protect, async (req, res) => {
  try {
    const currentUserId = req.user._id.toString();

    const familyDoc = await Family.findById(req.params.id)
      .populate("owner", "firstName lastName email")
      .populate("members", "firstName lastName email");

    if (!familyDoc) {
      return res.status(404).json({ message: "Family not found" });
    }

    const isOwner = familyDoc.owner._id.toString() === currentUserId;
    const isMember = familyDoc.members.some(
      (m) => m._id.toString() === currentUserId
    );

    const isInviteSent =
      familyDoc.pendingInvites?.some((id) => id.toString() === currentUserId) ||
      false;

    const isJoinRequestSent =
      familyDoc.joinRequests?.some((id) => id.toString() === currentUserId) ||
      false;

    // --- Prepare members with UUID and unread counts ---
    const membersWithUUIDAndUnreadCounts = await Promise.all(
      (familyDoc.members || []).map(async (member) => {
        const memberId = member._id.toString();

        // Skip self
        if (memberId === currentUserId) {
          return {
            ...member.toObject(),
            uuid: null,
            unreadCounts: {
              tasks: 0,
              polls: 0,
              suggestions: 0,
              reports: 0,
              news: 0,
            },
          };
        }

        // 🔹 Unified UUID logic
        const usersPair = [currentUserId, memberId].sort();
        let unified = await UnifiedIds.findOne({
          users: { $size: 2, $all: usersPair },
        });

        if (!unified) {
          unified = await UnifiedIds.create({
            users: usersPair,
            unifiedId: crypto.randomUUID(),
          });
        }

        // 🔹 Count unread items for current viewer
        const tasksCount = await Task.countDocuments({
          family: familyDoc._id,
          assignedTo: memberId,
          status: { $ne: "completed" },
          readBy: { $ne: currentUserId },
        });

        const pollsCount = await Poll.countDocuments({
          familyId: familyDoc._id,
          "options.votes": { $ne: currentUserId },
          status: "active",
        });

        const suggestionsCount = await Suggestion.countDocuments({
          familyId: familyDoc._id,
          upvotes: { $ne: currentUserId },
          status: "pending",
        });

        const reportsCount = await Report.countDocuments({
          familyId: familyDoc._id,
          sharedWith: memberId,
          status: { $ne: "Completed" },
          readBy: { $ne: currentUserId },
        });

        const newsCount = await News.countDocuments({
          family: familyDoc._id,
          author: { $ne: currentUserId },
          readBy: { $ne: currentUserId },
        });

        return {
          ...member.toObject(),
          uuid: unified.unifiedId,
          unreadCounts: {
            tasks: tasksCount,
            polls: pollsCount,
            suggestions: suggestionsCount,
            reports: reportsCount,
            news: newsCount,
          },
        };
      })
    );

    const family = familyDoc.toObject();
    family.members = membersWithUUIDAndUnreadCounts;
    family.isMember = isMember;
    family.isNotMember = !(isOwner || isMember);
    family.isInviteSent = isInviteSent;
    family.isJoinRequestSent = isJoinRequestSent;

    res.status(200).json({
      family,
      isOwner,
    });
  } catch (error) {
    console.error("❌ Fetch family error:", error);
    res.status(500).json({
      message: "Server error fetching family details",
    });
  }
});
// 4. LOOKUP FAMILY BY INVITE CODE
router.get("/invite/:inviteCode", protect, async (req, res) => {
  try {
    const familyDoc = await Family.findOne({
      inviteCode: req.params.inviteCode.toUpperCase(),
    })
      .populate("owner", "firstName lastName email")
      .populate("members", "firstName lastName email");

    if (!familyDoc)
      return res.status(404).json({ message: "Invalid invite code" });

    const userId = req.user._id.toString();
    const isOwner = familyDoc.owner._id.toString() === userId;
    const isMember = familyDoc.members.some((m) => m._id.toString() === userId);
    const isInviteSent =
      familyDoc.pendingInvites?.some((id) => id.toString() === userId) || false;
    const isJoinRequestSent =
      familyDoc.joinRequests?.some((id) => id.toString() === userId) || false;

    const family = familyDoc.toObject();
    family.isMember = isMember;
    family.isNotMember = !(isOwner || isMember);
    family.isInviteSent = isInviteSent;
    family.isJoinRequestSent = isJoinRequestSent;

    res.status(200).json({ family, isOwner });
  } catch (error) {
    res.status(500).json({ message: "Server error looking up invite" });
  }
});

// 5. UPDATE FAMILY (OWNER ONLY)
router.put("/:id", protect, async (req, res) => {
  try {
    const family = await Family.findById(req.params.id);
    if (!family || family.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Unauthorized" });

    const updatedFamily = await Family.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )
      .populate("owner", "firstName lastName email")
      .populate("members", "firstName lastName email");

    res.status(200).json({ message: "Updated", family: updatedFamily });
  } catch (error) {
    res.status(500).json({ message: "Server error updating family" });
  }
});

// 6. DELETE FAMILY (OWNER ONLY)
router.delete("/:id", protect, async (req, res) => {
  try {
    const family = await Family.findById(req.params.id);
    if (!family || family.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Unauthorized" });
    await family.deleteOne();
    res.status(200).json({ message: "Family deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error deleting family" });
  }
});

// 7. SEND INVITE TO USER (OWNER ONLY)
router.post("/:familyId/invite", protect, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { userId } = req.body;
    const family = await Family.findById(familyId);

    if (!family || family.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Unauthorized" });
    if (
      family.members.includes(userId) ||
      family.pendingInvites?.includes(userId)
    )
      return res.status(400).json({ message: "User already involved" });

    family.pendingInvites.push(userId);
    await family.save();

    await createFamilyNotifications(familyId, req.user._id, {
      type: "FAMILY_INVITE",
      title: "Family Invitation",
      message: `Invited to join "${family.familyName}"`,
      relatedId: familyId,
    });
    res.status(200).json({ message: "Invite sent" });
  } catch (error) {
    res.status(500).json({ message: "Server error sending invite" });
  }
});

// 8. ACCEPT INVITE
router.post("/:familyId/accept", protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const family = await Family.findById(req.params.familyId);
    if (!family || !family.pendingInvites?.includes(userId))
      return res.status(400).json({ message: "No pending invite" });

    family.members.push(userId);
    family.pendingInvites = family.pendingInvites.filter(
      (id) => id.toString() !== userId
    );
    await family.save();

    await createFamilyNotifications(req.params.familyId, userId, {
      type: "FAMILY_JOINED",
      title: "Member Joined",
      message: `${req.user.firstName} joined "${family.familyName}"`,
      relatedId: req.params.familyId,
    });
    res.status(200).json({ message: "Joined successfully", family });
  } catch (error) {
    res.status(500).json({ message: "Server error accepting invite" });
  }
});

// 9. DECLINE INVITE
router.post("/:familyId/decline", protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const family = await Family.findById(req.params.familyId);
    if (!family || !family.pendingInvites?.includes(userId))
      return res.status(400).json({ message: "No invite found" });

    family.pendingInvites = family.pendingInvites.filter(
      (id) => id.toString() !== userId
    );
    await family.save();

    await createFamilyNotifications(req.params.familyId, userId, {
      type: "FAMILY_DECLINED",
      title: "Invite Declined",
      message: `${req.user.firstName} declined the invitation`,
      relatedId: req.params.familyId,
    });
    res.status(200).json({ message: "Invite declined" });
  } catch (error) {
    res.status(500).json({ message: "Server error declining invite" });
  }
});

// 10. REQUEST TO JOIN
router.post("/:familyId/request", protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const family = await Family.findById(req.params.familyId);
    if (!family) return res.status(404).json({ message: "Family not found" });
    if (family.members.includes(userId))
      return res.status(400).json({ message: "Already a member" });

    family.joinRequests.push(userId);
    await family.save();

    await createFamilyNotifications(req.params.familyId, userId, {
      type: "FAMILY_JOIN_REQUEST",
      title: "Join Request",
      message: `${req.user.firstName} wants to join "${family.familyName}"`,
      relatedId: req.params.familyId,
    });
    res.status(200).json({ message: "Request sent" });
  } catch (error) {
    res.status(500).json({ message: "Server error requesting join" });
  }
});

// 11. VIEW JOIN REQUESTS (OWNER ONLY)
router.get("/:familyId/requests", protect, async (req, res) => {
  try {
    const family = await Family.findById(req.params.familyId).populate(
      "joinRequests",
      "firstName lastName email"
    );
    if (!family || family.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Unauthorized" });
    res.status(200).json({ joinRequests: family.joinRequests });
  } catch (error) {
    res.status(500).json({ message: "Server error fetching requests" });
  }
});

// 12. ACCEPT JOIN REQUEST (OWNER ONLY)
router.post("/:familyId/requests/:userId/accept", protect, async (req, res) => {
  try {
    const { familyId, userId } = req.params;
    const family = await Family.findById(familyId);
    if (!family || family.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Unauthorized" });

    family.members.push(userId);
    family.joinRequests = family.joinRequests.filter(
      (id) => id.toString() !== userId
    );
    await family.save();

    await createFamilyNotifications(familyId, req.user._id, {
      type: "FAMILY_JOIN_ACCEPTED",
      title: "Request Accepted",
      message: `Accepted into "${family.familyName}"`,
      relatedId: familyId,
    });
    res.status(200).json({ message: "User added", family });
  } catch (error) {
    res.status(500).json({ message: "Server error accepting request" });
  }
});

// 13. DECLINE JOIN REQUEST (OWNER ONLY)
router.post(
  "/:familyId/requests/:userId/decline",
  protect,
  async (req, res) => {
    try {
      const { familyId, userId } = req.params;
      const family = await Family.findById(familyId);
      if (!family || family.owner.toString() !== req.user._id.toString())
        return res.status(403).json({ message: "Unauthorized" });

      family.joinRequests = family.joinRequests.filter(
        (id) => id.toString() !== userId
      );
      await family.save();

      await createFamilyNotifications(familyId, req.user._id, {
        type: "FAMILY_JOIN_DECLINED",
        title: "Request Declined",
        message: `Join request for "${family.familyName}" declined`,
        relatedId: familyId,
      });
      res.status(200).json({ message: "Request declined" });
    } catch (error) {
      res.status(500).json({ message: "Server error declining request" });
    }
  }
);

// 14. REPLACE FAMILY MEMBERS (OWNER ONLY)
router.put("/:familyId/members", protect, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { userIds } = req.body; // ARRAY OF USER IDS

    if (!Array.isArray(userIds)) {
      return res.status(400).json({ message: "userIds must be an array" });
    }

    const family = await Family.findById(familyId);
    if (!family) {
      return res.status(404).json({ message: "Family not found" });
    }

    // ✅ Only owner can update members
    if (family.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // ✅ Ensure owner is always included
    const uniqueUserIds = new Set(userIds.map((id) => id.toString()));
    uniqueUserIds.add(family.owner.toString());

    const finalUserIds = Array.from(uniqueUserIds);

    // ✅ Validate users exist
    const users = await User.find({ _id: { $in: finalUserIds } }).select("_id");

    if (users.length !== finalUserIds.length) {
      return res.status(400).json({ message: "One or more users not found" });
    }

    // ✅ Replace members array completely
    family.members = users.map((u) => u._id);

    // Optional: clean pending invites & join requests
    family.pendingInvites = family.pendingInvites?.filter((id) =>
      finalUserIds.includes(id.toString())
    );
    family.joinRequests = family.joinRequests?.filter((id) =>
      finalUserIds.includes(id.toString())
    );

    await family.save();

    // 🔔 Notify updated members
    await createFamilyNotifications(familyId, req.user._id, {
      type: "MEMBER_JOINED",
      title: "Family Members Updated",
      message: `"${family.familyName}" members list was updated`,
      relatedId: familyId,
    });

    const populatedFamily = await Family.findById(familyId)
      .populate("owner", "firstName lastName email")
      .populate("members", "firstName lastName email");

    res.status(200).json({
      message: "Family members updated successfully",
      family: populatedFamily,
    });
  } catch (error) {
    console.error("Update members error:", error);
    res.status(500).json({ message: "Server error updating members" });
  }
});

module.exports = router;
