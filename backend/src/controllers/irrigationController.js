const { body, validationResult } = require("express-validator");

const IrrigationRecord = require("../models/IrrigationRecord");
const { getIrrigationAdvice } = require("../services/mlServiceClient");

const SUPPORTED_CROPS = ["tomato", "maize", "cotton", "groundnut"];
const SUPPORTED_STAGES = ["initial", "development", "mid_season", "late_season"];
const SUPPORTED_SOILS = ["loamy_sand", "silt", "silty_clay"];

const numericRule = (field, label, minimum, maximum, integer = false) =>
  body(field).custom((value) => {
    if (typeof value === "undefined" || value === null) {
      throw new Error(`${label} is required`);
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${label} must be a valid number`);
    }

    if (integer && !Number.isInteger(value)) {
      throw new Error(`${label} must be a whole number`);
    }

    if (value < minimum || value > maximum) {
      throw new Error(`${label} must be between ${minimum} and ${maximum}`);
    }

    return true;
  });

const irrigationAdviceValidation = [
  body("crop")
    .isIn(SUPPORTED_CROPS)
    .withMessage(`Crop must be one of: ${SUPPORTED_CROPS.join(", ")}`),
  body("growthStage")
    .isIn(SUPPORTED_STAGES)
    .withMessage(`Growth stage must be one of: ${SUPPORTED_STAGES.join(", ")}`),
  body("soilType")
    .isIn(SUPPORTED_SOILS)
    .withMessage(`Soil type must be one of: ${SUPPORTED_SOILS.join(", ")}`),
  numericRule("soilMoisture", "Soil moisture", 0, 100),
  numericRule("minimumTemperature", "Minimum temperature", -20, 55),
  numericRule("maximumTemperature", "Maximum temperature", -15, 60),
  numericRule("latitude", "Latitude", -55, 55),
  body("observationDate")
    .isISO8601({ strict: true, strictSeparator: true })
    .withMessage("Observation date must use YYYY-MM-DD format"),
  numericRule("recentRainfall", "Recent rainfall", 0, 300),
  numericRule("forecastRainfall", "Forecast rainfall", 0, 300),
  numericRule("daysSinceLastIrrigation", "Days since last irrigation", 0, 60, true),
  body().custom((value) => {
    if (
      typeof value?.minimumTemperature === "number" &&
      typeof value?.maximumTemperature === "number" &&
      value.maximumTemperature <= value.minimumTemperature
    ) {
      throw new Error("Maximum temperature must be greater than minimum temperature");
    }

    return true;
  }),
];

const createIrrigationAdvice = async (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }

  try {
    const advice = await getIrrigationAdvice(req.body);
    const record = await IrrigationRecord.create({
      farmer: req.user._id,
      inputs: req.body,
      result: {
        method: advice.method,
        irrigationRequired: advice.irrigationRequired,
        decisionCode: advice.decisionCode,
        recommendedTiming: advice.recommendedTiming,
        waterStress: advice.waterStress,
        soilMoistureStatus: advice.soilMoistureStatus,
        referenceET: advice.referenceET,
        cropCoefficient: advice.cropCoefficient,
        cropWaterRequirement: advice.cropWaterRequirement,
        effectiveRecentRainfall: advice.effectiveRecentRainfall,
        effectiveForecastRainfall: advice.effectiveForecastRainfall,
        estimatedIrrigationNeed: advice.estimatedIrrigationNeed,
        depletionFraction: advice.depletionFraction,
        allowableDepletionFraction: advice.allowableDepletionFraction,
        reasons: advice.reasons,
        assumptions: advice.assumptions,
        warnings: advice.warnings,
      },
      engineVersion: advice.engineVersion,
    });

    return res.status(200).json({
      success: true,
      adviceId: record._id,
      ...advice,
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
  createIrrigationAdvice,
  irrigationAdviceValidation,
};
