const CooperativeWallet = require("../../models/cooperative/CooperativeWallet");

// Get user wallet
exports.getWallet = async (req, res) => {
  try {
    let wallet = await CooperativeWallet.findOne({ userId: req.user._id });
    if (!wallet) {
      wallet = await CooperativeWallet.create({
        userId: req.user._id,
        balance: 0,
        transactions: [],
      });
    }
    res.status(200).json({ success: true, data: wallet });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Deposit into wallet
exports.depositWallet = async (req, res) => {
  try {
    const { amount, reference, description } = req.body;
    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid deposit amount" });
    }

    let wallet = await CooperativeWallet.findOne({ userId: req.user._id });
    if (!wallet) {
      wallet = await CooperativeWallet.create({
        userId: req.user._id,
        balance: 0,
        transactions: [],
      });
    }

    wallet.balance += Number(amount);
    wallet.transactions.push({
      type: "deposit",
      amount: Number(amount),
      reference,
      description: description || "Wallet deposit",
      date: new Date(),
    });

    await wallet.save();
    res
      .status(200)
      .json({ success: true, message: "Deposit successful", data: wallet });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Withdraw from wallet
exports.withdrawWallet = async (req, res) => {
  try {
    const { amount, reference, description } = req.body;
    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid withdrawal amount" });
    }

    const wallet = await CooperativeWallet.findOne({ userId: req.user._id });
    if (!wallet || wallet.balance < amount) {
      return res
        .status(400)
        .json({ success: false, message: "Insufficient wallet balance" });
    }

    wallet.balance -= Number(amount);
    wallet.transactions.push({
      type: "withdrawal",
      amount: Number(amount),
      reference,
      description: description || "Wallet withdrawal",
      date: new Date(),
    });

    await wallet.save();
    res
      .status(200)
      .json({ success: true, message: "Withdrawal successful", data: wallet });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
