const { body, param, validationResult } = require("express-validator");

const Crop = require("../models/Crop");
const FarmerProfile = require("../models/FarmerProfile");
const Order = require("../models/Order");

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

const parseNumber = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return NaN;
  }

  return Number(value);
};

const normalizeAddress = (address) => ({
  line1: String(address.line1).trim(),
  line2: address.line2 ? String(address.line2).trim() : "",
  villageOrCity: String(address.villageOrCity).trim(),
  district: String(address.district).trim(),
  state: String(address.state).trim(),
  pincode: String(address.pincode).trim(),
});

const normalizeCheckoutItems = (items) => {
  const itemMap = new Map();

  for (const item of items) {
    const cropId = String(item.cropId);
    const quantity = parseNumber(item.quantity);

    if (!itemMap.has(cropId)) {
      itemMap.set(cropId, {
        cropId,
        quantity,
      });
      continue;
    }

    itemMap.get(cropId).quantity += quantity;
  }

  return Array.from(itemMap.values());
};

const rollbackStockDecrements = async (decrementedStockEntries) => {
  if (!decrementedStockEntries.length) {
    return;
  }

  await Crop.bulkWrite(
    decrementedStockEntries.map((entry) => ({
      updateOne: {
        filter: { _id: entry.cropId },
        update: {
          $inc: {
            stockQuantity: entry.quantity,
          },
        },
      },
    }))
  );
};

const deleteCreatedOrders = async (orderIds) => {
  if (!orderIds.length) {
    return;
  }

  await Promise.allSettled(orderIds.map((orderId) => Order.findByIdAndDelete(orderId)));
};

const emitToUserRoom = (io, userId, eventName, payload) => {
  if (!io || !userId) {
    return;
  }

  io.to(`user:${String(userId)}`).emit(eventName, payload);
};

const orderPopulate = [
  {
    path: "customer",
    select: "name email deliveryAddress",
  },
  {
    path: "items.crop",
    select: "name category price unit images location",
  },
  {
    path: "items.farmer",
    select: "farmName location averageRating totalReviews",
    populate: {
      path: "user",
      select: "name email",
    },
  },
];

const checkoutValidation = [
  body("items")
    .isArray({ min: 1 })
    .withMessage("At least one checkout item is required"),
  body("items.*.cropId")
    .notEmpty()
    .withMessage("cropId is required")
    .isMongoId()
    .withMessage("cropId must be a valid MongoDB ObjectId"),
  body("items.*.quantity")
    .custom((value) => Number.isFinite(parseNumber(value)) && parseNumber(value) > 0)
    .withMessage("quantity must be a valid number greater than 0"),
  body("deliveryAddress.line1")
    .trim()
    .notEmpty()
    .withMessage("Delivery address line1 is required")
    .isLength({ max: 120 })
    .withMessage("Delivery address line1 cannot exceed 120 characters"),
  body("deliveryAddress.line2")
    .optional()
    .trim()
    .isLength({ max: 120 })
    .withMessage("Delivery address line2 cannot exceed 120 characters"),
  body("deliveryAddress.villageOrCity")
    .trim()
    .notEmpty()
    .withMessage("Delivery address villageOrCity is required")
    .isLength({ max: 80 })
    .withMessage("Delivery address villageOrCity cannot exceed 80 characters"),
  body("deliveryAddress.district")
    .trim()
    .notEmpty()
    .withMessage("Delivery address district is required")
    .isLength({ max: 80 })
    .withMessage("Delivery address district cannot exceed 80 characters"),
  body("deliveryAddress.state")
    .trim()
    .notEmpty()
    .withMessage("Delivery address state is required")
    .isLength({ max: 80 })
    .withMessage("Delivery address state cannot exceed 80 characters"),
  body("deliveryAddress.pincode")
    .trim()
    .matches(/^\d{6}$/)
    .withMessage("Delivery address pincode must be a valid 6-digit Indian pincode"),
];

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

