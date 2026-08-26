const { body, validationResult } = require("express-validator");

const CropRecommendation = require("../models/CropRecommendation");
const { getCropRecommendation } = require("../services/mlServiceClient");

const INPUT_RULES = [
  { field: "nitrogen", label: "Nitrogen", min: 0, max: 300 },
  { field: "phosphorus", label: "Phosphorus", min: 0, max: 300 },
  { field: "potassium", label: "Potassium", min: 0, max: 300 },
  { field: "temperature", label: "Temperature", min: -10, max: 60 },
  { field: "humidity", label: "Humidity", min: 0, max: 100 },
  { field: "ph", label: "pH", min: 0, max: 14 },
  { field: "rainfall", label: "Rainfall", min: 0, max: 5000 },
];

const cropRecommendationValidation = INPUT_RULES.map(({ field, label, min, max }) =>
  body(field).custom((value) => {
    if (typeof value === "undefined" || value === null) {
      throw new Error(`${label} is required`);
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${label} must be a valid number`);
    }

    if (value < min || value > max) {
      throw new Error(`${label} must be between ${min} and ${max}`);
    }

    return true;
  })
);

const createCropRecommendation = async (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }

  try {
    const prediction = await getCropRecommendation(req.body);
    const recommendationRecord = await CropRecommendation.create({
      farmer: req.user._id,
      inputs: req.body,
      recommendedCrop: prediction.recommendedCrop,
      recommendations: prediction.recommendations,
      modelVersion: prediction.modelVersion,
    });

    return res.status(200).json({
      success: true,
      recommendationId: recommendationRecord._id,
      ...prediction,
    });
  } catch (error) {
    if ([400, 502, 503].includes(error.statusCode)) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
};

module.exports = {
  cropRecommendationValidation,
  createCropRecommendation,
};
