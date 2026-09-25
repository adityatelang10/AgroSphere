const { body, validationResult } = require("express-validator");
const { getMailConfiguration, sendPasswordChangedEmail } = require("../services/passwordResetMailService");
const { createPasswordResetService, isValidPassword } = require("../services/passwordResetService");

const service = createPasswordResetService();
const forgotPasswordValidation = [
  body("email").isString().bail().trim().isLength({ max: 254 }).bail().isEmail().bail().normalizeEmail(),
];
const resetPasswordValidation = [
  body("token").isString().bail().matches(/^[a-f0-9]{64}$/),
  body("password").custom(isValidPassword),
  body("confirmPassword").custom((value, { req }) => value === req.body.password),
];

const forgotPassword = (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!validationResult(req).isEmpty()) {
    return res.status(400).json({ success: false, message: "Enter a valid email address." });
  }
  let configuration;
  try {
    configuration = getMailConfiguration();
  } catch {
    return res.status(503).json({ success: false,
      message: "Password recovery email is not configured. Please contact the AgroSphere operator." });
  }
  // Same response path/timing for existing and unknown accounts. Delivery runs
  // asynchronously in this long-running Node server, never exposing tokens/errors.
  setImmediate(() => {
    service.requestReset(req.body.email, configuration)
      .then((result) => {
        if (result?.emailAccepted) console.info("Password recovery email accepted by SMTP. Inbox delivery is not confirmed.");
      })
      .catch((error) => {
        console.warn(`Password recovery delivery could not be completed (${error.deliveryCode || "UNAVAILABLE"}). Check SMTP configuration and connectivity.`);
      });
  });
  return res.status(200).json({ success: true,
    message: "If an account matches that email, you will receive a reset link. Check your inbox and spam folder. The link expires in 15 minutes." });
};

const resetPassword = async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!validationResult(req).isEmpty()) {
    return res.status(400).json({ success: false,
      message: "Use a valid reset link and matching passwords of at least 8 characters, including an uppercase letter and a number (maximum 72 UTF-8 bytes)." });
  }
  try {
    const user = await service.resetPassword(req.body.token, req.body.password);
    if (!user) return res.status(400).json({ success: false,
      message: "This reset link is invalid or has expired. Request a new link." });
    res.clearCookie("token", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" });
    req.app.get("io")?.in(`user:${String(user._id)}`).disconnectSockets(true);
    setImmediate(async () => {
      try {
        await sendPasswordChangedEmail({ email: user.email, configuration: getMailConfiguration() });
      } catch {
        console.warn("Password-change notification could not be delivered. Check SMTP configuration and connectivity.");
      }
    });
    return res.status(200).json({ success: true, message: "Password updated. Sign in with your new password. Existing sessions have been signed out." });
  } catch {
    // Never forward a password-bearing database error to the global logger.
    return res.status(503).json({ success: false, message: "Password reset is temporarily unavailable. Please try again later." });
  }
};

module.exports = { forgotPasswordValidation, resetPasswordValidation, forgotPassword, resetPassword };
