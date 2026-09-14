const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildDashboardPayload,
} = require("../src/services/intelligenceDashboardService");
const { evaluateDecision } = require("../src/services/decisionEngineService");

const NOW = new Date("2026-08-25T12:00:00.000Z");
const PRIMARY_CROP = {
  available: true,
  value: "tomato",
  label: "Tomato",
  source: "LATEST_DECISION",
  sourceLabel: "Latest farm decision",
};

const missing = (sourceType) => ({
  status: "MISSING",
  sourceType,
  sourceId: null,
  crop: null,
  createdAt: null,
  ageHours: null,
  freshness: "MISSING",
  usedInScoring: false,
  usageNote: `${sourceType} is not available.`,
  data: null,
});

const cropRecommendation = (createdAt = "2026-08-25T08:00:00.000Z") => ({
  status: "AVAILABLE",
  sourceType: "CropRecommendation",
  sourceId: "crop-plan-1",
  crop: "rice",
  createdAt,
  ageHours: 4,
  freshness: "FRESH",
  usedInScoring: false,
  usageNote: "Planning information only.",
  data: {
    recommendedCrop: "rice",
    recommendations: [
      { crop: "rice", score: 0.8 },
      { crop: "jute", score: 0.15 },
    ],
    modelVersion: "crop-v1",
  },
});

const disease = ({
  createdAt = "2026-08-25T09:00:00.000Z",
  healthy = true,
  freshness = "FRESH",
} = {}) => ({
  status: "AVAILABLE",
  sourceType: "DiseaseScan",
  sourceId: "disease-1",
  crop: "tomato",
  createdAt,
  ageHours: 3,
  freshness,
  usedInScoring: freshness !== "STALE",
  usageNote: "Confidence is classification evidence, not severity.",
  data: {
    condition: healthy ? "Healthy" : "Early Blight",
    predictedClass: healthy ? "Tomato___healthy" : "Tomato___Early_blight",
    isHealthy: healthy,
    confidence: 0.94,
    supportedClass: true,
    modelVersion: "disease-v1",
  },
});

const irrigation = ({
  stress = "Low",
  code = "no_irrigation",
  createdAt = "2026-08-25T09:30:00.000Z",
} = {}) => ({
  status: "AVAILABLE",
  sourceType: "IrrigationRecord",
  sourceId: "irrigation-1",
  crop: "tomato",
  createdAt,
  ageHours: 2.5,
  freshness: "FRESH",
  usedInScoring: true,
  usageNote: "Stored irrigation advice.",
  data: {
    growthStage: "mid_season",
    irrigationRequired: code !== "no_irrigation",
    decisionCode: code,
    recommendedTiming:
      code === "irrigate_today" ? "Irrigate today" : "No irrigation required",
    waterStress: stress,
    soilMoistureStatus: stress === "High" ? "Low" : "Adequate",
    referenceET: 5.8,
    cropWaterRequirement: 6.73,
    estimatedIrrigationNeed: code === "irrigate_today" ? 6.73 : 0,
    effectiveForecastRainfall: 0,
    units: {
      referenceET: "mm/day",
      cropWaterRequirement: "mm/day",
      estimatedIrrigationNeed: "mm net depth over next 24 hours",
      effectiveForecastRainfall: "mm",
    },
    engineVersion: "irrigation-v1",
  },
});

const market = (createdAt = "2026-08-25T09:45:00.000Z") => ({
  status: "AVAILABLE",
  sourceType: "MarketAnalysis",
  sourceId: "market-1",
  crop: "tomato",
  createdAt,
  ageHours: 2.25,
  freshness: "HISTORICAL_STALE",
  usedInScoring: false,
  usageNote: "Historical context only.",
  data: {
    selection: {
      commodity: "Tomato",
      market: "Pune",
      district: "Pune",
      state: "Maharashtra",
      variety: "Local",
    },
    trend: "Rising",
    percentageChange: 12,
    referencePrice: {
      observedDate: "2021-06-30T00:00:00.000Z",
      minimumPrice: 500,
      modalPrice: 700,
      maximumPrice: 900,
      unit: "INR/quintal",
    },
    historicalDateThrough: "2021-06-30T00:00:00.000Z",
    manualScenario: {
      quantityQuintals: 10,
      expectedSalePrice: 900,
      estimatedNetReturn: 6000,
    },
    forecastAvailable: false,
    analysisVersion: "market-v1",
  },
});

