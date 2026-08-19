const CooperativeDividend = require("../../models/cooperative/CooperativeDividend");
const CooperativeSavings = require("../../models/cooperative/CooperativeSavings");

exports.postAndDistributeDividend = async (req, res) => {
  try {
    const { title, totalAmount, description, distributionMethod } = req.body;

    const amountNum = Number(totalAmount);
    if (!amountNum || amountNum <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid dividend total amount" });
    }

    const method = distributionMethod || "equal";

    // 1. Fetch only savings records for users who have savings (balance > 0)
    // const eligibleSavings = await CooperativeSavings.find({
    //   balance: { $gt: 0 },
    // });

    // if (eligibleSavings.length === 0) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "No eligible members with savings found for distribution",
    //   });
    // }

    // 2. Calculate total savings if method is proportional/pro_rata_savings
    let totalSavings = 0;
    if (method === "proportional" || method === "pro_rata_savings") {
      totalSavings = eligibleSavings.reduce(
        (sum, s) => sum + (Number(s.balance) || 0),
        0
      );
      if (totalSavings <= 0) {
        return res.status(400).json({
          success: false,
          message: "Total savings balance across eligible members is zero",
        });
      }
    }

    // 3. Prepare the individual member transaction records array for the CooperativeDividend model
    const dividendTransactions = [];

    // 4. Distribute and credit each eligible member's savings account & construct dividend transaction logs
    const updatePromises = eligibleSavings.map(async (saving) => {
      let share = 0;
      if (method === "proportional" || method === "pro_rata_savings") {
        const userSavings = Number(saving.balance) || 0;
        share = amountNum * (userSavings / totalSavings);
      } else {
        // Equal split among users who have saved
        share = amountNum / eligibleSavings.length;
      }

      // Push record to be saved within the CooperativeDividend schema sub-documents
      dividendTransactions.push({
        userId: saving.userId,
        amount: share,
        type: "credit",
        description: `Dividend Earning (${
          method === "proportional" || method === "pro_rata_savings"
            ? "Proportional"
            : "Equal"
        }): ${title}`,
        date: new Date(),
      });

      saving.balance += share;
      saving.transactions.push({
        type: "deposit",
        amount: share,
        description: `Dividend Earning (${
          method === "proportional" || method === "pro_rata_savings"
            ? "Proportional"
            : "Equal"
        }): ${title}`,
        date: new Date(),
      });
      return saving.save();
    });

    await Promise.all(updatePromises);

    // 5. Create the Dividend record including the populated transactions array
    const dividend = await CooperativeDividend.create({
      adminId: req.user._id,
      title,
      totalAmount: amountNum,
      description,
      distributionMethod:
        method === "pro_rata_savings" ? "proportional" : method,
      status: "distributed",
      distributedAt: new Date(),
      transactions: dividendTransactions,
    });

    res.status(200).json({
      success: true,
      message: `Dividend successfully distributed across ${eligibleSavings.length} active saving accounts.`,
      data: dividend,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllDividends = async (req, res) => {
  try {
    console.log("--- GET ALL DIVIDENDS REQUEST ---");
    console.log("Authenticated User ID:", req.user?._id);
    console.log("User Role Info:", {
      role: req.user?.role,
      isAdmin: req.user?.isAdmin,
      currentRole: req.user?.currentRole,
    });

    let dividends;

    // Check if user is an admin or manager with full view permissions
    if (
      req.user.role === "admin" ||
      req.user.isAdmin ||
      req.user.currentRole === "admin"
    ) {
      console.log("User is Admin/Manager. Fetching all system dividends...");
      dividends = await CooperativeDividend.find().sort({ createdAt: -1 });
    } else {
      console.log(
        "User is regular member. Fetching targeted user dividends..."
      );
      dividends = await CooperativeDividend.find({
        $or: [
          { userId: req.user._id },
          { "transactions.userId": req.user._id },
        ],
      }).sort({ createdAt: -1 });
    }

    console.log(`Query completed. Found ${dividends.length} dividend records.`);

    res.status(200).json({
      success: true,
      results: dividends.length,
      data: { dividends },
    });
  } catch (error) {
    console.error("❌ ERROR in getAllDividends:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
