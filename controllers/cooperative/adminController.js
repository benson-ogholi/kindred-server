const CooperativeUser = require("../../models/cooperative/CooperativeUser");
const CooperativeDividend = require("../../models/cooperative/CooperativeDividend");
const CooperativeLoan = require("../../models/cooperative/CooperativeLoan");
const CooperativeSavings = require("../../models/cooperative/CooperativeSavings");
const CooperativeWallet = require("../../models/cooperative/CooperativeWallet");
const sendWatalopiaEmail = require("../../utils/cooperative/sendWatalopiaEmail");

// ==========================================
// 1. GET ALL USERS (Admin View)
// ==========================================
// ==========================================
exports.getAllUsers = async (req, res) => {
  try {
    // Only fetch users who are verified
    const users = await CooperativeUser.find({ isVerified: true }).select("-password");

    return res.status(200).json({
      status: "success",
      results: users.length,
      data: {
        users,
      },
    });
  } catch (error) {
    console.error("Get all users error:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to fetch users",
    });
  }
};

exports.getAdminCooperativeOverview = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    // Check if the user is an admin
    const isAdmin =
      req.user.isAdmin === true ||
      req.user.currentRole === "admin" ||
      req.user.role === "admin";

    if (!isAdmin) {
      // If not an admin, return personal details and personal financial records
      const [wallet, savings, loans, dividends] = await Promise.all([
        CooperativeWallet.findOne({ userId }),
        CooperativeSavings.findOne({ userId }),
        CooperativeLoan.find({ userId }),
        CooperativeDividend.find({}),
      ]);

      return res.status(200).json({
        success: true,
        isAdmin: false,
        user: {
          id: req.user._id || req.user.id,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          email: req.user.email,
          phone: req.user.phone,
          role: req.user.role || req.user.currentRole,
        },
        data: {
          wallet: wallet || null,
          savings: savings || null,
          loans: loans || [],
          dividends: dividends || [],
        },
      });
    }

    // Admin flow: fetch system-wide overview
    const [wallets, savings, loans, dividends] = await Promise.all([
      CooperativeWallet.find({}).populate({
        path: "userId",
        select: "firstName lastName email phone countryCode",
        strictPopulate: false,
      }),
      CooperativeSavings.find({}).populate({
        path: "userId",
        select: "firstName lastName email phone countryCode",
        strictPopulate: false,
      }),
      CooperativeLoan.find({}).populate({
        path: "userId",
        select: "firstName lastName email phone countryCode ",
        strictPopulate: false,
      }),
      CooperativeDividend.find({}).populate({
        path: "adminId",
        select: "firstName lastName email countryCode",
        strictPopulate: false,
      }),
    ]);

    // Calculate aggregate balances and totals
    const totalWalletBalance = wallets.reduce(
      (sum, w) => sum + (w.balance || 0),
      0
    );
    const totalSavingsBalance = savings.reduce(
      (sum, s) => sum + (s.balance || 0),
      0
    );
    const totalLoanBalance = loans.reduce(
      (sum, l) => sum + (l.balance || 0),
      0
    );
    const totalPrincipalLoan = loans.reduce(
      (sum, l) => sum + (l.principalAmount || 0),
      0
    );
    const totalDividendsDistributed = dividends.reduce(
      (sum, d) => sum + (d.totalAmount || 0),
      0
    );

    res.status(200).json({
      success: true,
      isAdmin: true,
      data: {
        summary: {
          totalWalletBalance,
          totalSavingsBalance,
          totalLoanBalance,
          totalPrincipalLoan,
          totalDividendsDistributed,
        },
        wallets,
        savings,
        loans,
        dividends,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 2. ADMIN CREATE NEW USER
// ==========================================
exports.adminCreateUser = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      role,
      isAdmin,
      currentRole,
      permissions,
    } = req.body;

    const existingUser = await CooperativeUser.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        status: "fail",
        message: "User with this email already exists",
      });
    }

    const tempPassword = password || "Password123!";

    const newUser = await CooperativeUser.create({
      firstName,
      lastName,
      email,
      phone,
      password: tempPassword,
      role: role || "user",
      isAdmin: isAdmin !== undefined ? isAdmin : false,
      currentRole: currentRole || "user",
      permissions: permissions || [],
      isVerified: true,
      username: email,
    });

    // Send admin-created account email
    try {
      await sendWatalopiaEmail({
        to: email,
        subject: "Your Watalopia Account Has Been Created",
        template: "adminCreated",
        data: {
          firstName,
          email,
          temporaryPassword: tempPassword,
        },
      });
    } catch (emailErr) {
      console.error(
        "Failed to send admin-created account email:",
        emailErr.message
      );
    }

    // newUser.password = undefined; // keep if you want to hide it in response

    return res.status(201).json({
      status: "success",
      message: "User successfully created by admin",
      data: {
        user: newUser,
      },
    });
  } catch (error) {
    console.error("Admin create user error:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to create user",
    });
  }
};

