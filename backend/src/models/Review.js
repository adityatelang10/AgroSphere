const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order reference is required"],
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Customer reference is required"],
      index: true,
    },
    crop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Crop",
      required: [true, "Crop reference is required"],
      index: true,
    },
    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot be more than 5"],
    },
    comment: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "Comment cannot exceed 1000 characters"],
    },
    farmerReply: {
      type: String,
      trim: true,
      maxlength: [1000, "Farmer reply cannot exceed 1000 characters"],
      default: "",
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  }
);

reviewSchema.index({ order: 1, customer: 1, crop: 1 }, { unique: true });
reviewSchema.index({ crop: 1, createdAt: -1 });

module.exports = mongoose.models.Review || mongoose.model("Review", reviewSchema);
