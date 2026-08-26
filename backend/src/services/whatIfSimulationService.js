const DecisionSnapshot = require("../models/DecisionSnapshot");
const {
  evaluateDecision,
  getEvidencePreview,
  normalizeCropName,
} = require("./decisionEngineService");

const SIMULATION_VERSION = "whatif-v1";
const SIMULATABLE_FIELDS = [
  "farmState",
  "availableQuantity",
  "waterAvailability",
  "storageAvailable",
  "currentSalePrice",
  "transportCost",
  "storageCost",
  "otherCost",
];
const BASE_CONTEXT_FIELDS = [
  "farmState",
  "availableQuantity",
  "quantityUnit",
  "waterAvailability",
  "storageAvailable",
  "currentSalePrice",
  "transportCost",
  "storageCost",
  "otherCost",
];
const FIELD_LABELS = {
  farmState: "Assumed farm state",
  availableQuantity: "Available quantity",
  waterAvailability: "Water availability",
  storageAvailable: "Storage availability",
  currentSalePrice: "Farmer-entered scenario price",
  transportCost: "Transport cost",
  storageCost: "Storage cost",
  otherCost: "Other entered cost",
};

const createSimulationError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const pickBaseContext = (context) =>
  BASE_CONTEXT_FIELDS.reduce((result, field) => {
    result[field] =
      field === "currentSalePrice" && typeof context[field] !== "number"
        ? null
        : context[field];
    return result;
  }, {});

const validateOverrideKeys = (scenarioOverrides) => {
  const unsupportedFields = Object.keys(scenarioOverrides).filter(
    (field) => !SIMULATABLE_FIELDS.includes(field)
  );

  if (unsupportedFields.length) {
    throw createSimulationError(
      `Unsupported scenario override(s): ${unsupportedFields.join(", ")}. Model evidence and farmer identity cannot be overridden.`
    );
  }
};

const validateLogicalContext = (context, label) => {
  if (
    ["harvest_ready", "harvested"].includes(context.farmState) &&
    context.availableQuantity <= 0
  ) {
    throw createSimulationError(
      `${label} harvest-ready or harvested produce must have a quantity above zero.`
    );
  }
};

const applyScenarioOverrides = (baseContext, scenarioOverrides) => {
  validateOverrideKeys(scenarioOverrides);
  const simulatedContext = {
    ...baseContext,
    ...scenarioOverrides,
  };
  validateLogicalContext(simulatedContext, "Simulated");
  return simulatedContext;
};

const compareContexts = (baseContext, simulatedContext, scenarioOverrides) =>
  Object.keys(scenarioOverrides)
    .filter((field) => !Object.is(baseContext[field], simulatedContext[field]))
    .map((field) => ({
      field,
      label: FIELD_LABELS[field],
      before: baseContext[field],
      after: simulatedContext[field],
      assumptionType: "FARMER_ENTERED_HYPOTHETICAL",
    }));

const findCandidate = (decision, code) =>
  decision.candidateActions.find((candidate) => candidate.code === code);

const getLargestFactorChange = (baseCandidate, simulatedCandidate) => {
  const baseFactors = new Map(
    (baseCandidate?.factors || []).map((factor) => [factor.factor, factor])
  );
  const simulatedFactors = new Map(
    (simulatedCandidate?.factors || []).map((factor) => [factor.factor, factor])
  );
  const factorNames = new Set([...baseFactors.keys(), ...simulatedFactors.keys()]);

  return [...factorNames]
    .map((factorName) => {
      const before = baseFactors.get(factorName);
      const after = simulatedFactors.get(factorName);
      return {
        change: Math.abs((after?.effect || 0) - (before?.effect || 0)),
        reason:
          after?.reason ||
          (before ? `The earlier factor no longer applies: ${before.reason}` : null),
      };
    })
    .sort((left, right) => right.change - left.change)[0];
};

const buildComparisonExplanation = ({ baseDecision, simulatedDecision }) => {
  const actionChanged =
    baseDecision.nextBestAction.code !== simulatedDecision.nextBestAction.code;
  const explanations = [
    actionChanged
      ? `The next best action changed from ${baseDecision.nextBestAction.title} to ${simulatedDecision.nextBestAction.title}.`
      : `The recommendation remained ${simulatedDecision.nextBestAction.title}.`,
  ];
  const focusCodes = [
    baseDecision.nextBestAction.code,
    simulatedDecision.nextBestAction.code,
    "HOLD_AND_MONITOR",
    "SELL_NOW",
    "ADDRESS_WATER_CONSTRAINT",
    "IRRIGATE_NOW",
  ];

  [...new Set(focusCodes)].forEach((code) => {
    if (explanations.length >= 5) {
      return;
    }
    const before = findCandidate(baseDecision, code);
    const after = findCandidate(simulatedDecision, code);
    if (!before || !after) {
      return;
    }

    if (before.status !== after.status) {
      const constraint = after.constraints[0] || after.factors[0]?.reason;
      explanations.push(
        `${after.title} changed from ${before.status} to ${after.status}${constraint ? `: ${constraint}` : "."}`
      );
      return;
    }

    if (
      before.status === "SCORED" &&
      after.status === "SCORED" &&
      before.score !== after.score
    ) {
      const factorChange = getLargestFactorChange(before, after);
      explanations.push(
        `${after.title} changed from ${before.score} to ${after.score} points${factorChange?.reason ? `: ${factorChange.reason}` : "."}`
      );
    }
  });

  if (explanations.length === 1) {
    explanations.push(
      actionChanged
        ? simulatedDecision.why[0]
        : `The changed assumption did not alter the factors controlling the top action: ${simulatedDecision.why[0]}`
    );
  }

  return explanations.slice(0, 5);
};

