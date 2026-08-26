const mongoose = require("mongoose");

const {
  ACTION_DEFINITIONS,
  CROP_DEFINITIONS,
  FARM_STATES,
} = require("../config/decisionEngineConfig");

const SUPPORTED_CROPS = Object.keys(CROP_DEFINITIONS);
const ACTION_CODES = Object.keys(ACTION_DEFINITIONS);
const ACTION_STATUSES = [
  "SCORED",
  "BLOCKED",
  "INSUFFICIENT_EVIDENCE",
  "NOT_APPLICABLE",
];

const factorSchema = new mongoose.Schema(
  {
    factor: { type: String, required: true, trim: true },
    effect: { type: Number, required: true },
    reason: { type: String, required: true, trim: true },
    source: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const candidateActionSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, enum: ACTION_CODES },
    title: { type: String, required: true, trim: true },
    status: { type: String, required: true, enum: ACTION_STATUSES },
    score: { type: Number, min: 0, max: 100, default: null },
    factors: { type: [factorSchema], required: true },
    constraints: { type: [String], default: [] },
  },
  { _id: false }
);

const rankedActionSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, enum: ACTION_CODES },
    title: { type: String, required: true, trim: true },
    score: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const alternativeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, enum: ACTION_CODES },
    title: { type: String, required: true, trim: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    reason: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const farmerContextSchema = new mongoose.Schema(
  {
    selectedCrop: { type: String, required: true, enum: SUPPORTED_CROPS },
    farmState: { type: String, required: true, enum: FARM_STATES },
    availableQuantity: { type: Number, required: true, min: 0 },
    quantityUnit: { type: String, required: true, trim: true },
    waterAvailability: {
      type: String,
      required: true,
      enum: ["adequate", "limited", "unavailable"],
    },
    storageAvailable: { type: Boolean, required: true },
    currentSalePrice: { type: Number, min: 0, default: null },
    priceUnit: { type: String, trim: true, default: null },
    transportCost: { type: Number, required: true, min: 0 },
    storageCost: { type: Number, required: true, min: 0 },
    otherCost: { type: Number, required: true, min: 0 },
    grossSaleValue: { type: Number, default: null },
    totalEnteredCosts: { type: Number, required: true, min: 0 },
    estimatedNetReturn: { type: Number, default: null },
    economicsStatus: {
      type: String,
      required: true,
      enum: ["UNAVAILABLE", "MANUAL_CURRENT_SCENARIO"],
    },
    includesCultivationCost: { type: Boolean, required: true, default: false },
  },
  { _id: false }
);

const decisionSnapshotSchema = new mongoose.Schema(
  {
    farmer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    selectedCrop: { type: String, required: true, enum: SUPPORTED_CROPS },
    farmState: { type: String, required: true, enum: FARM_STATES },
    farmerContext: { type: farmerContextSchema, required: true },
    // Preserve the complete normalized values and provenance used at decision time.
    evidenceSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    candidateActions: { type: [candidateActionSchema], required: true },
    nextBestAction: { type: rankedActionSchema, required: true },
    alternatives: { type: [alternativeSchema], default: [] },
    reasons: { type: [String], required: true },
    constraints: { type: [String], default: [] },
    missingData: { type: [String], default: [] },
    assumptions: { type: [String], required: true },
    disclaimer: { type: String, required: true, trim: true },
    decisionVersion: { type: String, required: true, enum: ["decision-v1"] },
    generatedAt: { type: Date, required: true },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  }
);

decisionSnapshotSchema.index({ farmer: 1, createdAt: -1 });

module.exports =
  mongoose.models.DecisionSnapshot ||
  mongoose.model("DecisionSnapshot", decisionSnapshotSchema);
