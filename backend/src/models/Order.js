const mongoose = require("mongoose");

const orderAddressSchema = new mongoose.Schema(
  {
    line1: {
      type: String,
      trim: true,
      required: [true, "Address line 1 is required"],
      maxlength: [120, "Address line 1 cannot exceed 120 characters"],
    },
    line2: {
      type: String,
      trim: true,
      maxlength: [120, "Address line 2 cannot exceed 120 characters"],
    },
    villageOrCity: {
      type: String,
      trim: true,
      required: [true, "Village or city is required"],
      maxlength: [80, "Village or city cannot exceed 80 characters"],
    },
    district: {
      type: String,
      trim: true,
      required: [true, "District is required"],
      maxlength: [80, "District cannot exceed 80 characters"],
    },
    state: {
      type: String,
      trim: true,
      required: [true, "State is required"],
      maxlength: [80, "State cannot exceed 80 characters"],
    },
    pincode: {
      type: String,
      trim: true,
      required: [true, "Pincode is required"],
      match: [/^\d{6}$/, "Pincode must be a valid 6-digit Indian pincode"],
    },
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema(
  {
    crop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Crop",
      required: [true, "Crop reference is required"],
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [0.01, "Quantity must be greater than 0"],
    },
    priceAtOrder: {
      type: Number,
      required: [true, "Price at order is required"],
      min: [0, "Price at order cannot be negative"],
    },
    farmer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FarmerProfile",
      required: [true, "Farmer profile reference is required"],
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Customer reference is required"],
      index: true,
    },
    items: {
      type: [orderItemSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "At least one order item is required",
      },
    },
    deliveryAddress: {
      type: orderAddressSchema,
      required: [true, "Delivery address is required"],
    },
    status: {
      type: String,
      enum: ["Pending", "Confirmed", "Dispatched", "Delivered"],
      default: "Pending",
      index: true,
    },
  },
  {
    timestamps: {
      createdAt: "placedAt",
      updatedAt: "updatedAt",
    },
  }
);

orderSchema.index({ customer: 1, placedAt: -1 });
orderSchema.index({ "items.farmer": 1, status: 1, placedAt: -1 });

module.exports = mongoose.models.Order || mongoose.model("Order", orderSchema);
