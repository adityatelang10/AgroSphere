const assert = require("node:assert/strict");
const test = require("node:test");

const {
  classifyRecency,
  evaluateDecision,
  getEvidencePreview,
  getIrrigationRecency,
  normalizeCropName,
} = require("../src/services/decisionEngineService");
const { evaluateWhatIfComparison } = require("../src/services/whatIfSimulationService");
const IrrigationRecord = require("../src/models/IrrigationRecord");
const CropRecommendation = require("../src/models/CropRecommendation");
const DiseaseScan = require("../src/models/DiseaseScan");
const MarketAnalysis = require("../src/models/MarketAnalysis");
const FarmerProfile = require("../src/models/FarmerProfile");

const FIXED_NOW = new Date("2026-08-25T12:00:00.000Z");

const missing = (sourceType, note = `${sourceType} unavailable`) => ({
  status: "MISSING",
  sourceType,
  sourceId: null,
  crop: null,
  createdAt: null,
  ageHours: null,
  freshness: "MISSING",
  usedInScoring: false,
  usageNote: note,
  data: null,
});

const diseaseEvidence = ({ healthy = true, confidence = 0.9 } = {}) => ({
  status: "AVAILABLE",
  sourceType: "DiseaseScan",
  sourceId: "disease-1",
  crop: "tomato",
  createdAt: "2026-08-25T10:00:00.000Z",
  ageHours: 2,
  freshness: "FRESH",
  usedInScoring: true,
  usageNote: "Classification confidence is evidence strength, not severity.",
  data: {
    condition: healthy ? "Healthy" : "Early Blight",
    predictedClass: healthy ? "Tomato___healthy" : "Tomato___Early_blight",
    isHealthy: healthy,
    confidence,
    supportedClass: true,
    modelVersion: "disease-v1",
  },
});

const irrigationEvidence = ({
  required = false,
  code = "no_irrigation",
  stress = "Low",
  stage = "mid_season",
} = {}) => ({
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
    growthStage: stage,
    irrigationRequired: required,
    decisionCode: code,
    recommendedTiming: required ? "Irrigate today" : "No irrigation required",
    waterStress: stress,
    soilMoistureStatus: stress === "High" ? "Low" : "Adequate",
    estimatedIrrigationNeed: required ? 12 : 0,
    effectiveForecastRainfall: 0,
    engineVersion: "irrigation-v1",
  },
});

const marketEvidence = (trend = "Rising") => ({
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
    trend,
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
});

const inventoryEvidence = (matchingListingCount = 0) => ({
  status: matchingListingCount ? "AVAILABLE" : "MISSING",
  sourceType: "CropInventory",
  sourceId: "profile-1",
  crop: "tomato",
  createdAt: null,
  ageHours: null,
  freshness: "CURRENT_DATABASE",
  usedInScoring: matchingListingCount > 0,
  usageNote: "Inventory context only; active listing status is not available.",
  data: {
    farmerProfileFound: true,
    matchingListingCount,
    listings: [],
  },
});

const buildEvidence = ({ disease, irrigation, market, inventory } = {}) => ({
  cropRecommendation: missing("CropRecommendation"),
  disease: disease || missing("DiseaseScan"),
  irrigation: irrigation || missing("IrrigationRecord"),
  market: market || missing("MarketAnalysis"),
  inventory: inventory || inventoryEvidence(),
});

const buildInput = (overrides = {}) => ({
  selectedCrop: "tomato",
  farmState: "growing",
  availableQuantity: 0,
  quantityUnit: "kg",
  waterAvailability: "adequate",
  storageAvailable: false,
  currentSalePrice: null,
  transportCost: 0,
  storageCost: 0,
  otherCost: 0,
  ...overrides,
});

const decide = (input, evidence) =>
  evaluateDecision({ input, evidence, now: FIXED_NOW });

const previewIrrigation = async (t, observationDate) => {
  const record = {
    _id: "irrigation-1",
    inputs: { crop: "tomato", growthStage: "mid_season", observationDate },
    result: {
      irrigationRequired: true,
      decisionCode: "irrigate_today",
      waterStress: "High",
    },
    createdAt: FIXED_NOW,
    engineVersion: "irrigation-v1",
  };
  for (const model of [CropRecommendation, DiseaseScan, IrrigationRecord, MarketAnalysis, FarmerProfile]) {
    t.mock.method(model, "findOne", () => ({
      sort() { return this; },
      async lean() { return model === IrrigationRecord ? record : null; },
    }));
  }
  return getEvidencePreview({ farmerId: "synthetic-farmer", selectedCrop: "tomato", now: FIXED_NOW });
};

