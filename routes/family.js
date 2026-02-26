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
const FamilyContent = require("../models/FamilyContent");
const sendInviteEmail = require("../utils/sendInviteEmail");
const DonationCampaign = require("../models/DonationCampaign");
const Contribution = require("../models/Contribution");
const SafetyNet = require("../models/SafetyNet");

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
      .populate("owner", "firstName lastName email profilePicture")
      .populate("members", "firstName lastName email profilePicture");

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
    const currentUserId = req.user._id;
    const userIdStr = currentUserId.toString();

    const families = await Family.find({
      $or: [{ owner: currentUserId }, { members: currentUserId }],
    })
      .populate("owner", "firstName lastName email profilePicture")
      .populate("members", "firstName lastName email profilePicture")
      .sort({ createdAt: -1 });

    const enrichedFamilies = await Promise.all(
      families.map(async (f) => {
        const family = f.toObject();

        // -------------------------
        // FLAGS
        // -------------------------
        const isOwner = family.owner._id.toString() === userIdStr;
        const isMember = family.members.some(
          (m) => m._id.toString() === userIdStr
        );

        // -------------------------
        // GLOBAL UNREAD COUNTS
        // -------------------------
        const [tasks, polls, suggestions, reports, news] = await Promise.all([
          Task.countDocuments({
            family: family._id,
            isRead: { $ne: currentUserId },
          }),
          Poll.countDocuments({
            familyId: family._id,
            isRead: { $ne: currentUserId },
            status: "active",
          }),
          Suggestion.countDocuments({
            familyId: family._id,
            isRead: { $ne: currentUserId },
          }),
          Report.countDocuments({
            familyId: family._id,
            isRead: { $ne: currentUserId },
          }),
          News.countDocuments({
            family: family._id,
            isRead: { $ne: currentUserId },
          }),
        ]);

        const unreadSummary = {
          tasks,
          polls,
          suggestions,
          reports,
          news,
        };

        // -------------------------
        // CONTENT STATUS
        // -------------------------
        const contentUnreadData = await FamilyContent.aggregate([
          {
            $match: {
              familyId: family._id,
              isRead: { $ne: currentUserId },
            },
          },
          {
            $group: {
              _id: "$contentType",
              count: { $sum: 1 },
            },
          },
        ]);

        const map = {};
        contentUnreadData.forEach((c) => {
          map[c._id] = c.count;
        });

        const allContentTypes = [
          "Family Tree",
          "History",
          "Village Tradition",
          "Language Lesson",
          "King",
          "Patriarch",
          "Resolution",
          "My Village",
          "Suggestion Box",
        ];

        const contentStatus = allContentTypes.map((type) => ({
          type,
          unreadCount: map[type] || 0,
          hasUnread: (map[type] || 0) > 0,
        }));

        return {
          ...family,
          unreadSummary,
          contentStatus,
          isOwner,
          isMember,
          isNotMember: !(isOwner || isMember),
        };
      })
    );

    res.status(200).json(enrichedFamilies);
  } catch (error) {
    console.error("Fetch families error:", error);
    res.status(500).json({ message: "Server error fetching families" });
  }
});