const inventory = (updatedAt = "2026-08-25T09:50:00.000Z") => ({
  status: "AVAILABLE",
  sourceType: "CropInventory",
  sourceId: "profile-1",
  crop: "tomato",
  createdAt: null,
  ageHours: null,
  freshness: "CURRENT_DATABASE",
  usedInScoring: true,
  usageNote: "Inventory context.",
  data: {
    farmerProfileFound: true,
    matchingListingCount: 1,
    listings: [
      {
        cropId: "crop-1",
        name: "Tomato",
        unit: "kg",
        stockQuantity: 100,
        updatedAt,
      },
    ],
  },
});

const fullEvidence = (overrides = {}) => ({
  cropRecommendation: cropRecommendation(),
  disease: disease(),
  irrigation: irrigation(),
  market: market(),
  inventory: inventory(),
  ...overrides,
});

const decision = (generatedAt = "2026-08-25T10:00:00.000Z") => ({
  _id: "decision-1",
  selectedCrop: "tomato",
  farmState: "growing",
  nextBestAction: {
    code: "CONTINUE_MONITORING",
    title: "Continue crop monitoring",
    score: 70,
  },
  reasons: ["Leaf condition is healthy.", "Irrigation is not currently required."],
  missingData: [],
  decisionVersion: "decision-v1",
  generatedAt,
  createdAt: generatedAt,
});

const build = ({
  evidence = fullEvidence(),
  latestDecision = decision(),
  primaryCrop = PRIMARY_CROP,
  now = NOW,
} = {}) =>
  buildDashboardPayload({
    now,
    user: { name: "Nikhil" },
    profile: {
      farmName: "Green Farm",
      location: { district: "Pune", state: "Maharashtra" },
    },
    primaryCrop,
    decision: latestDecision,
    evidence,
    inventorySummary: {
      listingCount: 2,
      stockByUnit: [{ unit: "kg", listingCount: 2, stockQuantity: 150 }],
      latestListingUpdatedAt: "2026-08-25T09:50:00.000Z",
    },
    orderSummary: {
      totalOrders: 3,
      openOrders: 2,
      deliveredOrders: 1,
      deliveredOrderValue: 2500,
      latestOrderAt: "2026-08-25T09:00:00.000Z",
    },
  });

test("scenario 1: full dashboard exposes every persisted section", () => {
  const result = build();

  assert.equal(result.nextBestAction.available, true);
  assert.equal(result.nextBestAction.priorityScore, 70);
  assert.equal(result.cropRecommendation.topRecommendation, "rice");
  assert.equal(result.disease.condition, "Healthy");
  assert.equal(result.irrigation.cropWaterRequirement, 6.73);
  assert.equal(result.irrigation.units.cropWaterRequirement, "mm/day");
  assert.equal(
    result.irrigation.units.estimatedIrrigationNeed,
    "mm net depth over next 24 hours"
  );
  assert.equal(result.market.freshness, "HISTORICAL_STALE");
  assert.equal(result.inventory.listingCount, 2);
  assert.equal(result.orders.deliveredOrderValue, 2500);
  assert.equal(result.quickActions.length, 8);
});

test("scenario 2: missing module data remains explicit and never creates predictions", () => {
  const result = build({
    latestDecision: null,
    primaryCrop: {
      available: true,
      value: "tomato",
      label: "Tomato",
      source: "LATEST_LISTING",
      sourceLabel: "Most recently updated crop record",
    },
    evidence: {
      cropRecommendation: missing("CropRecommendation"),
      disease: missing("DiseaseScan"),
      irrigation: missing("IrrigationRecord"),
      market: missing("MarketAnalysis"),
      inventory: inventory(),
    },
  });

  assert.equal(result.nextBestAction.available, false);
  assert.equal(result.disease.available, false);
  assert.equal(result.irrigation.available, false);
  assert.equal(result.market.available, false);
  assert.ok(result.alerts.some((alert) => alert.code === "DECISION_MISSING"));
  assert.ok(result.missingData.length >= 5);
});

test("scenario 3: high water stress and irrigate-today advice create an URGENT alert", () => {
  const result = build({
    evidence: fullEvidence({
      irrigation: irrigation({ stress: "High", code: "irrigate_today" }),
    }),
  });

  const alert = result.alerts.find((item) => item.code === "IRRIGATION_URGENT");
  assert.equal(alert.category, "URGENT");
  assert.match(alert.message, /high water stress/i);
});

