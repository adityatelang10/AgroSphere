const express = require("express");

const {
  getCurrentUser,
  login,
  loginValidation,
  logout,
  register,
  registerValidation,
} = require("../controllers/authController");
const { authMiddleware } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", registerValidation, register);
router.post("/login", loginValidation, login);
router.post("/logout", authMiddleware, logout);
router.get("/me", authMiddleware, getCurrentUser);

module.exports = router;
