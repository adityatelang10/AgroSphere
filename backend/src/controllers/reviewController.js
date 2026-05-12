const mongoose = require("mongoose");
const { body, param, validationResult } = require("express-validator");

const Crop = require("../models/Crop");
const FarmerProfile = require("../models/FarmerProfile");
const Order = require("../models/Order");
const Review = require("../models/Review");

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

const reviewPopulate = [
  {
    path: "customer",
    select: "name",
  },
  {
    path: "crop",
    select: "name category images averageRating totalReviews farmer",
    populate: {
      path: "farmer",
      select: "farmName averageRating totalReviews",
      populate: {
        path: "user",
        select: "name",
      },
    },
  },
  {
    path: "order",
    select: "status placedAt deliveredAt",
  },
];

const roundToOneDecimal = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 10) / 10;
};

const updateCropRatingSummary = async (cropId) => {
  const [summary] = await Review.aggregate([
    {
      $match: {
        crop: new mongoose.Types.ObjectId(String(cropId)),
      },
    },
    {
      $group: {
        _id: "$crop",
        averageRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  const averageRating = roundToOneDecimal(summary?.averageRating || 0);
  const totalReviews = summary?.totalReviews || 0;

  await Crop.findByIdAndUpdate(cropId, {
    averageRating,
    totalReviews,
  });

  return { averageRating, totalReviews };
};

const updateFarmerRatingSummary = async (farmerProfileId) => {
  const [summary] = await Review.aggregate([
    {
      $lookup: {
        from: "crops",
        localField: "crop",
        foreignField: "_id",
        as: "cropDoc",
      },
    },
    {
      $unwind: "$cropDoc",
    },
    {
      $match: {
        "cropDoc.farmer": new mongoose.Types.ObjectId(String(farmerProfileId)),
      },
    },
    {
      $group: {
        _id: "$cropDoc.farmer",
        averageRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  const averageRating = roundToOneDecimal(summary?.averageRating || 0);
  const totalReviews = summary?.totalReviews || 0;

  await FarmerProfile.findByIdAndUpdate(farmerProfileId, {
    averageRating,
    totalReviews,
  });

  return { averageRating, totalReviews };
};

const createReviewValidation = [
  body("orderId")
    .notEmpty()
    .withMessage("orderId is required")
    .isMongoId()
    .withMessage("orderId must be a valid MongoDB ObjectId"),
  body("cropId")
    .notEmpty()
    .withMessage("cropId is required")
    .isMongoId()
    .withMessage("cropId must be a valid MongoDB ObjectId"),
  body("rating")
    .notEmpty()
    .withMessage("rating is required")
    .isInt({ min: 1, max: 5 })
    .withMessage("rating must be an integer between 1 and 5"),
  body("comment")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("comment cannot exceed 1000 characters"),
];

const cropIdValidation = [
  param("id").isMongoId().withMessage("Crop id must be a valid MongoDB ObjectId"),
];

const reviewIdValidation = [
  param("id").isMongoId().withMessage("Review id must be a valid MongoDB ObjectId"),
];

const replyValidation = [
  ...reviewIdValidation,
  body("farmerReply")
    .trim()
    .notEmpty()
    .withMessage("farmerReply is required")
    .isLength({ max: 1000 })
    .withMessage("farmerReply cannot exceed 1000 characters"),
];

const createReview = async (req, res, next) => {
  const validationErrorResponse = handleValidation(req, res);
  if (validationErrorResponse) {
    return validationErrorResponse;
  }

  try {
    const { orderId, cropId, rating } = req.body;
    const comment = req.body.comment ? req.body.comment.trim() : "";

    const order = await Order.findOne({
      _id: orderId,
      customer: req.user._id,
      status: "Delivered",
      "items.crop": cropId,
    });

    if (!order) {
      return res.status(403).json({
        success: false,
        message: "You can only review crops from your delivered orders",
      });
    }

    const existingReview = await Review.findOne({
      order: orderId,
      customer: req.user._id,
      crop: cropId,
    });

    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this crop for the selected order",
      });
    }

    const crop = await Crop.findById(cropId).populate({
      path: "farmer",
      select: "farmName user averageRating totalReviews",
    });

    if (!crop) {
      return res.status(404).json({
        success: false,
        message: "Crop not found",
      });
    }

    const orderItem = order.items.find((item) => String(item.crop) === String(cropId));

    if (!orderItem) {
      return res.status(403).json({
        success: false,
        message: "This crop does not belong to the selected delivered order",
      });
    }

    const review = await Review.create({
      order: order._id,
      customer: req.user._id,
      crop: crop._id,
      rating: Number(rating),
      comment,
    });

    const [cropRatingSummary, farmerRatingSummary] = await Promise.all([
      updateCropRatingSummary(crop._id),
      updateFarmerRatingSummary(crop.farmer._id),
    ]);

    const populatedReview = await Review.findById(review._id).populate(reviewPopulate);

    return res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      review: populatedReview,
      aggregates: {
        crop: cropRatingSummary,
        farmer: farmerRatingSummary,
      },
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this crop for the selected order",
      });
    }

    return next(error);
  }
};

const getCropReviews = async (req, res, next) => {
  const validationErrorResponse = handleValidation(req, res);
  if (validationErrorResponse) {
    return validationErrorResponse;
  }

  try {
    const crop = await Crop.findById(req.params.id).select(
      "name averageRating totalReviews farmer"
    );

    if (!crop) {
      return res.status(404).json({
        success: false,
        message: "Crop not found",
      });
    }

    const reviews = await Review.find({ crop: req.params.id })
      .sort({ createdAt: -1 })
      .populate({
        path: "customer",
        select: "name",
      });

    return res.status(200).json({
      success: true,
      crop: {
        id: crop._id,
        name: crop.name,
        averageRating: crop.averageRating,
        totalReviews: crop.totalReviews,
      },
      count: reviews.length,
      reviews,
    });
  } catch (error) {
    return next(error);
  }
};

const replyToReview = async (req, res, next) => {
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

    const review = await Review.findById(req.params.id).populate({
      path: "crop",
      select: "farmer name",
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    if (!review.crop || String(review.crop.farmer) !== String(farmerProfile._id)) {
      return res.status(403).json({
        success: false,
        message: "You can only reply to reviews for your own crops",
      });
    }

    review.farmerReply = req.body.farmerReply.trim();
    await review.save();

    return res.status(200).json({
      success: true,
      message: "Reply added successfully",
      review: await Review.findById(review._id).populate(reviewPopulate),
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createReviewValidation,
  cropIdValidation,
  replyValidation,
  createReview,
  getCropReviews,
  replyToReview,
};
