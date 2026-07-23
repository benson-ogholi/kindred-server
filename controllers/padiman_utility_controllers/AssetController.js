const Asset = require("../../models/padiman_utility_models/Asset");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");

// Create Asset - Multiple Images
const createAsset = async (req, res) => {
  try {
    const { title, sub, description, serialNumber, valuationEstimate } =
      req.body;

    const imageUrls = [];

    // Handle multiple files
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const url = await uploadToBackblaze(
          file.buffer,
          file.originalname,
          "assets"
        );
        imageUrls.push(url);
      }
    }

    const newAsset = await Asset.create({
      user: req.user.id,
      title,
      sub,
      description,
      serialNumber,
      images: imageUrls,
      valuationEstimate,
    });

    res.status(201).json({
      message: "Asset created successfully",
      asset: newAsset,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get All Assets for Logged-in User
// Get All Assets for Logged-in User
const getMyAssets = async (req, res) => {
  try {
    const assets = await Asset.find({ user: req.user.id }).sort({
      createdAt: -1,
    });

    // Explicitly returning an empty array on success if nothing is found
    return res.status(200).json({
      success: true,
      count: assets.length,
      assets: assets,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get All Assets (Public / Admin)
const getAllAssets = async (req, res) => {
  try {
    const assets = await Asset.find()
      .populate("user", "fullName username")
      .sort({ createdAt: -1 });

    // Explicitly returning an empty array on success if nothing is found
    return res.status(200).json({
      success: true,
      count: assets.length,
      assets: assets,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get One Asset by ID
const getAssetById = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id).populate(
      "user",
      "fullName username"
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });

    res.json({ asset });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Update Asset - Multiple Images
const updateAsset = async (req, res) => {
  try {
    const { title, sub, description, serialNumber, valuationEstimate, status } =
      req.body;

    const updateData = {
      title,
      sub,
      description,
      serialNumber,
      valuationEstimate,
      status,
    };

    // Handle new images
    if (req.files && req.files.length > 0) {
      const imageUrls = [];
      for (const file of req.files) {
        const url = await uploadToBackblaze(
          file.buffer,
          file.originalname,
          "assets"
        );
        imageUrls.push(url);
      }
      updateData.images = imageUrls; // Replace all images (or you can push to existing)
    }

    const updatedAsset = await Asset.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      updateData,
      { new: true }
    );

    if (!updatedAsset)
      return res
        .status(404)
        .json({ message: "Asset not found or unauthorized" });

    res.json({ message: "Asset updated", asset: updatedAsset });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Delete Asset
const deleteAsset = async (req, res) => {
  try {
    const asset = await Asset.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    });
    if (!asset)
      return res
        .status(404)
        .json({ message: "Asset not found or unauthorized" });

    res.json({ message: "Asset deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createAsset,
  getMyAssets,
  getAllAssets,
  getAssetById,
  updateAsset,
  deleteAsset,
};
