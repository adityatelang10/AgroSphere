const mongoose = require("mongoose");

const SUPPORTED_CROPS = ["tomato", "maize", "cotton", "groundnut"];
const SUPPORTED_STAGES = ["initial", "development", "mid_season", "late_season"];
const SUPPORTED_SOILS = ["loamy_sand", "silt", "silty_clay"];

const irrigationInputsSchema = new mongoose.Schema(
  {
    crop: { type: String, required: true, enum: SUPPORTED_CROPS },
    growthStage: { type: String, required: true, enum: SUPPORTED_STAGES },
    soilType: { type: String, required: true, enum: SUPPORTED_SOILS },
    soilMoisture: { type: Number, required: true, min: 0, max: 100 },
    minimumTemperature: { type: Number, required: true, min: -20, max: 55 },
    maximumTemperature: { type: Number, required: true, min: -15, max: 60 },
    latitude: { type: Number, required: true, min: -55, max: 55 },
    observationDate: { type: Date, required: true },
    recentRainfall: { type: Number, required: true, min: 0, max: 300 },
    forecastRainfall: { type: Number, required: true, min: 0, max: 300 },
    daysSinceLastIrrigation: { type: Number, required: true, min: 0, max: 60 },
  },
  { _id: false }
);

const irrigationResultSchema = new mongoose.Schema(
  {
    method: { type: String, required: true, trim: true },
    irrigationRequired: { type: Boolean, required: true },
    decisionCode: { type: String, required: true, trim: true },
    recommendedTiming: { type: String, required: true, trim: true },
    waterStress: { type: String, required: true, enum: ["Low", "Medium", "High"] },
    soilMoistureStatus: {
      type: String,
      required: true,
      enum: ["Low", "Moderate", "Adequate", "High"],
    },
    referenceET: { type: Number, required: true, min: 0 },
    cropCoefficient: { type: Number, required: true, min: 0 },
    cropWaterRequirement: { type: Number, required: true, min: 0 },
    effectiveRecentRainfall: { type: Number, required: true, min: 0 },
    effectiveForecastRainfall: { type: Number, required: true, min: 0 },
    estimatedIrrigationNeed: { type: Number, required: true, min: 0 },
    depletionFraction: { type: Number, required: true, min: 0, max: 1 },
    allowableDepletionFraction: { type: Number, required: true, min: 0, max: 1 },
    reasons: { type: [String], required: true },
    assumptions: { type: [String], required: true },
    warnings: { type: [String], default: [] },
  },
  { _id: false }
);

const irrigationRecordSchema = new mongoose.Schema(
  {
    farmer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    inputs: { type: irrigationInputsSchema, required: true },
    result: { type: irrigationResultSchema, required: true },
    engineVersion: { type: String, required: true, trim: true },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  }
);

irrigationRecordSchema.index({ farmer: 1, createdAt: -1 });

module.exports =
  mongoose.models.IrrigationRecord ||
  mongoose.model("IrrigationRecord", irrigationRecordSchema);
