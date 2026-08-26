const mongoose = require("mongoose");

const SUPPORTED_CROPS = ["tomato", "maize", "groundnut"];
const SUPPORTED_MARKETS = [
  "tomato-pune-local",
  "maize-pune-deshi-red",
  "groundnut-laxmeshwar-balli-habbu",
];

const marketInputsSchema = new mongoose.Schema(
  {
    crop: { type: String, required: true, enum: SUPPORTED_CROPS },
    marketKey: { type: String, required: true, enum: SUPPORTED_MARKETS },
    quantityQuintals: { type: Number, required: true, min: 0 },
    expectedSalePrice: { type: Number, required: true, min: 0 },
    transportCost: { type: Number, required: true, min: 0 },
    storageCost: { type: Number, required: true, min: 0 },
    otherCost: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const marketSelectionSchema = new mongoose.Schema(
  {
    commodity: { type: String, required: true, trim: true },
    market: { type: String, required: true, trim: true },
    district: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    variety: { type: String, required: true, trim: true },
    unit: { type: String, required: true, enum: ["INR/quintal"] },
  },
  { _id: false }
);

const referencePriceSchema = new mongoose.Schema(
  {
    observedDate: { type: Date, required: true },
    minimumPrice: { type: Number, required: true, min: 0 },
    maximumPrice: { type: Number, required: true, min: 0 },
    modalPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const historicalSummarySchema = new mongoose.Schema(
  {
    observationCount: { type: Number, required: true, min: 1 },
    dateFrom: { type: Date, required: true },
    dateThrough: { type: Date, required: true },
  },
  { _id: false }
);

const trendSchema = new mongoose.Schema(
  {
    direction: {
      type: String,
      required: true,
      enum: ["Rising", "Stable", "Falling"],
    },
    percentageChange: { type: Number, required: true },
    previousAverage: { type: Number, required: true, min: 0 },
    recentAverage: { type: Number, required: true, min: 0 },
    observationsPerWindow: { type: Number, required: true, min: 1 },
    rule: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const profitAnalysisSchema = new mongoose.Schema(
  {
    status: { type: String, required: true, enum: ["MANUAL_SCENARIO"] },
    grossSaleValue: { type: Number, required: true },
    totalEnteredCosts: { type: Number, required: true, min: 0 },
    estimatedNetReturn: { type: Number, required: true },
    includesCultivationCost: { type: Boolean, required: true, default: false },
  },
  { _id: false }
);

const dataProvenanceSchema = new mongoose.Schema(
  {
    status: { type: String, required: true, enum: ["HISTORICAL"] },
    freshnessStatus: {
      type: String,
      required: true,
      enum: ["STALE_HISTORICAL"],
    },
    dataAgeDays: { type: Number, required: true, min: 0 },
    source: { type: String, required: true, trim: true },
    sourceType: { type: String, required: true, trim: true },
    officialCatalogUrl: { type: String, required: true, trim: true },
    publicArchiveUrl: { type: String, required: true, trim: true },
    archiveRetrievedOn: { type: Date, required: true },
    priceType: { type: String, required: true, enum: ["Modal price"] },
    unit: { type: String, required: true, enum: ["INR/quintal"] },
  },
  { _id: false }
);

const marketAnalysisSchema = new mongoose.Schema(
  {
    farmer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    inputs: { type: marketInputsSchema, required: true },
    selection: { type: marketSelectionSchema, required: true },
    referencePrice: { type: referencePriceSchema, required: true },
    historicalSummary: { type: historicalSummarySchema, required: true },
    trend: { type: trendSchema, required: true },
    forecastAvailable: { type: Boolean, required: true, default: false },
    profitAnalysis: { type: profitAnalysisSchema, required: true },
    dataProvenance: { type: dataProvenanceSchema, required: true },
    analysisVersion: { type: String, required: true, enum: ["market-v1"] },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  }
);

marketAnalysisSchema.index({ farmer: 1, createdAt: -1 });

module.exports =
  mongoose.models.MarketAnalysis ||
  mongoose.model("MarketAnalysis", marketAnalysisSchema);