// 3. GET SINGLE FAMILY BY ID (WITH UNREAD COUNTS)
router.get("/:id", protect, async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const currentUserIdStr = currentUserId.toString();

    const familyDoc = await Family.findById(req.params.id)
      .populate("owner", "firstName lastName email profilePicture isOnline")
      .populate("members", "firstName lastName email profilePicture isOnline");

    if (!familyDoc) {
      return res.status(404).json({ message: "Family not found" });
    }

    // 🔹 Permissions
    const isOwner = familyDoc.owner._id.toString() === currentUserIdStr;
    const isMember = familyDoc.members.some(
      (m) => m._id.toString() === currentUserIdStr
    );
    const isInviteSent =
      familyDoc.pendingInvites?.some(
        (id) => id.toString() === currentUserIdStr
      ) || false;
    const isJoinRequestSent =
      familyDoc.joinRequests?.some(
        (id) => id.toString() === currentUserIdStr
      ) || false;

    // 🔹 Global Feature Counts
    const [
      globalTasks,
      globalPolls,
      globalSuggestions,
      globalReports,
      globalNews,
      unreadCampaigns,
      globalSafetyNets, // 🔥 NEW: Unread Safety Nets
    ] = await Promise.all([
      Task.countDocuments({
        family: familyDoc._id,
        isRead: { $ne: currentUserId },
      }),
      Poll.countDocuments({
        familyId: familyDoc._id,
        isRead: { $ne: currentUserId },
        status: "active",
      }),
      Suggestion.countDocuments({
        familyId: familyDoc._id,
        isRead: { $ne: currentUserId },
      }),
      Report.countDocuments({
        familyId: familyDoc._id,
        isRead: { $ne: currentUserId },
      }),
      News.countDocuments({
        family: familyDoc._id,
        isRead: { $ne: currentUserId },
      }),
      // ✅ Unread DonationCampaigns
      DonationCampaign.countDocuments({
        family: familyDoc._id,
        isRead: { $ne: currentUserId },
      }),
      // 🔥 NEW: Count Released Safety Nets assigned to user that haven't been read
      SafetyNet.countDocuments({
        family: familyDoc._id,
        assignedUsers: currentUserId,
        status: "RELEASED", // Only count as unread if they can actually see the content
        isRead: { $ne: currentUserId },
      }),
    ]);

    // 🔥 Count unread Contributions
    const unreadContributionsAgg = await Contribution.aggregate([
      {
        $lookup: {
          from: "donationcampaigns",
          localField: "campaign",
          foreignField: "_id",
          as: "campaignData",
        },
      },
      { $unwind: "$campaignData" },
      {
        $match: {
          "campaignData.family": familyDoc._id,
          isRead: { $ne: currentUserId },
        },
      },
      { $count: "count" },
    ]);

    const unreadContributions =
      unreadContributionsAgg.length > 0 ? unreadContributionsAgg[0].count : 0;

    const totalUnreadDonations = unreadCampaigns + unreadContributions;

    // 🔹 FamilyContent Type Counts
    const contentUnreadData = await FamilyContent.aggregate([
      {
        $match: {
          familyId: familyDoc._id,
          isRead: { $ne: currentUserId },
        },
      },
      {
        $group: {
          _id: "$contentType",
          count: { $sum: 1 },
        },
      },
    ]);

    const contentUnreadMap = contentUnreadData.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    const allContentTypes = [
      "Family Tree", "History", "Village Tradition", "Language Lesson",
      "King", "Patriarch", "Resolution", "My Village", "Suggestion Box",
    ];

    const contentStatus = allContentTypes.map((type) => ({
      type,
      unreadCount: contentUnreadMap[type] || 0,
      hasUnread: (contentUnreadMap[type] || 0) > 0,
    }));

    // 🔹 Prepare members
    const membersWithUUIDAndUnreadCounts = await Promise.all(
      (familyDoc.members || []).map(async (member) => {
        const memberId = member._id.toString();

        if (memberId === currentUserIdStr) {
          return {
            ...member.toObject(),
            uuid: null,
            unreadCounts: {
              tasks: 0,
              polls: 0,
              suggestions: 0,
              reports: 0,
              news: 0,
              donations: 0,
              safetyNets: 0, // NEW
            },
          };
        }

        const usersPair = [currentUserIdStr, memberId].sort();
        let unified = await UnifiedIds.findOne({ users: { $size: 2, $all: usersPair } });

        if (!unified) {
          unified = await UnifiedIds.create({
            users: usersPair,
            unifiedId: crypto.randomUUID(),
          });
        }

        const [mTasks, mReports] = await Promise.all([
          Task.countDocuments({
            family: familyDoc._id,
            assignedTo: memberId,
            isRead: { $ne: currentUserId },
          }),
          Report.countDocuments({
            familyId: familyDoc._id,
            sender: memberId,
            isRead: { $ne: currentUserId },
          }),
        ]);

        return {
          ...member.toObject(),
          uuid: unified.unifiedId,
          unreadCounts: {
            tasks: mTasks,
            reports: mReports,
          },
        };
      })
    );

    // 🔹 Final Assembly
    const family = familyDoc.toObject();
    family.members = membersWithUUIDAndUnreadCounts;

    family.unreadSummary = {
      tasks: globalTasks,
      polls: globalPolls,
      suggestions: globalSuggestions,
      reports: globalReports,
      news: globalNews,
      donations: totalUnreadDonations,
      safetyNets: globalSafetyNets, // 🔥 NEW: Added to summary
    };

    family.contentStatus = contentStatus;
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
    res.status(500).json({ message: "Server error fetching family details" });
  }
});
// 4. LOOKUP FAMILY BY INVITE CODE
router.get("/invite/:inviteCode", protect, async (req, res) => {
  try {
    const familyDoc = await Family.findOne({
      inviteCode: req.params.inviteCode.toUpperCase(),
    })
      .populate("owner", "firstName lastName email profilePicture")
      .populate("members", "firstName lastName email profilePicture");

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
      .populate("owner", "firstName lastName email profilePicture")
      .populate("members", "firstName lastName email profilePicture");

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

router.post("/new-invite/send", protect, async (req, res) => {
  console.log("📩 INVITE ROUTE HIT");
  console.log("➡️ Request body:", req.body);
  console.log("👤 Inviter:", req.user?._id);

  try {
    const { emails, familyId } = req.body;

    if (!emails) {
      console.log("❌ No emails provided");
      return res.status(400).json({ message: "Email(s) required" });
    }

    const emailList = Array.isArray(emails) ? emails : [emails];
    console.log("📨 Email list:", emailList);

    const family = await Family.findById(familyId);
    console.log("🏠 Family found:", family?._id);

    if (!family) {
      console.log("❌ Family not found:", familyId);
      return res.status(404).json({ message: "Family not found" });
    }

    // 🔐 Only owner can invite
    if (String(family.owner) !== String(req.user._id)) {
      console.log("🚫 Unauthorized invite attempt by:", req.user._id);
      return res.status(403).json({ message: "Unauthorized" });
    }

    const results = [];

    for (const email of emailList) {
      console.log("➡️ Processing email:", email);

      const normalizedEmail = email.toLowerCase().trim();
      console.log("🔤 Normalized email:", normalizedEmail);

      const user = await User.findOne({ email: normalizedEmail });
      console.log("👤 User lookup result:", user?._id || "NON-USER");

      // 🧍 EXISTING USER
      if (user) {
        const alreadyMember = family.members.some(
          (id) => id.toString() === user._id.toString()
        );

        const alreadyInvited = family.pendingInvites?.some(
          (id) => id.toString() === user._id.toString()
        );

        console.log("👥 Already member:", alreadyMember);
        console.log("📨 Already invited:", alreadyInvited);

        if (alreadyMember || alreadyInvited) {
          console.log("⚠️ Skipping user, already involved:", normalizedEmail);
          results.push({
            email: normalizedEmail,
            status: "already-invited",
          });
          continue;
        }

        // ➕ Add to pending invites
        family.pendingInvites.push(user._id);
        console.log("➕ Added to pendingInvites:", user._id);

        // 🔔 CREATE IN-APP NOTIFICATION
        console.log("🔔 Creating in-app notification for user:", user._id);
        await createFamilyNotifications(familyId, req.user._id, {
          type: "FAMILY_INVITE",
          title: "Family Invitation",
          message: `You were invited to join "${family.familyName}"`,
          relatedId: familyId,
          receiver: user._id,
        });
        console.log("✅ Notification created");
      }

      // 📧 SEND EMAIL (USER OR NON-USER)
      console.log("📧 Sending invite email to:", normalizedEmail);
      await sendInviteEmail({
        to: normalizedEmail,
        familyName: family.familyName,
        inviterName: `${req.user.firstName} ${req.user.lastName}`,
        inviteCode: family.inviteCode,
      });
      console.log("✅ Email sent to:", normalizedEmail);

      results.push({
        email: normalizedEmail,
        status: user ? "invite-sent-user" : "invite-sent-non-user",
      });
    }

    console.log("💾 Saving family with updated pendingInvites");
    await family.save();
    console.log("✅ Family saved");

    console.log("📤 Final response results:", results);

    res.status(200).json({
      message: "Invites processed successfully",
      results,
    });
  } catch (error) {
    console.error("❌ Invite route crashed");
    console.error(error);
    res.status(500).json({ message: "Server error sending invites" });
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
      "firstName lastName email profilePicture"
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
    const { userIds } = req.body;

    if (!Array.isArray(userIds)) {
      return res.status(400).json({ message: "userIds must be an array" });
    }

    const family = await Family.findById(familyId);
    if (!family) {
      return res.status(404).json({ message: "Family not found" });
    }

    if (family.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const uniqueUserIds = new Set(userIds.map((id) => id.toString()));
    uniqueUserIds.add(family.owner.toString());

    const finalUserIds = Array.from(uniqueUserIds);

    const users = await User.find({ _id: { $in: finalUserIds } }).select("_id");

    if (users.length !== finalUserIds.length) {
      return res.status(400).json({ message: "One or more users not found" });
    }

    family.members = users.map((u) => u._id);

    family.pendingInvites = family.pendingInvites?.filter((id) =>
      finalUserIds.includes(id.toString())
    );
    family.joinRequests = family.joinRequests?.filter((id) =>
      finalUserIds.includes(id.toString())
    );

    await family.save();

    await createFamilyNotifications(familyId, req.user._id, {
      type: "MEMBER_JOINED",
      title: "Family Members Updated",
      message: `"${family.familyName}" members list was updated`,
      relatedId: familyId,
    });

    const populatedFamily = await Family.findById(familyId)
      .populate("owner", "firstName lastName email profilePicture")
      .populate("members", "firstName lastName email profilePicture");

    res.status(200).json({
      message: "Family members updated successfully",
      family: populatedFamily,
    });
  } catch (error) {
    console.error("Update members error:", error);
    res.status(500).json({ message: "Server error updating members" });
  }
});

// 15. SUSPEND A USER (OWNER ONLY)
router.post("/:familyId/suspend/:userId", protect, async (req, res) => {
  try {
    const { familyId, userId } = req.params;
    const family = await Family.findById(familyId);

    if (!family) return res.status(404).json({ message: "Family not found" });

    // Only owner can suspend
    if (family.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Unauthorized" });

    // Cannot suspend owner
    if (family.owner.toString() === userId)
      return res.status(400).json({ message: "Cannot suspend owner" });

    // Check if user is a member
    if (!family.members.includes(userId))
      return res.status(400).json({ message: "User is not a member" });

    // Add to suspendedMembers if not already
    family.suspendedMembers = family.suspendedMembers || [];
    if (!family.suspendedMembers.includes(userId)) {
      family.suspendedMembers.push(userId);
      await family.save();

      await createFamilyNotifications(familyId, req.user._id, {
        type: "USER_SUSPENDED",
        title: "Member Suspended",
        message: `User was suspended from "${family.familyName}"`,
        relatedId: familyId,
        receiver: userId,
      });
    }

    res.status(200).json({
      message: "User suspended",
      suspendedMembers: family.suspendedMembers,
    });
  } catch (error) {
    console.error("Suspend user error:", error);
    res.status(500).json({ message: "Server error suspending user" });
  }
});

// 16. UNSUSPEND A USER (OWNER ONLY)
router.post("/:familyId/unsuspend/:userId", protect, async (req, res) => {
  try {
    const { familyId, userId } = req.params;
    const family = await Family.findById(familyId);

    if (!family) return res.status(404).json({ message: "Family not found" });

    // Only owner can unsuspend
    if (family.owner.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Unauthorized" });

    // Remove from suspendedMembers if exists
    family.suspendedMembers = family.suspendedMembers || [];
    if (family.suspendedMembers.includes(userId)) {
      family.suspendedMembers = family.suspendedMembers.filter(
        (id) => id.toString() !== userId
      );
      await family.save();

      await createFamilyNotifications(familyId, req.user._id, {
        type: "USER_UNSUSPENDED",
        title: "Member Unsuspended",
        message: `User was unsuspended in "${family.familyName}"`,
        relatedId: familyId,
        receiver: userId,
      });
    }

    res.status(200).json({
      message: "User unsuspended",
      suspendedMembers: family.suspendedMembers,
    });
  } catch (error) {
    console.error("Unsuspend user error:", error);
    res.status(500).json({ message: "Server error unsuspending user" });
  }
});

module.exports = router;
