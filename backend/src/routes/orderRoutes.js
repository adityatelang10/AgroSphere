const express = require("express");

const {
  checkout,
  checkoutValidation,
  getFarmerOrders,
  getMyOrders,
  updateOrderStatus,
  updateOrderStatusValidation,
} = require("../controllers/orderController");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

router.post(
  "/checkout",
  authMiddleware,
  requireRole("CUSTOMER"),
  checkoutValidation,
  checkout
);
router.get("/my-orders", authMiddleware, requireRole("CUSTOMER"), getMyOrders);
router.get("/farmer", authMiddleware, requireRole("FARMER"), getFarmerOrders);
router.patch(
  "/:orderId/status",
  authMiddleware,
  requireRole("FARMER"),
  updateOrderStatusValidation,
  updateOrderStatus
);

module.exports = router;
