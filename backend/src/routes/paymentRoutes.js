const express = require("express");

const {
  cancelPaymentValidation,
  cancelRazorpayPayment,
  createPaymentValidation,
  createRazorpayOrder,
  verifyPaymentValidation,
  verifyRazorpayPayment,
} = require("../controllers/paymentController");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

router.post(
  "/create-order",
  authMiddleware,
  requireRole("CUSTOMER"),
  createPaymentValidation,
  createRazorpayOrder
);
router.post(
  "/verify",
  authMiddleware,
  requireRole("CUSTOMER"),
  verifyPaymentValidation,
  verifyRazorpayPayment
);
router.post(
  "/:paymentAttemptId/cancel",
  authMiddleware,
  requireRole("CUSTOMER"),
  cancelPaymentValidation,
  cancelRazorpayPayment
);

module.exports = router;
