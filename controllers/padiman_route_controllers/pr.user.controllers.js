const Padiman_Route_User = require("../../models/padiman_route_models/Padiman_Route_User");

// GET PROFILE
const getProfile = async (req, res) => {
  const user = await Padiman_Route_User.findById(req.user).select("-password");
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ message: "User not found" });
  }
};

// UPDATE PROFILE
const updateProfile = async (req, res) => {
  const user = await Padiman_Route_User.findById(req.user);

  if (user) {
    user.fullName = req.body.fullName || user.fullName;
    user.phone = req.body.phone || user.phone;
    // Add other fields from your schema here...

    const updatedUser = await user.save();
    res.json(updatedUser);
  } else {
    res.status(404).json({ message: "User not found" });
  }
};

// DELETE ACCOUNT
const deleteAccount = async (req, res) => {
  const user = await Padiman_Route_User.findById(req.user);
  if (user) {
    await Padiman_Route_User.findByIdAndDelete(req.user);
    res.json({ message: "User account deleted" });
  } else {
    res.status(404).json({ message: "User not found" });
  }
};

// LOGOUT (Handled on client side by clearing token)
const logout = (req, res) => {
  res.status(200).json({ message: "User logged out successfully" });
};

// SAVE EXPO PUSH TOKEN
const saveExpoPushToken = async (req, res) => {
  const { expoPushToken } = req.body;

  if (!expoPushToken) {
    return res.status(400).json({ message: "Push token is required" });
  }

  try {
    console.log(
      `📱 [PUSH TOKEN] Saving token for user ${req.user}:`,
      expoPushToken
    );

    const user = await Padiman_Route_User.findByIdAndUpdate(
      req.user,
      { expoPushToken },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: "Expo push token saved successfully",
    });
  } catch (err) {
    console.error("💥 [PUSH TOKEN ERROR]:", err.message);
    res.status(500).json({ message: "Server error saving push token" });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  deleteAccount,
  logout,
  saveExpoPushToken,
};
