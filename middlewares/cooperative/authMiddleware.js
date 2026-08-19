const jwt = require("jsonwebtoken");
const CooperativeUser = require("../../models/cooperative/CooperativeUser");

exports.protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        status: "fail",
        message: "You are not logged in",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const currentUser = await CooperativeUser.findById(decoded.id);
    if (!currentUser) {
      return res.status(401).json({
        status: "fail",
        message: "User no longer exists",
      });
    }

    req.user = currentUser;
    next();
  } catch (error) {
    return res.status(401).json({
      status: "fail",
      message: "Invalid token. Please log in again",
    });
  }
};

// ==========================================
// RESTRICT TO ADMIN
// ==========================================
exports.restrictToAdmin = (req, res, next) => {
  if (!req.user || (!req.user.isAdmin && req.user.currentRole !== "admin")) {
    return res.status(403).json({
      status: "fail",
      message: "You do not have permission to perform this action. Admin access required.",
    });
  }
  next();
};

// ==========================================
// FLEXIBLE ROLE RESTRICTION (Optional: for Managers/Admins)
// ==========================================
exports.restrictTo = (...allowedRoles) => {
  return (req, res, next) => {
    const activeRole = req.user.currentRole || req.user.role;
    
    if (!req.user || (!allowedRoles.includes(activeRole) && !req.user.isAdmin)) {
      return res.status(403).json({
        status: "fail",
        message: "You do not have permission to perform this action",
      });
    }
    next();
  };
};