for (const [label, observationDate, freshness, ageHours, timestampSource] of [
  ["current observation", FIXED_NOW, "FRESH", 0, "inputs.observationDate"],
  ["48-hour observation saved now", "2026-08-23T12:00:00.000Z", "OLDER", 48, "inputs.observationDate"],
  ["96-hour observation saved now", "2026-08-21T12:00:00.000Z", "STALE", 96, "inputs.observationDate"],
  ["legacy missing observation", undefined, "FRESH", 0, "createdAt"],
  ["legacy null observation", null, "FRESH", 0, "createdAt"],
  ["future observation", "2026-08-26", "STALE", null, "inputs.observationDate"],
  ["invalid present observation", "", "STALE", null, "inputs.observationDate"],
]) {
  test("irrigation freshness: " + label, async (t) => {
    const { evidence } = await previewIrrigation(t, observationDate);
    const item = evidence.irrigation;
    assert.equal(item.createdAt, FIXED_NOW.toISOString());
    assert.equal(item.freshness, freshness);
    assert.equal(item.ageHours, ageHours);
    assert.equal(item.timestampSource, timestampSource);
    assert.equal(item.usedInScoring, freshness !== "STALE");
    assert.doesNotThrow(() => JSON.stringify(evidence));
  });
}

test("date-only irrigation input and its Mongo Date use UTC midnight across timezones", () => {
  const originalTz = process.env.TZ;
  try {
    for (const timezone of ["UTC", "Asia/Kolkata", "America/Los_Angeles"]) {
      process.env.TZ = timezone;
      for (const value of ["2026-08-23", new Date("2026-08-23T00:00:00.000Z")]) {
        const recency = getIrrigationRecency({ inputs: { observationDate: value }, createdAt: FIXED_NOW }, FIXED_NOW);
        assert.equal(recency.evidenceAt, "2026-08-23T00:00:00.000Z");
        assert.equal(recency.ageHours, 60);
        assert.equal(recency.freshness, "OLDER");
      }
    }
  } finally {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  }
});

test("configured freshness boundaries remain inclusive and unchanged", () => {
  for (const [type, freshHours, olderHours] of [
    ["disease", 24, 168],
    ["irrigation", 24, 72],
    ["cropRecommendation", 720, 2160],
  ]) {
    for (const [ageMs, expected] of [
      [freshHours * 3_600_000, "FRESH"],
      [freshHours * 3_600_000 + 1, "OLDER"],
      [olderHours * 3_600_000, "OLDER"],
      [olderHours * 3_600_000 + 1, "STALE"],
    ]) {
      assert.equal(classifyRecency(new Date(FIXED_NOW.getTime() - ageMs), type, FIXED_NOW).freshness, expected);
    }
  }
});

test("observation freshness controls irrigation score without changing usable factor arithmetic", async (t) => {
  for (const [observationDate, expectedScore, status] of [
    [FIXED_NOW, 100, "SCORED"],
    ["2026-08-23T12:00:00.000Z", 94, "SCORED"],
    ["2026-08-21T12:00:00.000Z", null, "INSUFFICIENT_EVIDENCE"],
  ]) {
    const { evidence } = await previewIrrigation(t, observationDate);
    const result = decide(buildInput(), evidence);
    const candidate = result.candidateActions.find((item) => item.code === "IRRIGATE_NOW");
    assert.equal(candidate.status, status);
    assert.equal(candidate.score, expectedScore);
    if (expectedScore !== null) {
      assert.equal(result.nextBestAction.code, "IRRIGATE_NOW");
      assert.equal(candidate.factors.reduce((sum, factor) => sum + factor.effect, 0), expectedScore);
    } else {
      assert.notEqual(result.nextBestAction.code, "IRRIGATE_NOW");
      assert.ok(result.missingData.some((item) => /irrigation.*stale/i.test(item)));
    }
  }
});

test("What-If shared preview excludes stale observations in both comparisons", async (t) => {
  const { evidence } = await previewIrrigation(t, "2026-08-01");
  const comparison = evaluateWhatIfComparison({
    selectedCrop: "tomato",
    baseContext: buildInput(),
    scenarioOverrides: { waterAvailability: "unavailable" },
    evidence,
    now: FIXED_NOW,
  });
  for (const result of [comparison.baseScenario, comparison.simulatedScenario]) {
    const irrigation = result.candidateActions.find((item) => item.code === "IRRIGATE_NOW");
    assert.equal(irrigation.status, "INSUFFICIENT_EVIDENCE");
    assert.equal(irrigation.score, null);
  }
});

test("scenario 1: high water stress ranks IRRIGATE_NOW first", () => {
  const result = decide(
    buildInput(),
    buildEvidence({
      disease: diseaseEvidence({ healthy: true }),
      irrigation: irrigationEvidence({
        required: true,
        code: "irrigate_today",
        stress: "High",
      }),
    })
  );

  assert.equal(result.nextBestAction.code, "IRRIGATE_NOW");
  assert.equal(result.nextBestAction.score, 100);
});

