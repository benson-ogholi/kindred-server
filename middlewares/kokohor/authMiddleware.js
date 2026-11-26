// middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const User = require("../../models/kokohor/User");
const { verifyToken } = require("../../utils/jwtUtils");

/**
 * Middleware to protect private routes
 * Verifies JWT token and attaches user to req
 */
const protect = async (req, res, next) => {
  let token;

  // 1. Check for Bearer token in headers
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];

    try {
      // 2. Verify token
      const decoded = verifyToken(token);

      // 3. Find user in DB and attach to request
      // Never load secrets (password / passcode / security answer) onto req.user.
      const user = await User.findById(decoded.id).select(
        "-password -passcode -securityAnswer"
      );
      if (!user) {
        return res.status(401).json({ message: "User no longer exists" });
      }

      req.user = user;
      return next();
    } catch (error) {
      return res.status(401).json({ message: "Not authorized, invalid or expired token" });
    }
  }

  // 4. No token provided
  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token provided" });
  }
};


const checkStatus = (req, res, next) => {
  // We assume req.user is already populated by the 'protect' middleware
  if (req.user && req.user.status === 'suspended') {
    return res.status(403).json({ 
      message: "Access Denied. Your account has been suspended.",
      isSuspended: true 
    });
  }
  next();
};


module.exports = { protect ,checkStatus};