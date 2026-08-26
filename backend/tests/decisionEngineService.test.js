const assert = require("node:assert/strict");
const test = require("node:test");

const {
  evaluateDecision,
  normalizeCropName,
} = require("../src/services/decisionEngineService");

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
