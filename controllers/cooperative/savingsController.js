const CooperativeSavings = require("../../models/cooperative/CooperativeSavings");

// Get user savings
exports.getSavings = async (req, res) => {
  try {
    let savings = await CooperativeSavings.findOne({ userId: req.user._id });
    if (!savings) {
      savings = await CooperativeSavings.create({
        userId: req.user._id,
        balance: 0,
        transactions: [],
      });
    }
    res.status(200).json({ success: true, data: savings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Deposit to savings
exports.depositSavings = async (req, res) => {
  try {
    const { amount, reference, description } = req.body;
    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid deposit amount" });
    }

    let savings = await CooperativeSavings.findOne({ userId: req.user._id });
    if (!savings) {
      savings = await CooperativeSavings.create({
        userId: req.user._id,
        balance: 0,
        transactions: [],
      });
    }

    savings.balance += Number(amount);
    savings.transactions.push({
      type: "deposit",
      amount: Number(amount),
      reference,
      description: description || "Savings deposit",
      date: new Date(),
    });

    await savings.save();
    res.status(200).json({
      success: true,
      message: "Savings deposit successful",
      data: savings,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Withdraw from savings
exports.withdrawSavings = async (req, res) => {
  try {
    const { amount, reference, description } = req.body;
    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid withdrawal amount" });
    }

    const savings = await CooperativeSavings.findOne({ userId: req.user._id });
    if (!savings || savings.balance < amount) {
      return res
        .status(400)
        .json({ success: false, message: "Insufficient savings balance" });
    }

    savings.balance -= Number(amount);
    savings.transactions.push({
      type: "withdrawal",
      amount: Number(amount),
      reference,
      description: description || "Savings withdrawal",
      date: new Date(),
    });

    await savings.save();
    res.status(200).json({
      success: true,
      message: "Savings withdrawal successful",
      data: savings,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
