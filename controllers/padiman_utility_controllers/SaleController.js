const Sale = require("../../models/padiman_utility_models/Sale");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");

// Create Sale
const createSale = async (req, res) => {
  try {
    const { title, category, description, serialNumber, price, oldPrice } =
      req.body;

    const imageUrls = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const url = await uploadToBackblaze(
          file.buffer,
          file.originalname,
          "sales"
        );
        imageUrls.push(url);
      }
    }

    const newSale = await Sale.create({
      user: req.user.id,
      title,
      category,
      description,
      serialNumber,
      images: imageUrls,
      price: Number(price),
      oldPrice: oldPrice ? Number(oldPrice) : null,
    });

    res.status(201).json({
      message: "Distress sale created successfully",
      sale: newSale,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get My Sales
const getMySales = async (req, res) => {
  try {
    const sales = await Sale.find({ user: req.user.id }).sort({
      createdAt: -1,
    });
    res.json({ sales });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Get All Sales (Public)
const getAllSales = async (req, res) => {
  try {
    const sales = await Sale.find()
      .populate("user", "fullName username")
      .sort({ createdAt: -1 });
    res.json({ sales });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Get One Sale by ID
const getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id).populate(
      "user",
      "fullName username"
    );
    if (!sale) return res.status(404).json({ message: "Sale not found" });
    res.json({ sale });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Update Sale
const updateSale = async (req, res) => {
  try {
    const {
      title,
      category,
      description,
      serialNumber,
      price,
      oldPrice,
      status,
    } = req.body;

    const updateData = {
      title,
      category,
      description,
      serialNumber,
      price,
      oldPrice,
      status,
    };

    if (req.files && req.files.length > 0) {
      const imageUrls = [];
      for (const file of req.files) {
        const url = await uploadToBackblaze(
          file.buffer,
          file.originalname,
          "sales"
        );
        imageUrls.push(url);
      }
      updateData.images = imageUrls;
    }

    const updatedSale = await Sale.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      updateData,
      { new: true }
    );

    if (!updatedSale)
      return res
        .status(404)
        .json({ message: "Sale not found or unauthorized" });

    res.json({ message: "Sale updated", sale: updatedSale });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Delete Sale
const deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id,
    });
    if (!sale)
      return res
        .status(404)
        .json({ message: "Sale not found or unauthorized" });
    res.json({ message: "Sale deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createSale,
  getMySales,
  getAllSales,
  getSaleById,
  updateSale,
  deleteSale,
};
