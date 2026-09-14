const { body, param, validationResult } = require("express-validator");

const { CheckoutError } = require("../services/checkoutService");
const {
  PaymentServiceError,
  PaymentVerificationError,
  cancelPaymentAttempt,
  createPaymentAttempt,
  verifyPaymentAttempt,
} = require("../services/paymentWorkflowService");

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return null;
  }

  return res.status(400).json({
    success: false,
    message: "Validation failed",
    errors: errors.array(),
  });
};

const createPaymentValidation = [
  body("items")
    .isArray({ min: 1 })
    .withMessage("At least one checkout item is required"),
  body("items.*.cropId")
    .isMongoId()
    .withMessage("cropId must be a valid MongoDB ObjectId"),
  body("items.*.quantity")
    .custom((value) => Number.isFinite(Number(value)) && Number(value) > 0)
    .withMessage("quantity must be a valid number greater than 0"),
  body("deliveryAddress.line1")
    .trim()
    .notEmpty()
    .withMessage("Delivery address line1 is required")
    .isLength({ max: 120 }),
  body("deliveryAddress.line2").optional().trim().isLength({ max: 120 }),
  body("deliveryAddress.villageOrCity")
    .trim()
    .notEmpty()
    .withMessage("Delivery address villageOrCity is required")
    .isLength({ max: 80 }),
  body("deliveryAddress.district")
    .trim()
    .notEmpty()
    .withMessage("Delivery address district is required")
    .isLength({ max: 80 }),
  body("deliveryAddress.state")
    .trim()
    .notEmpty()
    .withMessage("Delivery address state is required")
    .isLength({ max: 80 }),
  body("deliveryAddress.pincode")
    .trim()
    .matches(/^\d{6}$/)
    .withMessage("Delivery address pincode must be a valid 6-digit Indian pincode"),
];

const verifyPaymentValidation = [
  body("paymentAttemptId")
    .isMongoId()
    .withMessage("paymentAttemptId must be a valid MongoDB ObjectId"),
  body("razorpay_payment_id")
    .isString()
    .trim()
    .matches(/^pay_[A-Za-z0-9]+$/)
    .withMessage("razorpay_payment_id is invalid"),
  body("razorpay_order_id")
    .isString()
    .trim()
    .matches(/^order_[A-Za-z0-9]+$/)
    .withMessage("razorpay_order_id is invalid"),
  body("razorpay_signature")
    .isString()
    .trim()
    .matches(/^[a-fA-F0-9]{64}$/)
    .withMessage("razorpay_signature is invalid"),
];

const cancelPaymentValidation = [
  param("paymentAttemptId")
    .isMongoId()
    .withMessage("paymentAttemptId must be a valid MongoDB ObjectId"),
];

const sendExpectedPaymentError = (res, error) => {
  if (
    error instanceof PaymentServiceError ||
    error instanceof PaymentVerificationError ||
    error instanceof CheckoutError
  ) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      code: error.code,
      ...(error.details ? { details: error.details } : {}),
    });
  }

  return null;
};

const createRazorpayOrder = async (req, res, next) => {
  const validationResponse = handleValidation(req, res);
  if (validationResponse) {
    return validationResponse;
  }

  try {
    const result = await createPaymentAttempt({
      customer: req.user._id,
      items: req.body.items,
      deliveryAddress: req.body.deliveryAddress,
    });
    return res.status(201).json(result);
  } catch (error) {
    return sendExpectedPaymentError(res, error) || next(error);
  }
};

const verifyRazorpayPayment = async (req, res, next) => {
  const validationResponse = handleValidation(req, res);
  if (validationResponse) {
    return validationResponse;
  }

  try {
    const result = await verifyPaymentAttempt({
      customer: req.user._id,
      paymentAttemptId: req.body.paymentAttemptId,
      razorpayPaymentId: req.body.razorpay_payment_id,
      razorpayOrderId: req.body.razorpay_order_id,
      razorpaySignature: req.body.razorpay_signature,
      io: req.app.get("io"),
    });
    return res.status(result.idempotent ? 200 : 201).json(result);
  } catch (error) {
    return sendExpectedPaymentError(res, error) || next(error);
  }
};

const cancelRazorpayPayment = async (req, res, next) => {
  const validationResponse = handleValidation(req, res);
  if (validationResponse) {
    return validationResponse;
  }

  try {
    const result = await cancelPaymentAttempt({
      customer: req.user._id,
      paymentAttemptId: req.params.paymentAttemptId,
    });
    return res.status(200).json(result);
  } catch (error) {
    return sendExpectedPaymentError(res, error) || next(error);
  }
};

module.exports = {
  cancelPaymentValidation,
  cancelRazorpayPayment,
  createPaymentValidation,
  createRazorpayOrder,
  verifyPaymentValidation,
  verifyRazorpayPayment,
};
