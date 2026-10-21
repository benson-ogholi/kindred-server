// utils/jwtUtils.js
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_fallback_key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

/**
 * Generate JWT Token
 * @param {string} userId - MongoDB _id of the user
 * @returns {string} Signed JWT token
 */
const generateToken = (userId) => {
  if (!userId) throw new Error("User ID is required to generate token");
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Verify JWT Token
 * @param {string} token
 * @returns {object} Decoded payload { id: userId }
 * @throws Error if invalid or expired
 */
const verifyToken = (token) => {
  if (!token) throw new Error("No token provided");

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    if (error.name === "JsonWebTokenError") throw new Error("Invalid token");
    if (error.name === "TokenExpiredError")
      throw new Error("Token has expired");
    throw new Error("Token verification failed");
  }
};

module.exports = { generateToken, verifyToken };
