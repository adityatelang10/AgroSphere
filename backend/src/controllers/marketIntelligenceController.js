const { body, validationResult } = require("express-validator");

const MarketAnalysis = require("../models/MarketAnalysis");
const { getMarketIntelligence } = require("../services/mlServiceClient");

const SUPPORTED_SELECTIONS = {
  "tomato-pune-local": "tomato",
  "maize-pune-deshi-red": "maize",
  "groundnut-laxmeshwar-balli-habbu": "groundnut",
};
const SUPPORTED_CROPS = [...new Set(Object.values(SUPPORTED_SELECTIONS))];

const numericRule = (field, label, minimum, maximum, optional = false) => {
  let rule = body(field);
  if (optional) {
    rule = rule.optional();
  }

  return rule.custom((value) => {
    if (typeof value === "undefined" || value === null) {
      throw new Error(`${label} is required`);
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${label} must be a valid number`);
    }

    if (value < minimum || value > maximum) {
      throw new Error(`${label} must be between ${minimum} and ${maximum}`);
    }

    return true;
  });
};

const marketIntelligenceValidation = [
  body("crop")
    .isString()
    .withMessage("Crop is required")
    .bail()
    .isIn(SUPPORTED_CROPS)
    .withMessage(`Crop must be one of: ${SUPPORTED_CROPS.join(", ")}`),
  body("marketKey")
    .isString()
    .withMessage("Market is required")
    .bail()
    .custom((marketKey, { req }) => {
      const supportedCrop = SUPPORTED_SELECTIONS[marketKey];
      if (!supportedCrop) {
        throw new Error("The selected market is not supported by market-v1");
      }
      if (supportedCrop !== req.body.crop) {
        throw new Error("The selected market does not support this crop");
      }
      return true;
    }),
  numericRule("quantityQuintals", "Quantity", Number.EPSILON, 1_000_000),
  numericRule(
    "expectedSalePrice",
    "Expected sale price",
    Number.EPSILON,
    100_000_000
  ),
  numericRule("transportCost", "Transport cost", 0, 100_000_000, true),
  numericRule("storageCost", "Storage cost", 0, 100_000_000, true),
  numericRule("otherCost", "Other cost", 0, 100_000_000, true),
];

const createMarketIntelligence = async (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }

  const inputs = {
    crop: req.body.crop,
    marketKey: req.body.marketKey,
    quantityQuintals: req.body.quantityQuintals,
    expectedSalePrice: req.body.expectedSalePrice,
    transportCost: req.body.transportCost ?? 0,
    storageCost: req.body.storageCost ?? 0,
    otherCost: req.body.otherCost ?? 0,
  };

  try {
    const analysis = await getMarketIntelligence(inputs);
    const record = await MarketAnalysis.create({
      farmer: req.user._id,
      inputs,
      selection: {
        commodity: analysis.selection.commodity,
        market: analysis.selection.market,
        district: analysis.selection.district,
        state: analysis.selection.state,
        variety: analysis.selection.variety,
        unit: analysis.selection.unit,
      },
      referencePrice: analysis.referencePrice,
      historicalSummary: {
        observationCount: analysis.historicalSummary.observationCount,
        dateFrom: analysis.historicalSummary.dateFrom,
        dateThrough: analysis.historicalSummary.dateThrough,
      },
      trend: analysis.trend,
      forecastAvailable: analysis.forecast.available,
      profitAnalysis: {
        status: analysis.profitAnalysis.status,
        grossSaleValue: analysis.profitAnalysis.grossSaleValue,
        totalEnteredCosts: analysis.profitAnalysis.totalEnteredCosts,
        estimatedNetReturn: analysis.profitAnalysis.estimatedNetReturn,
        includesCultivationCost: analysis.profitAnalysis.includesCultivationCost,
      },
      dataProvenance: analysis.dataProvenance,
      analysisVersion: analysis.analysisVersion,
    });

    return res.status(200).json({
      success: true,
      analysisId: record._id,
      ...analysis,
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
  createMarketIntelligence,
  marketIntelligenceValidation,
};
