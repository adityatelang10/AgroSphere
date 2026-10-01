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
const {
  forgotPasswordValidation,
  resetPasswordValidation,
  forgotPassword,
  resetPassword,
} = require("../controllers/passwordResetController");
const { createPasswordResetLimiter, getPasswordResetLimits } = require("../middleware/passwordResetLimiter");
const { createRequestLimiter, getRequestLimits } = require("../middleware/requestRateLimiter");

const router = express.Router();
const recoveryLimits = getPasswordResetLimits();
const requestLimits = getRequestLimits();

// Recovery has its own per-IP and normalized-email quotas, independent of login.
router.post(
  "/forgot-password",
  createPasswordResetLimiter({ ...recoveryLimits.forgotIp, scope: "forgot-password-ip" }),
  forgotPasswordValidation,
  createPasswordResetLimiter({
    ...recoveryLimits.forgotEmail,
    scope: "forgot-password-email",
    skipServerErrors: true,
    key: (req) => String(req.body.email || "").toLowerCase(),
  }),
  forgotPassword
);
router.post(
  "/reset-password",
  createPasswordResetLimiter({ ...recoveryLimits.resetIp, scope: "reset-password-ip" }),
  resetPasswordValidation,
  resetPassword
);

router.post("/register",
  createRequestLimiter({ ...requestLimits.registerIp, scope: "register-ip" }),
  registerValidation, register);
router.post("/login",
  createRequestLimiter({ ...requestLimits.loginIp, scope: "login-ip" }),
  loginValidation,
  createRequestLimiter({ ...requestLimits.loginEmail, scope: "login-email",
    key: (req) => typeof req.body.email === "string" ? req.body.email.toLowerCase().trim() : "invalid-email" }),
  login);
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
