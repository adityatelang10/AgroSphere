const mongoose = require("mongoose");
const Review = require("../models/Review");
const Crop = require("../models/Crop");
const FarmerProfile = require("../models/FarmerProfile");

// Recheck the actual purchase, including for legacy reviews without the new flag.
// A client flag (or an old seeded rating) is not proof of a delivered purchase.
const verifiedPurchaseStages = () => [
  { $lookup: { from: "orders", localField: "order", foreignField: "_id", as: "purchase" } },
  { $unwind: "$purchase" },
  { $match: { "purchase.status": "Delivered", $expr: { $and: [
    { $eq: ["$customer", "$purchase.customer"] },
    { $in: ["$crop", "$purchase.items.crop"] },
  ] } } },
];
const summaryGroup = (id) => ({ $group: { _id: id, averageRating: { $avg: "$rating" }, totalReviews: { $sum: 1 } } });
const normalizeSummary = (summary) => ({
  averageRating: Math.round((summary?.averageRating || 0) * 10) / 10,
  totalReviews: summary?.totalReviews || 0,
});
const objectId = (value) => new mongoose.Types.ObjectId(String(value));

const getFarmerRatingSummary = async (farmerId) => {
  const [summary] = await Review.aggregate([
    { $lookup: { from: "crops", localField: "crop", foreignField: "_id", as: "cropDoc" } },
    { $unwind: "$cropDoc" },
    { $match: { "cropDoc.farmer": objectId(farmerId) } },
    ...verifiedPurchaseStages(), summaryGroup("$cropDoc.farmer"),
  ]);
  return normalizeSummary(summary);
};
const getCropRatingSummaries = async (cropIds) => {
  if (!cropIds.length) return new Map();
  const summaries = await Review.aggregate([
    { $match: { crop: { $in: cropIds.map(objectId) } } },
    ...verifiedPurchaseStages(), summaryGroup("$crop"),
  ]);
  return new Map(summaries.map((summary) => [String(summary._id), normalizeSummary(summary)]));
};
const refreshRatingSummaries = async (cropId, farmerId) => {
  const [cropSummaries, farmer] = await Promise.all([
    getCropRatingSummaries([cropId]), getFarmerRatingSummary(farmerId),
  ]);
  const crop = cropSummaries.get(String(cropId)) || normalizeSummary();
  await Promise.all([Crop.findByIdAndUpdate(cropId, crop), FarmerProfile.findByIdAndUpdate(farmerId, farmer)]);
  return { crop, farmer };
};

module.exports = { getCropRatingSummaries, getFarmerRatingSummary, refreshRatingSummaries };
