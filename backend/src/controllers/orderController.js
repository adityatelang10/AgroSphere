const { body, param, validationResult } = require("express-validator");

const FarmerProfile = require("../models/FarmerProfile");
const Order = require("../models/Order");
const { orderPopulate } = require("../services/checkoutService");

const ORDER_STATUSES = ["Pending", "Confirmed", "Dispatched", "Delivered"];
const NEXT_STATUS_MAP = {
  Pending: "Confirmed",
  Confirmed: "Dispatched",
  Dispatched: "Delivered",
};

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

const updateOrderStatusValidation = [
  param("orderId")
    .isMongoId()
    .withMessage("orderId must be a valid MongoDB ObjectId"),
  body("status")
    .trim()
    .notEmpty()
    .withMessage("status is required")
    .isIn(ORDER_STATUSES.filter((status) => status !== "Pending"))
    .withMessage("status must be one of Confirmed, Dispatched, or Delivered"),
];

const checkoutRequiresPayment = (req, res) =>
  res.status(409).json({
    success: false,
    message:
      "Use Razorpay Test Payment from the cart. Orders are finalized only after backend payment verification.",
    code: "TEST_PAYMENT_REQUIRED",
  });

const emitToUserRoom = (io, userId, eventName, payload) => {
  if (io && userId) {
    io.to(`user:${String(userId)}`).emit(eventName, payload);
  }
};

const updateOrderStatus = async (req, res, next) => {
  const validationErrorResponse = handleValidation(req, res);
  if (validationErrorResponse) {
    return validationErrorResponse;
  }

  try {
    const farmerProfile = await FarmerProfile.findOne({ user: req.user._id });

    if (!farmerProfile) {
      return res.status(404).json({
        success: false,
        message: "Farmer profile not found",
      });
    }

    const order = await Order.findOne({
      _id: req.params.orderId,
      "items.farmer": farmerProfile._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found for this farmer",
      });
    }

    const nextAllowedStatus = NEXT_STATUS_MAP[order.status];

    if (!nextAllowedStatus) {
      return res.status(400).json({
        success: false,
        message: "Delivered orders cannot be updated further",
      });
    }

    if (req.body.status !== nextAllowedStatus) {
      return res.status(400).json({
        success: false,
        message: `Order status can only move from ${order.status} to ${nextAllowedStatus}`,
      });
    }

    order.status = req.body.status;
    await order.save();

    emitToUserRoom(req.app.get("io"), order.customer, "orderStatusUpdated", {
      orderId: order._id,
      status: order.status,
      message: `Your order status is now ${order.status}.`,
    });

    return res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      order: await Order.findById(order._id).populate(orderPopulate),
    });
  } catch (error) {
    return next(error);
  }
};

const getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ customer: req.user._id })
      .select("-paymentAttempt -razorpayOrderId")
      .sort({ placedAt: -1 })
      .populate(orderPopulate);

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    return next(error);
  }
};

const getFarmerOrders = async (req, res, next) => {
  try {
    const farmerProfile = await FarmerProfile.findOne({ user: req.user._id });

    if (!farmerProfile) {
      return res.status(404).json({
        success: false,
        message: "Farmer profile not found",
      });
    }

    const orders = await Order.find({ "items.farmer": farmerProfile._id })
      .select("-paymentAttempt -razorpayOrderId -razorpayPaymentId")
      .sort({ placedAt: -1 })
      .populate(orderPopulate);

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  checkoutRequiresPayment,
  getFarmerOrders,
  getMyOrders,
  updateOrderStatus,
  updateOrderStatusValidation,
};