const removeRepeatedEvidence = (decision) => {
  const { evidence, ...scenarioDecision } = decision;
  return scenarioDecision;
};

const evaluateWhatIfComparison = ({
  selectedCrop,
  baseContext,
  scenarioOverrides,
  evidence,
  now = new Date(),
}) => {
  const normalizedCrop = normalizeCropName(selectedCrop);
  if (!normalizedCrop) {
    throw createSimulationError("Unsupported crop mapping.");
  }

  const normalizedBaseContext = {
    ...pickBaseContext(baseContext),
    selectedCrop: normalizedCrop,
  };
  validateLogicalContext(normalizedBaseContext, "Base");
  const simulatedContext = applyScenarioOverrides(
    normalizedBaseContext,
    scenarioOverrides
  );
  const changes = compareContexts(
    normalizedBaseContext,
    simulatedContext,
    scenarioOverrides
  );

  if (!changes.length) {
    throw createSimulationError(
      "At least one what-if value must differ from the current scenario."
    );
  }

  const baseDecision = evaluateDecision({
    input: normalizedBaseContext,
    evidence,
    now,
  });
  const simulatedDecision = evaluateDecision({
    input: simulatedContext,
    evidence,
    now,
  });
  const decisionChanged =
    baseDecision.nextBestAction.code !== simulatedDecision.nextBestAction.code;

  return {
    decisionVersion: baseDecision.decisionVersion,
    simulationVersion: SIMULATION_VERSION,
    selectedCrop: normalizedCrop,
    selectedCropLabel: baseDecision.selectedCropLabel,
    generatedAt: now.toISOString(),
    isHypothetical: true,
    persisted: false,
    baseScenario: removeRepeatedEvidence(baseDecision),
    simulatedScenario: removeRepeatedEvidence(simulatedDecision),
    evidence,
    changes,
    decisionChanged,
    priorityScoreChanged:
      baseDecision.nextBestAction.score !== simulatedDecision.nextBestAction.score,
    explanation: buildComparisonExplanation({
      baseDecision,
      simulatedDecision,
    }),
    disclaimer:
      "This is deterministic scenario analysis using farmer-entered assumptions and unchanged stored evidence. It is not a future prediction, profit guarantee, or replacement for current field observations and local expertise.",
  };
};

const runWhatIfSimulation = async ({
  farmerId,
  selectedCrop,
  baseContext,
  scenarioOverrides,
  now = new Date(),
}) => {
  const preview = await getEvidencePreview({
    farmerId,
    selectedCrop,
    now,
  });

  return evaluateWhatIfComparison({
    selectedCrop: preview.selectedCrop,
    baseContext,
    scenarioOverrides,
    evidence: preview.evidence,
    now,
  });
};

const getCurrentSimulationContext = async ({
  farmerId,
  selectedCrop,
  now = new Date(),
}) => {
  const normalizedCrop = normalizeCropName(selectedCrop);
  if (!normalizedCrop) {
    throw createSimulationError("Unsupported crop mapping.");
  }
  const [snapshot, preview] = await Promise.all([
    DecisionSnapshot.findOne({
      farmer: farmerId,
      selectedCrop: normalizedCrop,
    })
      .sort({ createdAt: -1 })
      .lean(),
    getEvidencePreview({
      farmerId,
      selectedCrop: normalizedCrop,
      now,
    }),
  ]);

  if (!snapshot) {
    return {
      simulationVersion: SIMULATION_VERSION,
      decisionVersion: preview.decisionVersion,
      selectedCrop: normalizedCrop,
      selectedCropLabel: preview.selectedCropLabel,
      supportedCrops: preview.supportedCrops,
      hasBaseScenario: false,
      sourceDecisionId: null,
      sourceDecisionCreatedAt: null,
      baseContext: null,
      baseDecision: null,
      evidence: preview.evidence,
    };
  }

  const baseContext = pickBaseContext(snapshot.farmerContext);
  const baseDecision = evaluateDecision({
    input: {
      ...baseContext,
      selectedCrop: normalizedCrop,
    },
    evidence: preview.evidence,
    now,
  });

  return {
    simulationVersion: SIMULATION_VERSION,
    decisionVersion: baseDecision.decisionVersion,
    selectedCrop: normalizedCrop,
    selectedCropLabel: preview.selectedCropLabel,
    supportedCrops: preview.supportedCrops,
    hasBaseScenario: true,
    sourceDecisionId: String(snapshot._id),
    sourceDecisionCreatedAt: snapshot.createdAt,
    baseContext,
    baseDecision: removeRepeatedEvidence(baseDecision),
    evidence: preview.evidence,
  };
};

module.exports = {
  BASE_CONTEXT_FIELDS,
  SIMULATABLE_FIELDS,
  SIMULATION_VERSION,
  applyScenarioOverrides,
  evaluateWhatIfComparison,
  getCurrentSimulationContext,
  runWhatIfSimulation,
};