const checkout = async (req, res, next) => {
  const validationErrorResponse = handleValidation(req, res);
  if (validationErrorResponse) {
    return validationErrorResponse;
  }

  const normalizedItems = normalizeCheckoutItems(req.body.items);
  const deliveryAddress = normalizeAddress(req.body.deliveryAddress);
  const cropIds = normalizedItems.map((item) => item.cropId);
  const decrementedStockEntries = [];
  const createdOrderIds = [];

  try {
    const crops = await Crop.find({ _id: { $in: cropIds } }).populate({
      path: "farmer",
      select: "farmName location user",
    });

    if (crops.length !== cropIds.length) {
      const foundCropIds = new Set(crops.map((crop) => String(crop._id)));
      const missingCropIds = cropIds.filter((cropId) => !foundCropIds.has(cropId));

      return res.status(404).json({
        success: false,
        message: "Some crops in the cart were not found",
        missingCropIds,
      });
    }

    const cropMap = new Map(crops.map((crop) => [String(crop._id), crop]));
    const stockIssues = normalizedItems
      .map((item) => {
        const crop = cropMap.get(item.cropId);

        if (crop.stockQuantity >= item.quantity) {
          return null;
        }

        return {
          cropId: item.cropId,
          cropName: crop.name,
          requestedQuantity: item.quantity,
          availableStock: crop.stockQuantity,
        };
      })
      .filter(Boolean);

    if (stockIssues.length > 0) {
      return res.status(409).json({
        success: false,
        message: "One or more cart items are out of stock",
        stockIssues,
      });
    }

    const farmerOrderGroups = new Map();

    for (const item of normalizedItems) {
      const crop = cropMap.get(item.cropId);
      const farmerProfile = crop.farmer;

      if (!farmerProfile || !farmerProfile.user) {
        return res.status(500).json({
          success: false,
          message: `Farmer information is incomplete for crop ${crop.name}`,
        });
      }

      const farmerId = String(farmerProfile._id);

      if (!farmerOrderGroups.has(farmerId)) {
        farmerOrderGroups.set(farmerId, {
          farmerProfileId: farmerProfile._id,
          farmerUserId: farmerProfile.user,
          items: [],
        });
      }

      farmerOrderGroups.get(farmerId).items.push({
        crop: crop._id,
        quantity: item.quantity,
        priceAtOrder: crop.price,
        farmer: farmerProfile._id,
      });
    }

    for (const item of normalizedItems) {
      const crop = cropMap.get(item.cropId);
      const updateResult = await Crop.updateOne(
        {
          _id: crop._id,
          stockQuantity: { $gte: item.quantity },
        },
        {
          $inc: {
            stockQuantity: -item.quantity,
          },
        }
      );

      if (updateResult.modifiedCount !== 1) {
        await rollbackStockDecrements(decrementedStockEntries);

        return res.status(409).json({
          success: false,
          message: `Stock changed for ${crop.name}. Please refresh your cart and try again.`,
        });
      }

      decrementedStockEntries.push({
        cropId: crop._id,
        quantity: item.quantity,
      });
    }

    const createdOrders = [];

    try {
      for (const group of farmerOrderGroups.values()) {
        const order = await Order.create({
          customer: req.user._id,
          items: group.items,
          deliveryAddress,
        });

        createdOrders.push(order);
        createdOrderIds.push(order._id);
        group.orderId = order._id;
        group.placedAt = order.placedAt;
      }
    } catch (error) {
      await deleteCreatedOrders(createdOrderIds);
      await rollbackStockDecrements(decrementedStockEntries);
      return next(error);
    }

    const io = req.app.get("io");

    for (const group of farmerOrderGroups.values()) {
      emitToUserRoom(io, group.farmerUserId, "orderPlaced", {
        orderId: group.orderId,
        status: "Pending",
        placedAt: group.placedAt,
        customer: {
          id: req.user._id,
          name: req.user.name,
        },
        itemCount: group.items.length,
        message: "You have received a new order.",
      });
    }

    let responseOrders = createdOrders;

    try {
      responseOrders = await Order.find({ _id: { $in: createdOrderIds } })
        .sort({ placedAt: -1 })
        .populate(orderPopulate);
    } catch (populateError) {
      console.error("Failed to populate checkout orders:", populateError.message);
    }

    return res.status(201).json({
      success: true,
      message: `${createdOrderIds.length} order(s) placed successfully`,
      orderCount: createdOrderIds.length,
      orders: responseOrders,
    });
  } catch (error) {
    if (createdOrderIds.length > 0) {
      await deleteCreatedOrders(createdOrderIds);
    }

    if (decrementedStockEntries.length > 0) {
      await rollbackStockDecrements(decrementedStockEntries);
    }

    return next(error);
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

    const io = req.app.get("io");

    emitToUserRoom(io, order.customer, "orderStatusUpdated", {
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
  checkoutValidation,
  updateOrderStatusValidation,
  checkout,
  updateOrderStatus,
  getMyOrders,
  getFarmerOrders,
};
