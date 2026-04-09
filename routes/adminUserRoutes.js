const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { protectAdmin } = require("../middlewares/adminAuth");

router.get("/users", protectAdmin, async (req, res) => {
  console.log("--- [START] FETCHING ALL PLATFORM USERS ---");
  try {
    const users = await User.find({})
      .select("-password") // Never send passwords
      .sort({ createdAt: -1 });

    console.log(`✅ [SUCCESS] Retrieved ${users.length} users.`);
    res.status(200).json(users);
  } catch (error) {
    console.error("🚨 Fetch Users Error:", error);
    res.status(500).json({ message: "Failed to retrieve user directory" });
  }
});

/**
 * @route   PUT /api/v1/dashboard/users/:id
 * @desc    Update any user profile (Master Admin Override)
 */
router.put("/users/:id", protectAdmin, async (req, res) => {
  console.log(
    `--- [START] ADMIN OVERRIDE UPDATE FOR USER: ${req.params.id} ---`
  );
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser)
      return res.status(404).json({ message: "User not found" });

    console.log(`✅ [SUCCESS] Profile updated for: ${updatedUser.email}`);
    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("🚨 Admin Update Error:", error);
    res.status(500).json({ message: "Failed to update user profile" });
  }
});

/**
 * @route   PATCH /api/v1/dashboard/users/:id/suspend
 * @desc    Toggle user suspension status
 */
router.patch("/users/:id/suspend", protectAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Toggle logic
    user.status = user.status === "active" ? "suspended" : "active";
    await user.save();

    console.log(`🔒 [STATUS CHANGE] User ${user.email} is now ${user.status}`);
    res.status(200).json({
      message: `User has been ${user.status}`,
      status: user.status,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to change user status" });
  }
});

/**
 * @route   DELETE /api/v1/dashboard/users/:id
 * @desc    Permanent account deletion
 */

router.delete("/users/:id", protectAdmin, async (req, res) => {
  console.log(`--- [START] PERMANENT DELETION FOR USER: ${req.params.id} ---`);
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    await user.deleteOne();

    console.log(`🗑️ [SUCCESS] User account purged from platform.`);
    res.status(200).json({ message: "User account permanently deleted" });
  } catch (error) {
    console.error("🚨 Delete User Error:", error);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

module.exports = router;
