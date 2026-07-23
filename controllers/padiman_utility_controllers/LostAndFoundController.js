const LostAndFound = require("../../models/padiman_utility_models/LostAndFound");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");

// Create Lost Item
const createLostItem = async (req, res) => {
  try {
    const { title, category, description, locationFound } = req.body;

    const imageUrls = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const url = await uploadToBackblaze(
          file.buffer,
          file.originalname,
          "lost-found"
        );
        imageUrls.push(url);
      }
    }

    const newItem = await LostAndFound.create({
      user: req.user.id,
      title,
      category,
      description,
      locationFound,
      images: imageUrls,
      reporter: "Self Registered",
    });

    res.status(201).json({
      message: "Lost item reported successfully",
      item: newItem,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get All Lost Items (Public)
const getAllLostItems = async (req, res) => {
  try {
    const items = await LostAndFound.find()
      .populate("user", "fullName username")
      .sort({ createdAt: -1 });
    res.json({ lostItems: items });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Get My Lost Items
const getMyLostItems = async (req, res) => {
  try {
    const items = await LostAndFound.find({ user: req.user.id }).sort({
      createdAt: -1,
    });
    res.json({ lostItems: items });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Get One by ID
const getLostItemById = async (req, res) => {
  try {
    const item = await LostAndFound.findById(req.params.id).populate(
      "user",
      "fullName username"
    );
    if (!item) return res.status(404).json({ message: "Item not found" });
    res.json({ item });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Update Lost Item
const updateLostItem = async (req, res) => {
  try {
    const { title, category, description, locationFound, status } = req.body;
    const updateData = { title, category, description, locationFound, status };

    if (req.files && req.files.length > 0) {
      const imageUrls = [];
      for (const file of req.files) {
        const url = await uploadToBackblaze(
          file.buffer,
          file.originalname,
          "lost-found"
        );
        imageUrls.push(url);
      }
      updateData.images = imageUrls;
    }

    const updatedItem = await LostAndFound.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      updateData,
      { new: true }
    );

    if (!updatedItem)
      return res
        .status(404)
        .json({ message: "Item not found or unauthorized" });

    res.json({ message: "Item updated", item: updatedItem });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Delete Lost Item
const deleteLostItem = async (req, res) => {
  try {
    const item = await LostAndFound.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    });
    if (!item)
      return res
        .status(404)
        .json({ message: "Item not found or unauthorized" });
    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createLostItem,
  getAllLostItems,
  getMyLostItems,
  getLostItemById,
  updateLostItem,
  deleteLostItem,
};
