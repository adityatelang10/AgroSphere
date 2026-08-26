const { body, query, validationResult } = require("express-validator");

const {
  FARM_STATES,
  QUANTITY_UNITS,
  WATER_AVAILABILITY,
} = require("../config/decisionEngineConfig");
const { normalizeCropName } = require("../services/decisionEngineService");
const {
  BASE_CONTEXT_FIELDS,
  SIMULATABLE_FIELDS,
  getCurrentSimulationContext,
  runWhatIfSimulation,
} = require("../services/whatIfSimulationService");

const ALLOWED_ROOT_FIELDS = new Set([
  "selectedCrop",
  "baseContext",
  "scenarioOverrides",
]);

const createUnexpectedFieldError = (field, value, location = "body") => ({
  type: "field",
  value,
  msg:
    field.includes("farmer")
      ? "Farmer identity comes from the authenticated session and cannot be overridden"
      : `Unsupported field: ${field}. Model evidence cannot be overridden in a what-if scenario.`,
  path: field,
  location,
});

const rejectUnsupportedSimulationFields = (req, res, next) => {
  const errors = [];
  Object.keys(req.body || {})
    .filter((field) => !ALLOWED_ROOT_FIELDS.has(field))
    .forEach((field) =>
      errors.push(createUnexpectedFieldError(field, req.body[field]))
    );
  Object.keys(req.body?.baseContext || {})
    .filter((field) => !BASE_CONTEXT_FIELDS.includes(field))
    .forEach((field) =>
      errors.push(
        createUnexpectedFieldError(
          `baseContext.${field}`,
          req.body.baseContext[field]
        )
      )
    );
  Object.keys(req.body?.scenarioOverrides || {})
    .filter((field) => !SIMULATABLE_FIELDS.includes(field))
    .forEach((field) =>
      errors.push(
        createUnexpectedFieldError(
          `scenarioOverrides.${field}`,
          req.body.scenarioOverrides[field]
        )
      )
    );

  if (errors.length) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }
  return next();
};

const finiteNumber = (path, label, minimum, optional = false) => {
  let validator = body(path);
  if (optional) {
    validator = validator.optional({ values: "undefined" });
  }
  return validator.custom((value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${label} must be a valid number`);
    }
    if (value < minimum) {
      throw new Error(`${label} must be at least ${minimum}`);
    }
    return true;
  });
};

const optionalScenarioPrice = (path) =>
  body(path).custom((value) => {
    if (typeof value === "undefined" || value === null) {
      return true;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error("Manual scenario price must be null or a number above zero");
    }
    return true;
  });

const strictBoolean = (path, label, optional = false) => {
  let validator = body(path);
  if (optional) {
    validator = validator.optional({ values: "undefined" });
  }
  return validator.custom((value) => {
    if (typeof value !== "boolean") {
      throw new Error(`${label} must be true or false`);
    }
    return true;
  });
};

const simulationContextValidation = [
  query("crop")
    .isString()
    .withMessage("Crop is required")
    .bail()
    .custom((value) => Boolean(normalizeCropName(value)))
    .withMessage("Crop is not supported by decision-v1"),
];

const whatIfSimulationValidation = [
  body("selectedCrop")
    .isString()
    .withMessage("Selected crop is required")
    .bail()
    .custom((value) => Boolean(normalizeCropName(value)))
    .withMessage("Crop is not supported by decision-v1"),
  body("baseContext").isObject().withMessage("Base context is required"),
  body("baseContext.farmState")
    .isIn(FARM_STATES)
    .withMessage(`Base farm state must be one of: ${FARM_STATES.join(", ")}`),
  finiteNumber("baseContext.availableQuantity", "Base quantity", 0),
  body("baseContext.quantityUnit")
    .isIn(QUANTITY_UNITS)
    .withMessage(`Quantity unit must be one of: ${QUANTITY_UNITS.join(", ")}`),
  body("baseContext.waterAvailability")
    .isIn(WATER_AVAILABILITY)
    .withMessage(
      `Base water availability must be one of: ${WATER_AVAILABILITY.join(", ")}`
    ),
  strictBoolean("baseContext.storageAvailable", "Base storage availability"),
  optionalScenarioPrice("baseContext.currentSalePrice"),
  finiteNumber("baseContext.transportCost", "Base transport cost", 0),
  finiteNumber("baseContext.storageCost", "Base storage cost", 0),
  finiteNumber("baseContext.otherCost", "Base other cost", 0),
  body("scenarioOverrides")
    .isObject()
    .withMessage("Scenario overrides must be an object")
    .bail()
    .custom((value) => Object.keys(value).length > 0)
    .withMessage("At least one scenario override is required"),
  body("scenarioOverrides.farmState")
    .optional({ values: "undefined" })
    .isIn(FARM_STATES)
    .withMessage(`Simulated farm state must be one of: ${FARM_STATES.join(", ")}`),
  finiteNumber(
    "scenarioOverrides.availableQuantity",
    "Simulated quantity",
    0,
    true
  ),
  body("scenarioOverrides.waterAvailability")
    .optional({ values: "undefined" })
    .isIn(WATER_AVAILABILITY)
    .withMessage(
      `Simulated water availability must be one of: ${WATER_AVAILABILITY.join(", ")}`
    ),
  strictBoolean(
    "scenarioOverrides.storageAvailable",
    "Simulated storage availability",
    true
  ),
  optionalScenarioPrice("scenarioOverrides.currentSalePrice"),
  finiteNumber(
    "scenarioOverrides.transportCost",
    "Simulated transport cost",
    0,
    true
  ),
  finiteNumber(
    "scenarioOverrides.storageCost",
    "Simulated storage cost",
    0,
    true
  ),
  finiteNumber("scenarioOverrides.otherCost", "Simulated other cost", 0, true),
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

const getWhatIfContext = async (req, res, next) => {
  if (sendValidationErrors(req, res)) {
    return;
  }
  try {
    const context = await getCurrentSimulationContext({
      farmerId: req.user._id,
      selectedCrop: req.query.crop,
    });
    return res.status(200).json({ success: true, ...context });
  } catch (error) {
    return next(error);
  }
};

const createWhatIfSimulation = async (req, res, next) => {
  if (sendValidationErrors(req, res)) {
    return;
  }
  try {
    const simulation = await runWhatIfSimulation({
      farmerId: req.user._id,
      selectedCrop: req.body.selectedCrop,
      baseContext: req.body.baseContext,
      scenarioOverrides: req.body.scenarioOverrides,
    });
    return res.status(200).json({ success: true, ...simulation });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    return next(error);
  }
};

module.exports = {
  createWhatIfSimulation,
  getWhatIfContext,
  rejectUnsupportedSimulationFields,
  simulationContextValidation,
  whatIfSimulationValidation,
};
