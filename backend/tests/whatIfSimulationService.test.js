const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyScenarioOverrides,
  evaluateWhatIfComparison,
} = require("../src/services/whatIfSimulationService");

const FIXED_NOW = new Date("2026-08-25T12:00:00.000Z");

const missing = (sourceType) => ({
  status: "MISSING",
  sourceType,
  sourceId: null,
  crop: null,
  createdAt: null,
  ageHours: null,
  freshness: "MISSING",
  usedInScoring: false,
  usageNote: `${sourceType} unavailable`,
  data: null,
});

const healthyDisease = {
  status: "AVAILABLE",
  sourceType: "DiseaseScan",
  sourceId: "disease-1",
  crop: "tomato",
  createdAt: "2026-08-25T10:00:00.000Z",
  ageHours: 2,
  freshness: "FRESH",
  usedInScoring: true,
  usageNote: "Confidence is classification strength, not severity.",
  data: {
    condition: "Healthy",
    predictedClass: "Tomato___healthy",
    isHealthy: true,
    confidence: 0.9,
    supportedClass: true,
    modelVersion: "disease-v1",
  },
};

const urgentIrrigation = {
  status: "AVAILABLE",
  sourceType: "IrrigationRecord",
  sourceId: "irrigation-1",
  crop: "tomato",
  createdAt: "2026-08-25T11:00:00.000Z",
  ageHours: 1,
  freshness: "FRESH",
  usedInScoring: true,
  usageNote: "Current stored irrigation evidence.",
  data: {
    growthStage: "mid_season",
    irrigationRequired: true,
    decisionCode: "irrigate_today",
    recommendedTiming: "Irrigate today",
    waterStress: "High",
    soilMoistureStatus: "Low",
    estimatedIrrigationNeed: 12,
    effectiveForecastRainfall: 0,
    engineVersion: "irrigation-v1",
  },
};

const staleMarket = {
  status: "AVAILABLE",
  sourceType: "MarketAnalysis",
  sourceId: "market-1",
  crop: "tomato",
  createdAt: "2026-08-25T11:30:00.000Z",
  ageHours: 0.5,
  freshness: "HISTORICAL_STALE",
  usedInScoring: false,
  usageNote: "Historical context only.",
  data: {
    trend: "Rising",
    percentageChange: 12,
    referencePrice: {
      observedDate: "2021-06-30T00:00:00.000Z",
      minimumPrice: 1000,
      modalPrice: 1500,
      maximumPrice: 2000,
      unit: "INR/quintal",
    },
    historicalDateThrough: "2021-06-30T00:00:00.000Z",
    manualScenario: {
      quantityQuintals: 1,
      expectedSalePrice: 1800,
      estimatedNetReturn: 1500,
    },
    freshnessStatus: "STALE_HISTORICAL",
    forecastAvailable: false,
    analysisVersion: "market-v1",
    currentSignalAllowed: false,
  },
};

const buildEvidence = ({ disease, irrigation, market } = {}) => ({
  cropRecommendation: missing("CropRecommendation"),
  disease: disease || missing("DiseaseScan"),
  irrigation: irrigation || missing("IrrigationRecord"),
  market: market || missing("MarketAnalysis"),
  inventory: {
    status: "MISSING",
    sourceType: "CropInventory",
    sourceId: "profile-1",
    crop: "tomato",
    createdAt: null,
    ageHours: null,
    freshness: "CURRENT_DATABASE",
    usedInScoring: false,
    usageNote: "No matching inventory record.",
    data: {
      farmerProfileFound: true,
      matchingListingCount: 0,
      listings: [],
    },
  },
});

const growingContext = {
  farmState: "growing",
  availableQuantity: 0,
  quantityUnit: "kg",
  waterAvailability: "adequate",
  storageAvailable: false,
  currentSalePrice: null,
  transportCost: 0,
  storageCost: 0,
  otherCost: 0,
};

const harvestedContext = {
  farmState: "harvested",
  availableQuantity: 100,
  quantityUnit: "kg",
  waterAvailability: "adequate",
  storageAvailable: true,
  currentSalePrice: 40,
  transportCost: 0,
  storageCost: 100,
  otherCost: 0,
};

const compare = ({ baseContext, scenarioOverrides, evidence }) =>
  evaluateWhatIfComparison({
    selectedCrop: "tomato",
    baseContext,
    scenarioOverrides,
    evidence,
    now: FIXED_NOW,
  });

test("scenario 1: unavailable water changes IRRIGATE_NOW to ADDRESS_WATER_CONSTRAINT", () => {
  const result = compare({
    baseContext: growingContext,
    scenarioOverrides: { waterAvailability: "unavailable" },
    evidence: buildEvidence({
      disease: healthyDisease,
      irrigation: urgentIrrigation,
    }),
  });

  assert.equal(result.baseScenario.nextBestAction.code, "IRRIGATE_NOW");
  assert.equal(
    result.simulatedScenario.nextBestAction.code,
    "ADDRESS_WATER_CONSTRAINT"
  );
  assert.equal(result.decisionChanged, true);
  assert.match(result.explanation.join(" "), /blocked|unavailable|infeasible/i);
});

