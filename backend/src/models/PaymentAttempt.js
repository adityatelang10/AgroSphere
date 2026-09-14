const mongoose = require("mongoose");

const PAYMENT_ATTEMPT_STATUSES = [
  "CREATED",
  "FINALIZING",
  "FINALIZED",
  "FAILED",
  "CANCELLED",
  "RECONCILIATION_REQUIRED",
];

const paymentAddressSchema = new mongoose.Schema(
  {
    line1: { type: String, required: true, trim: true, maxlength: 120 },
    line2: { type: String, trim: true, maxlength: 120, default: "" },
    villageOrCity: { type: String, required: true, trim: true, maxlength: 80 },
    district: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    pincode: { type: String, required: true, trim: true, match: /^\d{6}$/ },
  },
  { _id: false }
);

const paymentItemSnapshotSchema = new mongoose.Schema(
  {
    crop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Crop",
      required: true,
    },
    cropName: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0.01 },
    priceAtOrder: { type: Number, required: true, min: 0 },
    lineAmountPaise: { type: Number, required: true, min: 0 },
    farmer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FarmerProfile",
      required: true,
    },
    farmerUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { _id: false }
);

const paymentAttemptSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ["razorpay"],
      default: "razorpay",
      required: true,
    },
    mode: {
      type: String,
      enum: ["test"],
      default: "test",
      required: true,
    },
    status: {
      type: String,
      enum: PAYMENT_ATTEMPT_STATUSES,
      default: "CREATED",
      required: true,
      index: true,
    },
    razorpayOrderId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    razorpayPaymentId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Payment amount must be an integer number of paise",
      },
    },
    subtotalPaise: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "Subtotal must be an integer number of paise",
      },
    },
    deliveryChargePaise: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "Delivery charge must be an integer number of paise",
      },
    },
    currency: {
      type: String,
      enum: ["INR"],
      default: "INR",
      required: true,
    },
    itemsSnapshot: {
      type: [paymentItemSnapshotSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "Payment attempt requires at least one item",
      },
    },
    deliverySnapshot: {
      type: paymentAddressSchema,
      required: true,
    },
    finalOrderIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
    verifiedAt: { type: Date, default: null },
    finalizedAt: { type: Date, default: null },
    failureReason: { type: String, trim: true, maxlength: 300, default: null },
  },
  { timestamps: true }
);

paymentAttemptSchema.index({ customer: 1, createdAt: -1 });
paymentAttemptSchema.index({ customer: 1, status: 1, createdAt: -1 });

module.exports =
  mongoose.models.PaymentAttempt ||
  mongoose.model("PaymentAttempt", paymentAttemptSchema);
module.exports.PAYMENT_ATTEMPT_STATUSES = PAYMENT_ATTEMPT_STATUSES;