test("scenario 4: supported non-healthy classification creates ATTENTION without severity inference", () => {
  const result = build({
    evidence: fullEvidence({ disease: disease({ healthy: false }) }),
  });

  const alert = result.alerts.find((item) => item.code === "DISEASE_CONCERN");
  assert.equal(alert.category, "ATTENTION");
  assert.match(alert.message, /not disease severity/i);
  assert.equal(result.disease.confidence, 0.94);
});

test("scenario 5: market information is always historical/stale and not a forecast", () => {
  const result = build();

  assert.equal(result.market.freshness, "HISTORICAL_STALE");
  assert.equal(result.market.currentSignalAllowed, false);
  assert.equal(result.market.forecastAvailable, false);
  assert.match(result.market.note, /not a current market price|future forecast/i);
});

test("scenario 6: newer module evidence marks the stored decision for refresh", () => {
  const result = build({
    evidence: fullEvidence({
      disease: disease({ createdAt: "2026-08-25T11:00:00.000Z" }),
    }),
  });

  assert.equal(result.decisionNeedsRefresh, true);
  assert.ok(result.newerEvidence.some((item) => item.source === "Leaf disease scan"));
  assert.ok(result.alerts.some((item) => item.code === "DECISION_REFRESH"));
  assert.equal(result.freshness.decision, "NEW_EVIDENCE_AVAILABLE");
});

const savedDecision = (evidence, input = {}) => {
  const result = evaluateDecision({
    input: {
      selectedCrop: "tomato", farmState: "growing", availableQuantity: 0,
      quantityUnit: "kg", waterAvailability: "adequate", storageAvailable: false,
      currentSalePrice: null, transportCost: 0, storageCost: 0, otherCost: 0,
      ...input,
    },
    evidence,
    now: NOW,
  });
  return {
    ...decision(NOW.toISOString()),
    nextBestAction: result.nextBestAction,
    candidateActions: result.candidateActions,
    evidenceSnapshot: structuredClone(evidence),
    reasons: result.why,
  };
};
const daysLater = (days) => new Date(NOW.getTime() + days * 86_400_000);

test("audit reproduction: supporting disease expires with no newer record", () => {
  const evidence = fullEvidence({ disease: disease({ healthy: false }) });
  const saved = savedDecision(evidence);
  const original = structuredClone(saved);
  assert.equal(saved.nextBestAction.code, "CHECK_CROP_HEALTH");
  assert.equal(build({ evidence, latestDecision: saved }).decisionNeedsRefresh, false);

  // Deliberately leave the old FRESH label: expiry must be recalculated by clock.
  const result = build({ evidence, latestDecision: saved, now: daysLater(8) });
  assert.deepEqual(result.newerEvidence, []);
  assert.equal(result.decisionNeedsRefresh, true);
  assert.equal(result.freshness.decision, "DECISION_OUTDATED");
  assert.deepEqual(result.decisionRefreshReasons, ["Supporting disease evidence is stale."]);
  assert.equal(result.nextBestAction.code, "CHECK_CROP_HEALTH");
  assert.equal(result.nextBestAction.priorityScore, saved.nextBestAction.score);
  assert.match(result.alerts.find((item) => item.code === "DECISION_REFRESH").message, /disease evidence is stale.*Regenerate Farm Decision/i);
  assert.deepEqual(saved, original);
});

test("supporting irrigation expiry requests refresh without new evidence", () => {
  const evidence = fullEvidence({ irrigation: irrigation({ stress: "High", code: "irrigate_today" }) });
  evidence.irrigation.evidenceAt = "2026-08-25T00:00:00.000Z";
  const saved = savedDecision(evidence);
  assert.equal(saved.nextBestAction.code, "IRRIGATE_NOW");
  const result = build({ evidence, latestDecision: saved, now: daysLater(4) });
  assert.equal(result.decisionNeedsRefresh, true);
  assert.deepEqual(result.newerEvidence, []);
  assert.deepEqual(result.decisionRefreshReasons, ["Supporting irrigation evidence is stale."]);
});

test("old irrigation snapshot recovers observation timestamp only from the same record", () => {
  const evidence = fullEvidence({ irrigation: irrigation({ stress: "High", code: "irrigate_today" }) });
  const saved = savedDecision(evidence);
  evidence.irrigation.evidenceAt = "2026-08-01T00:00:00.000Z";
  const result = build({ evidence, latestDecision: saved });
  assert.equal(result.decisionNeedsRefresh, true);
  assert.deepEqual(result.newerEvidence, []);
  assert.match(result.decisionRefreshReasons.join(" "), /irrigation evidence is stale/i);

  evidence.irrigation.sourceId = "different-irrigation-record";
  assert.equal(build({ evidence, latestDecision: saved }).decisionNeedsRefresh, false);
});

