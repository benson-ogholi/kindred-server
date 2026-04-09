const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const protectAdmin = async (req, res, next) => {
  let token;

  // 1. Check for token in Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(" ")[1];

      // 2. Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 3. Find Admin and verify they still exist and have the right role
      // We look in the Admin collection specifically
      const admin = await Admin.findById(decoded.id).select("-password");

      if (!admin) {
        console.warn("🚫 [AUTH] Access Denied: Admin record not found.");
        return res.status(401).json({ message: "Not authorized as admin" });
      }

      // 4. Attach admin to request object
      req.admin = admin;
      console.log(
        `🔑 [AUTH] Admin Verified: ${admin.fullName} (${admin.role})`
      );

      next();
    } catch (error) {
      console.error("🚨 [AUTH] Token Verification Failed:", error.message);
      res.status(401).json({ message: "Session expired or invalid token" });
    }
  }

  if (!token) {
    console.warn("🚫 [AUTH] Access Denied: No token provided.");
    res.status(401).json({ message: "Not authorized, no token" });
  }
};

module.exports = { protectAdmin };
