const jwt = require("jsonwebtoken");

const User = require("../models/User");

const getUserFromToken = async (token) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing from environment variables.");
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  return User.findById(decoded.userId);
};

module.exports = { getUserFromToken };