test("scenario 2: supported disease concern ranks CHECK_CROP_HEALTH first", () => {
  const result = decide(
    buildInput(),
    buildEvidence({
      disease: diseaseEvidence({ healthy: false, confidence: 0.92 }),
      irrigation: irrigationEvidence(),
    })
  );

  assert.equal(result.nextBestAction.code, "CHECK_CROP_HEALTH");
  assert.equal(result.nextBestAction.score, 85);
  assert.match(result.why.join(" "), /not severity|health concern/i);
});

test("scenario 3: unavailable water blocks irrigation and exposes a feasible conflict action", () => {
  const result = decide(
    buildInput({ waterAvailability: "unavailable" }),
    buildEvidence({
      disease: diseaseEvidence({ healthy: true }),
      irrigation: irrigationEvidence({
        required: true,
        code: "irrigate_today",
        stress: "High",
      }),
    })
  );
  const irrigateNow = result.candidateActions.find(
    (candidate) => candidate.code === "IRRIGATE_NOW"
  );

  assert.equal(result.nextBestAction.code, "ADDRESS_WATER_CONSTRAINT");
  assert.equal(irrigateNow.status, "BLOCKED");
  assert.equal(irrigateNow.score, null);
  assert.match(result.constraints.join(" "), /unavailable|infeasible/i);
});

test("scenario 4: harvested produce without storage prioritizes SELL_NOW and blocks hold", () => {
  const result = decide(
    buildInput({
      farmState: "harvested",
      availableQuantity: 100,
      currentSalePrice: 40,
      transportCost: 200,
      storageAvailable: false,
    }),
    buildEvidence()
  );
  const hold = result.candidateActions.find(
    (candidate) => candidate.code === "HOLD_AND_MONITOR"
  );

  assert.equal(result.nextBestAction.code, "SELL_NOW");
  assert.equal(result.nextBestAction.score, 85);
  assert.equal(hold.status, "BLOCKED");
  assert.match(hold.constraints.join(" "), /no storage/i);
});

test("scenario 5: a Rising 2021 market trend contributes zero current score", () => {
  const result = decide(
    buildInput({
      farmState: "harvested",
      availableQuantity: 100,
      currentSalePrice: 40,
      storageAvailable: true,
      storageCost: 100,
    }),
    buildEvidence({ market: marketEvidence("Rising") })
  );
  const hold = result.candidateActions.find(
    (candidate) => candidate.code === "HOLD_AND_MONITOR"
  );
  const marketFactor = hold.factors.find(
    (factor) => factor.factor === "historicalMarketTrend"
  );

  assert.notEqual(result.nextBestAction.code, "HOLD_AND_MONITOR");
  assert.equal(marketFactor.effect, 0);
  assert.equal(result.evidence.market.usedInScoring, false);
  assert.match(marketFactor.reason, /contributes exactly 0 points/i);
});

test("scenario 6: missing module evidence is listed without preventing a manual sale decision", () => {
  const result = decide(
    buildInput({
      farmState: "harvested",
      availableQuantity: 50,
      currentSalePrice: 30,
      storageAvailable: false,
    }),
    buildEvidence()
  );

  assert.equal(result.nextBestAction.code, "SELL_NOW");
  assert.ok(result.missingData.some((item) => /DiseaseScan unavailable/i.test(item)));
  assert.ok(result.missingData.some((item) => /IrrigationRecord unavailable/i.test(item)));
  assert.ok(result.missingData.some((item) => /MarketAnalysis unavailable/i.test(item)));
});

test("crop normalization maps explicit aliases but rejects unrelated names", () => {
  assert.equal(normalizeCropName("Organic Tomatos"), "tomato");
  assert.equal(normalizeCropName("Groundnut"), "groundnut");
  assert.equal(normalizeCropName("Groundnut/peanut"), "groundnut");
  assert.equal(normalizeCropName("banana"), null);
});

test("candidate ranking and output are deterministic for identical evidence and time", () => {
  const input = buildInput();
  const evidence = buildEvidence({
    disease: diseaseEvidence({ healthy: false, confidence: 0.65 }),
    irrigation: irrigationEvidence({
      required: true,
      code: "irrigate_tomorrow",
      stress: "Medium",
    }),
  });

  assert.deepEqual(decide(input, evidence), decide(input, evidence));
});

test("each scored candidate exposes factor arithmetic matching its bounded score", () => {
  const result = decide(
    buildInput(),
    buildEvidence({
      disease: diseaseEvidence({ healthy: true }),
      irrigation: irrigationEvidence({
        required: true,
        code: "irrigate_today",
        stress: "High",
      }),
    })
  );

  result.candidateActions
    .filter((candidate) => candidate.status === "SCORED")
    .forEach((candidate) => {
      const rawTotal = candidate.factors.reduce(
        (total, factor) => total + factor.effect,
        0
      );
      assert.equal(candidate.score, Math.max(0, Math.min(100, Math.round(rawTotal))));
      assert.ok(candidate.factors.every((factor) => factor.reason && factor.source));
    });
});
