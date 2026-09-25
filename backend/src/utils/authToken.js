const jwt = require("jsonwebtoken");

const User = require("../models/User");

const getUserFromToken = async (token) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing from environment variables.");
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.userId);
  if (!user || (decoded.authVersion || 0) !== (user.authVersion || 0)) {
    return null;
  }
  return user;
};

module.exports = { getUserFromToken };