test("scenario 2: unavailable storage blocks hold and raises sale priority", () => {
  const result = compare({
    baseContext: harvestedContext,
    scenarioOverrides: { storageAvailable: false },
    evidence: buildEvidence({ market: staleMarket }),
  });
  const baseSell = result.baseScenario.candidateActions.find(
    (candidate) => candidate.code === "SELL_NOW"
  );
  const simulatedSell = result.simulatedScenario.candidateActions.find(
    (candidate) => candidate.code === "SELL_NOW"
  );
  const simulatedHold = result.simulatedScenario.candidateActions.find(
    (candidate) => candidate.code === "HOLD_AND_MONITOR"
  );

  assert.equal(result.baseScenario.nextBestAction.code, "LIST_FOR_SALE");
  assert.equal(result.simulatedScenario.nextBestAction.code, "SELL_NOW");
  assert.equal(simulatedHold.status, "BLOCKED");
  assert.ok(simulatedSell.score > baseSell.score);
});

test("scenario 3: high storage cost lowers HOLD_AND_MONITOR without forcing a new winner", () => {
  const result = compare({
    baseContext: harvestedContext,
    scenarioOverrides: { storageCost: 800 },
    evidence: buildEvidence({ market: staleMarket }),
  });
  const baseHold = result.baseScenario.candidateActions.find(
    (candidate) => candidate.code === "HOLD_AND_MONITOR"
  );
  const simulatedHold = result.simulatedScenario.candidateActions.find(
    (candidate) => candidate.code === "HOLD_AND_MONITOR"
  );

  assert.equal(baseHold.score, 55);
  assert.equal(simulatedHold.score, 30);
  assert.equal(result.decisionChanged, false);
});

test("scenario 4: manual scenario price recalculates gross value and net return", () => {
  const baseContext = {
    ...harvestedContext,
    currentSalePrice: 2,
    transportCost: 300,
    storageCost: 0,
  };
  const result = compare({
    baseContext,
    scenarioOverrides: { currentSalePrice: 5 },
    evidence: buildEvidence(),
  });
  const baseSell = result.baseScenario.candidateActions.find(
    (candidate) => candidate.code === "SELL_NOW"
  );
  const simulatedSell = result.simulatedScenario.candidateActions.find(
    (candidate) => candidate.code === "SELL_NOW"
  );

  assert.equal(result.baseScenario.farmerContext.grossSaleValue, 200);
  assert.equal(result.baseScenario.farmerContext.estimatedNetReturn, -100);
  assert.equal(result.simulatedScenario.farmerContext.grossSaleValue, 500);
  assert.equal(result.simulatedScenario.farmerContext.estimatedNetReturn, 200);
  assert.ok(simulatedSell.score > baseSell.score);
  assert.equal(result.changes[0].assumptionType, "FARMER_ENTERED_HYPOTHETICAL");
});

test("scenario 5: irrelevant storage-cost change does not manufacture a new action", () => {
  const result = compare({
    baseContext: growingContext,
    scenarioOverrides: { storageCost: 500 },
    evidence: buildEvidence({
      disease: healthyDisease,
      irrigation: urgentIrrigation,
    }),
  });

  assert.equal(result.baseScenario.nextBestAction.code, "IRRIGATE_NOW");
  assert.equal(result.simulatedScenario.nextBestAction.code, "IRRIGATE_NOW");
  assert.equal(result.decisionChanged, false);
  assert.equal(result.priorityScoreChanged, false);
  assert.match(result.explanation[0], /remained/i);
});

test("model evidence and unsupported fields cannot be applied as overrides", () => {
  assert.throws(
    () =>
      applyScenarioOverrides(growingContext, {
        disease: { isHealthy: false },
      }),
    /Model evidence.*cannot be overridden/i
  );
  assert.throws(
    () => applyScenarioOverrides(growingContext, { farmerId: "another-user" }),
    /farmer identity cannot be overridden/i
  );
});

test("the same unchanged evidence object is used and stale market remains zero points", () => {
  const evidence = buildEvidence({ market: staleMarket });
  const before = structuredClone(evidence);
  const result = compare({
    baseContext: harvestedContext,
    scenarioOverrides: { storageCost: 800 },
    evidence,
  });
  const simulatedHold = result.simulatedScenario.candidateActions.find(
    (candidate) => candidate.code === "HOLD_AND_MONITOR"
  );
  const historicalFactor = simulatedHold.factors.find(
    (factor) => factor.factor === "historicalMarketTrend"
  );

  assert.deepEqual(evidence, before);
  assert.equal(result.evidence.market.usedInScoring, false);
  assert.equal(historicalFactor.effect, 0);
});

test("what-if comparison is deterministic for identical input, evidence, and time", () => {
  const options = {
    baseContext: growingContext,
    scenarioOverrides: { waterAvailability: "unavailable" },
    evidence: buildEvidence({
      disease: healthyDisease,
      irrigation: urgentIrrigation,
    }),
  };

  assert.deepEqual(compare(options), compare(options));
});

test("an override must differ from the base scenario", () => {
  assert.throws(
    () =>
      compare({
        baseContext: growingContext,
        scenarioOverrides: { storageAvailable: false },
        evidence: buildEvidence(),
      }),
    /must differ/i
  );
});
