// utils/jwtUtils.js
const jwt = require("jsonwebtoken");

// Never fall back to a guessable secret in production: anyone could forge
// tokens for any account. Dev keeps a local-only fallback for convenience.
const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === "production"
    ? (() => {
        throw new Error("JWT_SECRET must be set in production");
      })()
    : "dev-only-insecure-secret");
if (!process.env.JWT_SECRET) {
  console.error("⚠️ [jwtUtils] JWT_SECRET is not set — using an insecure dev secret. Set it before deploying.");
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

/**
 * Generate JWT Token
 * @param {string} userId - MongoDB _id of the user
 * @returns {string} Signed JWT token
 */
const generateToken = (userId) => {
  if (!userId) throw new Error("User ID is required to generate token");
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, algorithm: "HS256" });
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
    // Pin the algorithm so a token can't pick a weaker/none algorithm.
    return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
  } catch (error) {
    if (error.name === "JsonWebTokenError") throw new Error("Invalid token");
    if (error.name === "TokenExpiredError")
      throw new Error("Token has expired");
    throw new Error("Token verification failed");
  }
};

module.exports = { generateToken, verifyToken };
