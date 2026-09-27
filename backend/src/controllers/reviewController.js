const { body, param, validationResult } = require("express-validator");
const Crop = require("../models/Crop");
const FarmerProfile = require("../models/FarmerProfile");
const Order = require("../models/Order");
const Review = require("../models/Review");
const { refreshRatingSummaries } = require("../services/reviewRatingService");

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  return errors.isEmpty() ? null : res.status(400).json({
    success: false, message: "Validation failed", errors: errors.array(),
  });
};
const reviewPopulate = [
  { path: "customer", select: "name" },
  { path: "order", select: "customer status items.crop" },
];
const referenceId = (value) => String(value?._id || value);
const hasVerifiedPurchase = (review) => review.order?.status === "Delivered" &&
  referenceId(review.order.customer) === referenceId(review.customer) &&
  (review.order.items || []).some((item) => referenceId(item.crop) === referenceId(review.crop));

// Public responses never include order IDs, customer IDs, emails or image metadata.
const serializeReview = (review, own = false) => ({
  _id: review._id,
  rating: review.rating,
  comment: review.comment,
  customer: { name: review.customer?.name || "Customer" },
  verifiedPurchase: hasVerifiedPurchase(review),
  farmerReply: review.farmerReply,
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
  ...(own ? { orderId: referenceId(review.order), cropId: referenceId(review.crop) } : {}),
});

// Store plain text, not HTML. React renders it as text, never dangerouslySetInnerHTML.
const commentValidation = () => body("comment").optional().isString().withMessage("Review must be text").bail()
  .trim().isLength({ max: 1000 }).withMessage("Review cannot exceed 1000 characters")
  .bail().custom((value) => !/[<>\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))
  .withMessage("Use plain text without HTML or control characters");
const ratingValidation = () => body("rating")
  .custom((value) => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5)
  .withMessage("Rating must be an integer between 1 and 5");
const createReviewValidation = [
  body("orderId").isMongoId().withMessage("A valid orderId is required"),
  body("cropId").isMongoId().withMessage("A valid cropId is required"),
  ratingValidation(), commentValidation(),
];
const cropIdValidation = [param("id").isMongoId().withMessage("Invalid crop ID")];
const reviewIdValidation = () => param("id").isMongoId().withMessage("Invalid review ID");
const updateReviewValidation = [reviewIdValidation(), ratingValidation(), commentValidation()];
const replyValidation = [
  reviewIdValidation(),
  body("farmerReply").isString().bail().trim().notEmpty().isLength({ max: 1000 }),
];

const findDeliveredPurchase = async (orderId, cropId, customerId) => {
  const order = await Order.findOne({
    _id: orderId, customer: customerId, status: "Delivered", "items.crop": cropId,
  });
  const item = order?.items.find((entry) => referenceId(entry.crop) === String(cropId).toLowerCase());
  if (!item) return null;
  // No removedAt filter: delivered purchases of removed listings remain reviewable.
  const crop = await Crop.findById(cropId).populate({ path: "farmer", select: "user" });
  if (!crop?.farmer || referenceId(crop.farmer) !== referenceId(item.farmer) ||
      referenceId(crop.farmer.user) === String(customerId)) return null;
  return { order, crop, farmerId: item.farmer };
};
const purchaseDenied = (res) => res.status(403).json({
  success: false, message: "You can only review someone else's crops from your own delivered orders",
});

const createReview = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const { orderId, cropId, rating, comment = "" } = req.body;
    const purchase = await findDeliveredPurchase(orderId, cropId, req.user._id);
    if (!purchase) return purchaseDenied(res);
    if (await Review.findOne({ order: orderId, customer: req.user._id, crop: cropId })) {
      return res.status(409).json({ success: false, message: "You have already reviewed this crop for the selected order" });
    }
    const review = await Review.create({
      order: purchase.order._id, customer: req.user._id, crop: purchase.crop._id,
      farmer: purchase.farmerId, verifiedPurchase: true, rating, comment,
    });
    const aggregates = await refreshRatingSummaries(cropId, purchase.farmerId);
    const populated = await Review.findById(review._id).populate(reviewPopulate);
    return res.status(201).json({ success: true, message: "Review submitted successfully", review: serializeReview(populated, true), aggregates });
  } catch (error) {
    // The compound unique index also rejects duplicates in concurrent requests.
    if (error.code === 11000) return res.status(409).json({ success: false, message: "You have already reviewed this crop for the selected order" });
    return next(error);
  }
};

const updateReview = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const review = await Review.findOne({ _id: req.params.id, customer: req.user._id });
    if (!review) return res.status(404).json({ success: false, message: "Review not found in your purchases" });
    const purchase = await findDeliveredPurchase(review.order, review.crop, req.user._id);
    if (!purchase) return purchaseDenied(res);
    // Identity and verification fields are never copied from the request body.
    review.rating = req.body.rating;
    review.comment = req.body.comment ?? review.comment;
    review.farmer = purchase.farmerId;
    review.verifiedPurchase = true;
    await review.save();
    const aggregates = await refreshRatingSummaries(review.crop, purchase.farmerId);
    const populated = await Review.findById(review._id).populate(reviewPopulate);
    return res.json({ success: true, message: "Review updated successfully", review: serializeReview(populated, true), aggregates });
  } catch (error) { return next(error); }
};

const getMyReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ customer: req.user._id }).sort({ createdAt: -1 }).populate(reviewPopulate);
    return res.json({ success: true, reviews: reviews.map((review) => serializeReview(review, true)) });
  } catch (error) { return next(error); }
};

const getCropReviews = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const crop = await Crop.findById(req.params.id).select("name");
    if (!crop) return res.status(404).json({ success: false, message: "Crop not found" });
    const records = await Review.find({ crop: req.params.id }).sort({ createdAt: -1 }).populate(reviewPopulate);
    // Legacy records are verified against orders on read, without migrating demo data.
    const reviews = records.filter(hasVerifiedPurchase).map((review) => serializeReview(review));
    const averageRating = reviews.length
      ? Math.round(reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length * 10) / 10 : 0;
    return res.json({ success: true, crop: { id: crop._id, name: crop.name, averageRating, totalReviews: reviews.length }, count: reviews.length, reviews });
  } catch (error) { return next(error); }
};

const replyToReview = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const farmerProfile = await FarmerProfile.findOne({ user: req.user._id });
    if (!farmerProfile) return res.status(404).json({ success: false, message: "Farmer profile not found" });
    const review = await Review.findById(req.params.id).populate({ path: "crop", select: "farmer name" });
    if (!review) return res.status(404).json({ success: false, message: "Review not found" });
    if (!review.crop || String(review.crop.farmer) !== String(farmerProfile._id)) {
      return res.status(403).json({ success: false, message: "You can only reply to reviews for your own crops" });
    }
    review.farmerReply = req.body.farmerReply;
    await review.save();
    return res.json({ success: true, message: "Reply added successfully", review: serializeReview(await Review.findById(review._id).populate(reviewPopulate)) });
  } catch (error) { return next(error); }
};

module.exports = {
  createReviewValidation, updateReviewValidation, cropIdValidation, replyValidation,
  createReview, updateReview, getMyReviews, getCropReviews, replyToReview,
};
