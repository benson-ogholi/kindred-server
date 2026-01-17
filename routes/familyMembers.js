const express = require("express");
const router = express.Router();
const FamilyMember = require("../models/FamilyMember");
const { protect } = require("../middlewares/authMiddleware");
const User = require("../models/User");
const Family = require("../models/Family");
const UnifiedIds = require("../models/UnifiedIds");

router.post("/get-members", protect, async (req, res) => {
  try {
    const { familyId } = req.body;
    if (!familyId) {
      return res.status(400).json({ message: "familyId is required" });
    }

    const currentUserId = req.user._id.toString();

    const family = await Family.findById(familyId).populate(
      "owner",
      "firstName lastName profilePicture email"
    );
    if (!family) {
      return res.status(404).json({ message: "Family not found" });
    }

    const members = await FamilyMember.find({ family: familyId })
      .populate("user", "firstName lastName profilePicture email")
      .sort({ joinedAt: 1 });

    const defaultRights = {
      canInvite: false,
      canManageMembers: false,
      canPostNews: false,
      canDeleteAnyContent: false,
      canCreatePolls: false,
      canPostSuggestions: false,
      canParticipateInPolls: false,
      canMakeDonations: false,
      canCommentInteract: false,
      isAdmin: false,
      isModerator: false,
    };

    const simplifiedMembers = await Promise.all(
      members.map(async (m) => {
        const memberUserId = m.user._id.toString();
        const isOwner = memberUserId === family.owner._id.toString();
        const isAdmin = !isOwner && m.rights?.get?.("isAdmin");

        let uuid = null;

        // 🔑 CREATE / FETCH PAIR UUID (EXCEPT SELF)
        if (memberUserId !== currentUserId) {
          const usersPair = [currentUserId, memberUserId].sort();

          let unified = await UnifiedIds.findOne({
            users: { $size: 2, $all: usersPair },
          });

          if (!unified) {
            unified = await UnifiedIds.create({
              users: usersPair,
              unifiedId: crypto.randomUUID(),
            });
          }

          uuid = unified.unifiedId;
        }

        return {
          _id: m._id,
          uuid, // 🔥 UNIQUE PER TWO USERS
          userId: m.user._id,
          firstName: m.user.firstName,
          lastName: m.user.lastName,
          profilePicture: m.user.profilePicture,
          role: isOwner ? "owner" : isAdmin ? "admin" : "member",
          status: m.status || "active",
          joinedAt: m.joinedAt,
          rights: {
            ...defaultRights,
            ...(m.rights || {}),
            ...(isOwner && {
              isAdmin: true,
              isModerator: true,
              canInvite: true,
              canManageMembers: true,
              canPostNews: true,
              canDeleteAnyContent: true,
              canCreatePolls: true,
              canPostSuggestions: true,
              canParticipateInPolls: true,
              canMakeDonations: true,
              canCommentInteract: true,
            }),
          },
          restrictionReason: m.restrictionReason || null,
        };
      })
    );

    res.status(200).json({ members: simplifiedMembers });
  } catch (error) {
    console.error("❌ Fetch members error:", error);
    res.status(500).json({ message: "Server error fetching members" });
  }
});

// 2️⃣ UPDATE OR CREATE FAMILY MEMBER
router.put("/update-member", protect, async (req, res) => {
  try {
    const {
      memberId,
      userId,
      familyId,
      role,
      status,
      rights,
      restrictionReason,
    } = req.body;

    console.log("📥 Request body:", req.body);

    if (!familyId) {
      console.log("❌ Missing familyId");
      return res.status(400).json({ message: "familyId is required" });
    }

    if (!userId && !memberId) {
      console.log("❌ Missing both userId and memberId");
      return res
        .status(400)
        .json({ message: "userId or memberId is required" });
    }

    let member;

    // 1️⃣ Try to find by memberId first
    if (memberId) {
      console.log(`🔍 Looking for existing member with ID: ${memberId}`);
      member = await FamilyMember.findById(memberId);
      console.log("🔹 Found member:", member);
    }

    // 2️⃣ If not found by memberId, check if user already exists in family
    if (!member && userId) {
      console.log(
        `🔍 Member not found by memberId. Checking if user already exists in family...`
      );
      member = await FamilyMember.findOne({ family: familyId, user: userId });
      if (member) {
        console.log(
          "⚠️ User already exists in family. Will update instead:",
          member
        );
      }
    }

    // 3️⃣ If still no member → create new
    if (!member) {
      console.log("➕ Creating new member");

      const user = await User.findById(userId);
      if (!user) {
        console.log(`❌ User not found with ID: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }
      console.log("🔹 User found:", user);

      member = new FamilyMember({
        family: familyId,
        user: user._id,
        role: role?.toLowerCase() || "member",
        status: status || "active",
        rights: rights || undefined,
      });

      await member.save();
      console.log("✅ New member created:", member);
    } else {
      // 4️⃣ Update existing member
      console.log("✏️ Updating existing member...");

      if (role) {
        const roleNormalized = role.toLowerCase();
        console.log(`🔹 Updating role to: ${roleNormalized}`);
        member.role = roleNormalized;
      }

      if (status) {
        console.log(`🔹 Updating status to: ${status}`);
        member.status = status;
      }

      if (rights) {
        console.log("🔹 Updating rights:", rights);
        for (const [key, value] of Object.entries(rights)) {
          console.log(`   - Setting ${key} = ${value}`);
          member.rights.set(key, value);
        }
      }

      if (restrictionReason !== undefined) {
        console.log(`🔹 Updating restrictionReason: ${restrictionReason}`);
        member.restrictionReason = restrictionReason;
      }

      await member.save();
      console.log(" Member updated:", member);
    }

    const updatedMember = await FamilyMember.findById(member._id).populate(
      "user",
      "firstName lastName profilePicture email"
    );
    console.log("🔹 Populated updated member:", updatedMember);

    res.status(200).json({
      message:
        memberId || member
          ? "Member updated successfully"
          : "Member added successfully",
      member: {
        _id: updatedMember._id,
        userId: updatedMember.user._id,
        firstName: updatedMember.user.firstName,
        lastName: updatedMember.user.lastName,
        profilePicture: updatedMember.user.profilePicture,
        role: updatedMember.role,
        status: updatedMember.status,
        joinedAt: updatedMember.joinedAt,
        rights: updatedMember.rights,
        restrictionReason: updatedMember.restrictionReason,
      },
    });

    console.log("Response sent successfully");
  } catch (error) {
    console.error("Update/add member error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: "Member already exists in this family",
        error: error.keyValue,
      });
    }

    res.status(500).json({ message: "Server error updating or adding member" });
  }
});

module.exports = router;
