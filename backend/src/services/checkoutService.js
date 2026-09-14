const mongoose = require("mongoose");

const Crop = require("../models/Crop");
const Order = require("../models/Order");

class CheckoutError extends Error {
  constructor(message, statusCode = 400, code = "CHECKOUT_ERROR", details = null) {
    super(message);
    this.name = "CheckoutError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const parsePositiveQuantity = (value) => {
  const quantity = typeof value === "string" && value.trim() ? Number(value) : value;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new CheckoutError("Each checkout quantity must be greater than 0.");
  }

  return quantity;
};

const normalizeCheckoutItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new CheckoutError("At least one checkout item is required.");
  }

  const itemMap = new Map();

  for (const item of items) {
    const cropId = String(item?.cropId || "").trim();
    if (!mongoose.isValidObjectId(cropId)) {
      throw new CheckoutError("Each cropId must be a valid MongoDB ObjectId.");
    }

    const quantity = parsePositiveQuantity(item.quantity);
    itemMap.set(cropId, (itemMap.get(cropId) || 0) + quantity);
  }

  return Array.from(itemMap, ([cropId, quantity]) => ({ cropId, quantity }));
};

const normalizeDeliveryAddress = (address) => {
  const source = address || {};
  const normalizedAddress = {
    line1: String(source.line1 || "").trim(),
    line2: String(source.line2 || "").trim(),
    villageOrCity: String(source.villageOrCity || "").trim(),
    district: String(source.district || "").trim(),
    state: String(source.state || "").trim(),
    pincode: String(source.pincode || "").trim(),
  };

  if (
    !normalizedAddress.line1 ||
    !normalizedAddress.villageOrCity ||
    !normalizedAddress.district ||
    !normalizedAddress.state ||
    !/^\d{6}$/.test(normalizedAddress.pincode)
  ) {
    throw new CheckoutError("A valid Indian delivery address is required.");
  }

  return normalizedAddress;
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

const createCheckoutService = ({ CropModel = Crop, OrderModel = Order } = {}) => {
  const loadCrops = async (cropIds) =>
    CropModel.find({ _id: { $in: cropIds } }).populate({
      path: "farmer",
      select: "farmName location user",
    });

  const buildCheckoutQuote = async ({ items, deliveryAddress }) => {
    const normalizedItems = normalizeCheckoutItems(items);
    const normalizedAddress = normalizeDeliveryAddress(deliveryAddress);
    const cropIds = normalizedItems.map((item) => item.cropId);
    const crops = await loadCrops(cropIds);

    if (crops.length !== cropIds.length) {
      const foundIds = new Set(crops.map((crop) => String(crop._id)));
      const missingCropIds = cropIds.filter((cropId) => !foundIds.has(cropId));
      throw new CheckoutError(
        "Some crops in the cart were not found.",
        404,
        "CROPS_NOT_FOUND",
        { missingCropIds }
      );
    }

    const cropMap = new Map(crops.map((crop) => [String(crop._id), crop]));
    const stockIssues = [];
    const itemsSnapshot = normalizedItems.map((item) => {
      const crop = cropMap.get(item.cropId);

      if (!crop.farmer?._id || !crop.farmer?.user) {
        throw new CheckoutError(
          `Farmer information is incomplete for crop ${crop.name}.`,
          409,
          "FARMER_INFORMATION_INCOMPLETE"
        );
      }

      if (!Number.isFinite(crop.price) || crop.price < 0) {
        throw new CheckoutError(
          `The stored price for ${crop.name} is invalid.`,
          409,
          "INVALID_STORED_PRICE"
        );
      }

      if (crop.stockQuantity < item.quantity) {
        stockIssues.push({
          cropId: item.cropId,
          cropName: crop.name,
          requestedQuantity: item.quantity,
          availableStock: crop.stockQuantity,
        });
      }

      return {
        crop: crop._id,
        cropName: crop.name,
        unit: crop.unit,
        quantity: item.quantity,
        priceAtOrder: crop.price,
        lineAmountPaise: Math.round(crop.price * item.quantity * 100),
        farmer: crop.farmer._id,
        farmerUser: crop.farmer.user,
      };
    });

    if (stockIssues.length > 0) {
      throw new CheckoutError(
        "One or more cart items are out of stock.",
        409,
        "OUT_OF_STOCK",
        { stockIssues }
      );
    }

    const subtotalPaise = itemsSnapshot.reduce(
      (total, item) => total + item.lineAmountPaise,
      0
    );
    const deliveryChargePaise = 0;
    const amountPaise = subtotalPaise + deliveryChargePaise;

    if (!Number.isSafeInteger(amountPaise) || amountPaise < 1) {
      throw new CheckoutError(
        "The server-calculated checkout total is invalid.",
        409,
        "INVALID_CHECKOUT_TOTAL"
      );
    }

    return {
      currency: "INR",
      itemsSnapshot,
      deliverySnapshot: normalizedAddress,
      subtotalPaise,
      deliveryChargePaise,
      amountPaise,
    };
  };

  const rollbackStockDecrements = async (entries) => {
    if (!entries.length) {
      return;
    }

    await CropModel.bulkWrite(
      entries.map((entry) => ({
        updateOne: {
          filter: { _id: entry.cropId },
          update: { $inc: { stockQuantity: entry.quantity } },
        },
      }))
    );
  };

  const deleteCreatedOrders = async (orderIds) => {
    if (!orderIds.length) {
      return;
    }

    await Promise.allSettled(
      orderIds.map((orderId) => OrderModel.findByIdAndDelete(orderId))
    );
  };

  const finalizeCheckout = async ({
    customer,
    paymentAttemptId,
    itemsSnapshot,
    deliverySnapshot,
    razorpayOrderId,
    razorpayPaymentId,
    verifiedAt,
    io,
  }) => {
    const cropIds = itemsSnapshot.map((item) => item.crop);
    const currentCrops = await CropModel.find({ _id: { $in: cropIds } });

    if (currentCrops.length !== cropIds.length) {
      throw new CheckoutError(
        "Payment was verified, but a crop is no longer available. Manual reconciliation is required.",
        409,
        "RECONCILIATION_REQUIRED"
      );
    }

    const currentCropMap = new Map(
      currentCrops.map((crop) => [String(crop._id), crop])
    );

    for (const item of itemsSnapshot) {
      const crop = currentCropMap.get(String(item.crop));
      if (!crop || crop.stockQuantity < item.quantity) {
        throw new CheckoutError(
          "Payment was verified, but inventory changed. Manual reconciliation is required.",
          409,
          "RECONCILIATION_REQUIRED"
        );
      }
    }

    const groups = new Map();
    for (const item of itemsSnapshot) {
      const farmerId = String(item.farmer);
      if (!groups.has(farmerId)) {
        groups.set(farmerId, {
          farmerUserId: item.farmerUser,
          items: [],
        });
      }

      groups.get(farmerId).items.push({
        crop: item.crop,
        quantity: item.quantity,
        priceAtOrder: item.priceAtOrder,
        farmer: item.farmer,
      });
    }

    const decrementedStockEntries = [];
    const createdOrderIds = [];
    const createdOrders = [];

    try {
      for (const item of itemsSnapshot) {
        const updateResult = await CropModel.updateOne(
          { _id: item.crop, stockQuantity: { $gte: item.quantity } },
          { $inc: { stockQuantity: -item.quantity } }
        );

        if (updateResult.modifiedCount !== 1) {
          throw new CheckoutError(
            "Payment was verified, but inventory changed. Manual reconciliation is required.",
            409,
            "RECONCILIATION_REQUIRED"
          );
        }

        decrementedStockEntries.push({
          cropId: item.crop,
          quantity: item.quantity,
        });
      }

      for (const group of groups.values()) {
        const order = await OrderModel.create({
          customer,
          items: group.items,
          deliveryAddress: deliverySnapshot,
          paymentMethod: "razorpay_test",
          paymentStatus: "VERIFIED",
          paymentProvider: "razorpay",
          paymentMode: "test",
          razorpayOrderId,
          razorpayPaymentId,
          paymentAttempt: paymentAttemptId,
          paidAt: verifiedAt,
        });

        createdOrders.push(order);
        createdOrderIds.push(order._id);
        group.orderId = order._id;
        group.placedAt = order.placedAt;
      }
    } catch (error) {
      await deleteCreatedOrders(createdOrderIds);
      await rollbackStockDecrements(decrementedStockEntries);
      throw error;
    }

    for (const group of groups.values()) {
      if (io && group.farmerUserId) {
        io.to(`user:${String(group.farmerUserId)}`).emit("orderPlaced", {
          orderId: group.orderId,
          status: "Pending",
          placedAt: group.placedAt,
          customer: { id: customer },
          itemCount: group.items.length,
          paymentStatus: "VERIFIED",
          paymentMode: "test",
          message: "You have received a new test-paid order.",
        });
      }
    }

    let responseOrders = createdOrders;
    try {
      responseOrders = await OrderModel.find({ _id: { $in: createdOrderIds } })
        .sort({ placedAt: -1 })
        .populate(orderPopulate);
    } catch (error) {
      // The orders are valid even if optional response population fails.
    }

    return {
      orderIds: createdOrderIds,
      orders: responseOrders,
    };
  };

  return {
    buildCheckoutQuote,
    finalizeCheckout,
  };
};

const checkoutService = createCheckoutService();

module.exports = {
  CheckoutError,
  createCheckoutService,
  normalizeCheckoutItems,
  normalizeDeliveryAddress,
  orderPopulate,
  ...checkoutService,
};
