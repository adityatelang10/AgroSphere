const express = require("express");

const {
  getCurrentUser,
  login,
  loginValidation,
  logout,
  register,
  registerValidation,
  updateDeliveryAddress,
  updateDeliveryAddressValidation,
} = require("../controllers/authController");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", registerValidation, register);
router.post("/login", loginValidation, login);
router.post("/logout", authMiddleware, logout);
router.get("/me", authMiddleware, getCurrentUser);
router.patch(
  "/me/delivery-address",
  authMiddleware,
  requireRole("CUSTOMER"),
  updateDeliveryAddressValidation,
  updateDeliveryAddress
);

module.exports = router;
