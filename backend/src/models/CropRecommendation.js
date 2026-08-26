const mongoose = require("mongoose");

const recommendationInputsSchema = new mongoose.Schema(
  {
    nitrogen: { type: Number, required: true, min: 0, max: 300 },
    phosphorus: { type: Number, required: true, min: 0, max: 300 },
    potassium: { type: Number, required: true, min: 0, max: 300 },
    temperature: { type: Number, required: true, min: -10, max: 60 },
    humidity: { type: Number, required: true, min: 0, max: 100 },
    ph: { type: Number, required: true, min: 0, max: 14 },
    rainfall: { type: Number, required: true, min: 0, max: 5000 },
  },
  { _id: false }
);

const rankedRecommendationSchema = new mongoose.Schema(
  {
    crop: {
      type: String,
      required: true,
      trim: true,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
  },
  { _id: false }
);

const cropRecommendationSchema = new mongoose.Schema(
  {
    farmer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    inputs: {
      type: recommendationInputsSchema,
      required: true,
    },
    recommendedCrop: {
      type: String,
      required: true,
      trim: true,
    },
    recommendations: {
      type: [rankedRecommendationSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length >= 1 && items.length <= 3,
        message: "Recommendations must contain between 1 and 3 crops",
      },
    },
    modelVersion: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  }
);

cropRecommendationSchema.index({ farmer: 1, createdAt: -1 });

module.exports =
  mongoose.models.CropRecommendation ||
  mongoose.model("CropRecommendation", cropRecommendationSchema);
