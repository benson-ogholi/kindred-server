const express = require("express");
const router = express.Router();
const FamilyMember = require("../models/FamilyMember");
const { protect } = require("../middlewares/authMiddleware");
const User = require("../models/User");
const Family = require("../models/Family");
const UnifiedIds = require("../models/UnifiedIds");
const crypto = require("crypto");

// Default rights template
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

// Helper: owner is now always an array
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

// 1️⃣ Get all family members
router.post("/get-members", protect, async (req, res) => {
  try {
    const { familyId } = req.body;
    if (!familyId)
      return res.status(400).json({ message: "familyId is required" });

    const currentUserId = req.user._id.toString();

    const family = await Family.findById(familyId).populate(
      "owner",
      "firstName lastName profilePicture email"
    );
    if (!family) return res.status(404).json({ message: "Family not found" });

    // Ensure owner is treated as array
    if (!Array.isArray(family.owner)) {
      family.owner = family.owner ? [family.owner] : [];
    }

    const members = await FamilyMember.find({ family: familyId })
      .populate("user", "firstName lastName profilePicture email")
      .sort({ joinedAt: 1 });

    const simplifiedMembers = await Promise.all(
      members.map(async (m) => {
        const memberUserId = m.user._id.toString();
        const isOwner = isUserOwner(family, memberUserId);
        const isAdmin = !isOwner && m.rights?.get?.("isAdmin");

        let uuid = null;
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

        // Merge rights safely
        const memberRights = {};
        for (const key of Object.keys(defaultRights)) {
          memberRights[key] = isOwner
            ? true // owner has all rights
            : m.rights?.get(key) ?? defaultRights[key];
        }
        if (isOwner) memberRights.isModerator = true; // owner always moderator

        return {
          _id: m._id,
          uuid,
          userId: m.user._id,
          firstName: m.user.firstName,
          lastName: m.user.lastName,
          profilePicture: m.user.profilePicture,
          role: isOwner ? "owner" : isAdmin ? "admin" : m.role,
          status: m.status || "active",
          joinedAt: m.joinedAt,
          rights: memberRights,
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

// 2️⃣ Update or create family member safely
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

    if (!familyId)
      return res.status(400).json({ message: "familyId is required" });
    if (!userId && !memberId)
      return res
        .status(400)
        .json({ message: "userId or memberId is required" });

    let member;

    // Find existing member
    if (memberId) member = await FamilyMember.findById(memberId);
    if (!member && userId) {
      member = await FamilyMember.findOne({ family: familyId, user: userId });
    }

    const family = await Family.findById(familyId);
    if (!family) return res.status(404).json({ message: "Family not found" });

    // Create new member
    if (!member) {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      member = new FamilyMember({
        family: familyId,
        user: user._id,
        role: role?.toLowerCase() || "member",
        status: status || "active",
        rights: defaultRights, // always start with default rights
      });
    }

    // Update existing member safely
    if (role) member.role = role.toLowerCase();
    if (status) member.status = status;

    if (rights) {
      for (const [key, value] of Object.entries(rights)) {
        if (defaultRights.hasOwnProperty(key)) {
          // assign only booleans and valid keys
          member.rights.set(key, !!value);
        } else {
          console.warn(`⚠️ Skipping invalid rights key: ${key}`);
        }
      }
    }

    if (restrictionReason !== undefined)
      member.restrictionReason = restrictionReason;

    await member.save();

    // Populate user data for response
    const updatedMember = await FamilyMember.findById(member._id).populate(
      "user",
      "firstName lastName profilePicture email"
    );

    res.status(200).json({
      message: memberId
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
        rights: Object.fromEntries(updatedMember.rights), // convert Map to object
        restrictionReason: updatedMember.restrictionReason,
      },
    });
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