test("historical market alone never expires a saved manual sale decision", () => {
  const evidence = fullEvidence({ disease: missing("DiseaseScan"), irrigation: missing("IrrigationRecord") });
  const saved = savedDecision(evidence, { farmState: "harvested", availableQuantity: 100, currentSalePrice: 40 });
  assert.equal(saved.nextBestAction.code, "SELL_NOW");
  const result = build({ evidence, latestDecision: saved, now: daysLater(100) });
  assert.equal(result.market.freshness, "HISTORICAL_STALE");
  assert.equal(result.decisionNeedsRefresh, false);
  assert.equal(result.freshness.decision, "LATEST_STORED_DECISION");
});

test("crop planning aging does not invalidate an unrelated irrigation action", () => {
  const evidence = fullEvidence({ irrigation: irrigation({ stress: "High", code: "irrigate_today" }) });
  evidence.cropRecommendation.createdAt = "2026-05-26T13:00:00.000Z";
  evidence.cropRecommendation.freshness = "OLDER";
  const saved = savedDecision(evidence);
  evidence.cropRecommendation.freshness = "STALE";
  const result = build({ evidence, latestDecision: saved, now: daysLater(1) });
  assert.equal(result.nextBestAction.code, "IRRIGATE_NOW");
  assert.equal(result.decisionNeedsRefresh, false);
});

test("all supporting evidence still usable leaves the stored decision current", () => {
  const evidence = fullEvidence();
  const saved = savedDecision(evidence);
  const result = build({ evidence, latestDecision: saved, now: daysLater(1) });
  assert.equal(saved.nextBestAction.code, "CONTINUE_MONITORING");
  assert.equal(result.decisionNeedsRefresh, false);
  assert.deepEqual(result.decisionRefreshReasons, []);
  assert.equal(result.freshness.decision, "LATEST_STORED_DECISION");
});

test("missing or deleted supporting record requests refresh safely", () => {
  const evidence = fullEvidence({ disease: disease({ healthy: false }) });
  const saved = savedDecision(evidence);
  evidence.disease = missing("DiseaseScan");
  const result = build({ evidence, latestDecision: saved });
  assert.equal(result.decisionNeedsRefresh, true);
  assert.equal(result.nextBestAction.available, true);
  assert.deepEqual(result.decisionRefreshReasons, ["Supporting disease evidence is no longer available."]);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("unsupported supporting disease record requests refresh safely", () => {
  const evidence = fullEvidence({ disease: disease({ healthy: false }) });
  const saved = savedDecision(evidence);
  evidence.disease.data.supportedClass = false;
  evidence.disease.usedInScoring = false;
  const result = build({ evidence, latestDecision: saved });
  assert.equal(result.decisionNeedsRefresh, true);
  assert.match(result.decisionRefreshReasons[0], /no longer usable/i);
});

test("unrelated stale disease with zero winner contribution does not invalidate irrigation", () => {
  const evidence = fullEvidence({ irrigation: irrigation({ stress: "High", code: "irrigate_today" }) });
  evidence.disease.createdAt = "2026-08-18T13:00:00.000Z";
  evidence.disease.freshness = "OLDER";
  const saved = savedDecision(evidence);
  assert.equal(saved.nextBestAction.code, "IRRIGATE_NOW");
  const result = build({ evidence, latestDecision: saved, now: daysLater(1) });
  assert.equal(result.decisionNeedsRefresh, false);
});

test("missing evidence at decision time does not later count as expired support", () => {
  const evidence = fullEvidence({ disease: missing("DiseaseScan"), irrigation: missing("IrrigationRecord") });
  const saved = savedDecision(evidence);
  const result = build({ evidence, latestDecision: saved, now: daysLater(100) });
  assert.equal(result.decisionNeedsRefresh, false);
});

test("legacy snapshots lacking provenance remain readable without guessing contribution", () => {
  const result = build({ now: daysLater(100) });
  assert.equal(result.decisionNeedsRefresh, false);
  assert.equal(result.nextBestAction.available, true);
});

test("no saved decision preserves missing-decision behavior", () => {
  const result = build({ latestDecision: null, now: daysLater(100) });
  assert.equal(result.decisionNeedsRefresh, false);
  assert.equal(result.freshness.decision, "MISSING");
  assert.deepEqual(result.decisionRefreshReasons, []);
  assert.ok(result.alerts.some((item) => item.code === "DECISION_MISSING"));
});