// ==========================================
// 3. PROMOTE / UPDATE USER ROLE & PERMISSIONS
// ==========================================
exports.updateUserRoleAndPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isAdmin, role, currentRole, permissions } = req.body;

    const user = await CooperativeUser.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    if (isAdmin !== undefined) user.isAdmin = isAdmin;
    if (role) user.role = role;
    if (currentRole) user.currentRole = currentRole;
    if (permissions && Array.isArray(permissions)) {
      user.permissions = permissions;
    }

    await user.save({ validateBeforeSave: false });

    user.password = undefined;

    return res.status(200).json({
      status: "success",
      message: `User ${user.email} updated successfully`,
      data: {
        user,
      },
    });
  } catch (error) {
    console.error("Update user role error:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to update user role and permissions",
    });
  }
};

// ==========================================
// 1. CREATE COOPERATIVE ENTRIES (Admin Only)
// ==========================================
exports.createCooperativeItem = async (req, res) => {
  try {
    const isAdmin =
      req.user.isAdmin === true ||
      req.user.currentRole === "admin" ||
      req.user.role === "admin";

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Administrator privileges required.",
      });
    }

    const { type } = req.params; // expected: 'wallet', 'savings', 'loan', 'dividend'
    const payload = req.body;
    const adminId = req.user._id || req.user.id;

    let createdItem;

    switch (type) {
      case "wallet":
        createdItem = await CooperativeWallet.create(payload);
        break;
      case "savings":
        createdItem = await CooperativeSavings.create(payload);
        break;
      case "loan":
        createdItem = await CooperativeLoan.create({
          ...payload,
          status: payload.status || "approved",
        });
        break;
      case "dividend":
        createdItem = await CooperativeDividend.create({
          ...payload,
          adminId,
        });
        break;
      default:
        return res.status(400).json({
          success: false,
          message: "Invalid cooperative item type specified.",
        });
    }

    return res.status(201).json({
      success: true,
      message: `${type} record created successfully.`,
      data: createdItem,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 2. APPLY FOR LOAN / SAVINGS (Member Action)
// ==========================================
exports.applyForCooperativeItem = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { type } = req.params; // expected: 'loan', 'savings'
    const payload = req.body;

    let application;

    if (type === "loan") {
      application = await CooperativeLoan.create({
        ...payload,
        userId,
        balance: payload.principalAmount || payload.amount || 0,
        status: "pending",
      });
    } else if (type === "savings") {
      application = await CooperativeSavings.create({
        ...payload,
        userId,
        balance: payload.balance || 0,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Members can only apply for 'loan' or 'savings' accounts.",
      });
    }

    return res.status(201).json({
      success: true,
      message: `Your ${type} application has been submitted successfully.`,
      data: application,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 3. ACCEPT OR REJECT LOANS (Admin Action)
// ==========================================
exports.reviewLoanApplication = async (req, res) => {
  try {
    const isAdmin =
      req.user.isAdmin === true ||
      req.user.currentRole === "admin" ||
      req.user.role === "admin";

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Administrator privileges required.",
      });
    }

    const { loanId } = req.params;
    const { status, reviewNotes } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be either 'approved' or 'rejected'.",
      });
    }

    const loan = await CooperativeLoan.findById(loanId);
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Loan application not found.",
      });
    }

    loan.status = status;
    if (reviewNotes) loan.reviewNotes = reviewNotes;

    await loan.save();

    return res.status(200).json({
      success: true,
      message: `Loan application successfully ${status}.`,
      data: loan,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
