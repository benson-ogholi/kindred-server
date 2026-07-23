// middleware/auth.js
const jwt = require("jsonwebtoken");
const PRUtility = require("../../models/padiman_utility_models/PRUtility");

const protect = async (req, res, next) => {
  let token;

  // Check for token in Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      message: "Not authorized, no token provided",
    });
  }

  try {
    // Make sure this matches exactly what you use in login/verifyOTP
    const decoded = jwt.verify(token, process.env.JWT_SECRET_PRU);

    // Get user from database
    const user = await PRUtility.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error("JWT Error:", error.message);
    console.error(
      "Token received:",
      token ? token.substring(0, 50) + "..." : "No token"
    );

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        message: "Not authorized, invalid token",
        error: "Invalid token signature",
      });
    }

    return res.status(401).json({
      message: "Not authorized, invalid token",
      error: error.message,
    });
  }
};

module.exports = { protect };
