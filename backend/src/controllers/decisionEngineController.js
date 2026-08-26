const { body, query, validationResult } = require("express-validator");

const {
  FARM_STATES,
  QUANTITY_UNITS,
  WATER_AVAILABILITY,
} = require("../config/decisionEngineConfig");
const DecisionSnapshot = require("../models/DecisionSnapshot");
const {
  generateDecision,
  getEvidencePreview,
  getSupportedCrops,
  normalizeCropName,
} = require("../services/decisionEngineService");

const ALLOWED_BODY_FIELDS = new Set([
  "selectedCrop",
  "farmState",
  "availableQuantity",
  "quantityUnit",
  "waterAvailability",
  "storageAvailable",
  "currentSalePrice",
  "transportCost",
  "storageCost",
  "otherCost",
]);

const rejectUnexpectedDecisionFields = (req, res, next) => {
  const unexpectedFields = Object.keys(req.body || {}).filter(
    (field) => !ALLOWED_BODY_FIELDS.has(field)
  );

  if (unexpectedFields.length) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: unexpectedFields.map((field) => ({
        type: "field",
        value: req.body[field],
        msg:
          field === "farmer" || field === "farmerId"
            ? "Farmer identity comes from the authenticated session and must not be submitted"
            : `Unexpected field: ${field}`,
        path: field,
        location: "body",
      })),
    });
  }

  return next();
};

const numericRule = (field, label, minimum, maximum, optional = false) => {
  let rule = body(field);
  if (optional) {
    rule = rule.optional({ values: "null" });
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

const supportedCropMessage = () =>
  `Crop must match one of: ${getSupportedCrops()
    .map((crop) => crop.label)
    .join(", ")}`;

const decisionEvidenceValidation = [
  query("crop")
    .isString()
    .withMessage("Crop is required")
    .bail()
    .custom((value) => Boolean(normalizeCropName(value)))
    .withMessage(supportedCropMessage()),
];

const decisionEngineValidation = [
  body("selectedCrop")
    .isString()
    .withMessage("Current crop is required")
    .bail()
    .custom((value) => Boolean(normalizeCropName(value)))
    .withMessage(supportedCropMessage()),
  body("farmState")
    .isString()
    .withMessage("Farm state is required")
    .bail()
    .isIn(FARM_STATES)
    .withMessage(`Farm state must be one of: ${FARM_STATES.join(", ")}`),
  numericRule("availableQuantity", "Available quantity", 0, 1_000_000),
  body("availableQuantity").custom((value, { req }) => {
    if (["harvest_ready", "harvested"].includes(req.body.farmState) && value <= 0) {
      throw new Error("Harvest-ready or harvested produce must have a quantity above zero");
    }
    return true;
  }),
  body("quantityUnit")
    .isString()
    .withMessage("Quantity unit is required")
    .bail()
    .isIn(QUANTITY_UNITS)
    .withMessage(`Quantity unit must be one of: ${QUANTITY_UNITS.join(", ")}`),
  body("waterAvailability")
    .isString()
    .withMessage("Water availability is required")
    .bail()
    .isIn(WATER_AVAILABILITY)
    .withMessage(
      `Water availability must be one of: ${WATER_AVAILABILITY.join(", ")}`
    ),
  body("storageAvailable").custom((value) => {
    if (typeof value !== "boolean") {
      throw new Error("Storage availability must be true or false");
    }
    return true;
  }),
  numericRule("currentSalePrice", "Current sale price", Number.EPSILON, 100_000_000, true),
  numericRule("transportCost", "Transport cost", 0, 100_000_000, true),
  numericRule("storageCost", "Storage cost", 0, 100_000_000, true),
  numericRule("otherCost", "Other cost", 0, 100_000_000, true),
];

const sendValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return false;
  }

  res.status(400).json({
    success: false,
    message: "Validation failed",
    errors: errors.array(),
  });
  return true;
};

const getDecisionEvidence = async (req, res, next) => {
  if (sendValidationErrors(req, res)) {
    return;
  }

  try {
    const preview = await getEvidencePreview({
      farmerId: req.user._id,
      selectedCrop: req.query.crop,
    });

    return res.status(200).json({
      success: true,
      ...preview,
    });
  } catch (error) {
    return next(error);
  }
};

const createDecision = async (req, res, next) => {
  if (sendValidationErrors(req, res)) {
    return;
  }

  const input = {
    selectedCrop: req.body.selectedCrop,
    farmState: req.body.farmState,
    availableQuantity: req.body.availableQuantity,
    quantityUnit: req.body.quantityUnit,
    waterAvailability: req.body.waterAvailability,
    storageAvailable: req.body.storageAvailable,
    currentSalePrice: req.body.currentSalePrice ?? null,
    transportCost: req.body.transportCost ?? 0,
    storageCost: req.body.storageCost ?? 0,
    otherCost: req.body.otherCost ?? 0,
  };

  try {
    const decision = await generateDecision({
      farmerId: req.user._id,
      input,
    });
    const snapshot = await DecisionSnapshot.create({
      farmer: req.user._id,
      selectedCrop: decision.selectedCrop,
      farmState: decision.farmState,
      farmerContext: decision.farmerContext,
      evidenceSnapshot: decision.evidence,
      candidateActions: decision.candidateActions,
      nextBestAction: decision.nextBestAction,
      alternatives: decision.alternatives,
      reasons: decision.why,
      constraints: decision.constraints,
      missingData: decision.missingData,
      assumptions: decision.assumptions,
      disclaimer: decision.disclaimer,
      decisionVersion: decision.decisionVersion,
      generatedAt: decision.generatedAt,
    });

    return res.status(200).json({
      success: true,
      decisionId: snapshot._id,
      ...decision,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createDecision,
  decisionEngineValidation,
  decisionEvidenceValidation,
  getDecisionEvidence,
  rejectUnexpectedDecisionFields,
};
