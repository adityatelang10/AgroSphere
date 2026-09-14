const Crop = require("../models/Crop");
const CropRecommendation = require("../models/CropRecommendation");
const DecisionSnapshot = require("../models/DecisionSnapshot");
const FarmerProfile = require("../models/FarmerProfile");
const Order = require("../models/Order");
const {
  classifyRecency,
  getIrrigationRecency,
  getEvidencePreview,
  getSupportedCrops,
  normalizeCropName,
} = require("./decisionEngineService");

const QUICK_ACTIONS = [
  { id: "crop-advisor", label: "Crop Advisor", path: "/farmer/crop-recommendation" },
  { id: "leaf-scanner", label: "Leaf Scanner", path: "/farmer/disease-detection" },
  { id: "irrigation", label: "Irrigation Advisor", path: "/farmer/irrigation-advisor" },
  { id: "market", label: "Market Intelligence", path: "/farmer/market-intelligence" },
  { id: "decision", label: "Farm Decision", path: "/farmer/decision-engine" },
  { id: "what-if", label: "What-If Simulator", path: "/farmer/what-if-simulator" },
  { id: "crops", label: "My Crops", path: "/farmer/crops" },
  { id: "orders", label: "Orders", path: "/farmer/orders" },
];

const ALERT_RANK = {
  URGENT: 0,
  ATTENTION: 1,
  INFO: 2,
  MISSING: 3,
};

const cropLabels = new Map(
  getSupportedCrops().map((crop) => [crop.value, crop.label])
);

const toIsoString = (value) => (value ? new Date(value).toISOString() : null);

const missingEvidence = (sourceType, usageNote) => ({
  status: "MISSING",
  sourceType,
  sourceId: null,
  crop: null,
  createdAt: null,
  ageHours: null,
  freshness: "MISSING",
  usedInScoring: false,
  usageNote,
  data: null,
});

const createEmptyEvidence = (cropLabel = "the current crop") => ({
  cropRecommendation: missingEvidence(
    "CropRecommendation",
    "No crop planning recommendation is stored for this farmer."
  ),
  disease: missingEvidence(
    "DiseaseScan",
    `No Disease Scan is available for ${cropLabel}.`
  ),
  irrigation: missingEvidence(
    "IrrigationRecord",
    `No Irrigation Advice is available for ${cropLabel}.`
  ),
  market: missingEvidence(
    "MarketAnalysis",
    `No Market Analysis is available for ${cropLabel}.`
  ),
  inventory: {
    status: "MISSING",
    sourceType: "CropInventory",
    sourceId: null,
    crop: null,
    createdAt: null,
    ageHours: null,
    freshness: "CURRENT_DATABASE",
    usedInScoring: false,
    usageNote: "No current crop context is available for inventory matching.",
    data: {
      farmerProfileFound: false,
      matchingListingCount: 0,
      listings: [],
    },
  },
});

const normalizeStandaloneCropRecommendation = (recommendation, now) => {
  if (!recommendation) {
    return missingEvidence(
      "CropRecommendation",
      "No crop planning recommendation is stored for this farmer."
    );
  }

  const recency = classifyRecency(
    recommendation.createdAt,
    "cropRecommendation",
    now
  );

  return {
    status: "AVAILABLE",
    sourceType: "CropRecommendation",
    sourceId: String(recommendation._id),
    crop: normalizeCropName(recommendation.recommendedCrop),
    createdAt: toIsoString(recommendation.createdAt),
    ageHours: recency.ageHours,
    freshness: recency.freshness,
    usedInScoring: false,
    usageNote:
      "Crop Recommendation is planning evidence only and is not a direction to replace a current crop.",
    data: {
      recommendedCrop: recommendation.recommendedCrop,
      recommendations: recommendation.recommendations.map((item) => ({
        crop: item.crop,
        score: item.score,
      })),
      modelVersion: recommendation.modelVersion,
    },
  };
};

const selectPrimaryCrop = ({ decision, latestListing }) => {
  if (decision) {
    return {
      available: true,
      value: decision.selectedCrop,
      label: cropLabels.get(decision.selectedCrop) || decision.selectedCrop,
      source: "LATEST_DECISION",
      sourceLabel: "Latest farm decision",
    };
  }

  if (latestListing) {
    const normalizedCrop = normalizeCropName(latestListing.name);
    return {
      available: true,
      value: normalizedCrop,
      label: normalizedCrop
        ? cropLabels.get(normalizedCrop) || latestListing.name
        : latestListing.name,
      source: "LATEST_LISTING",
      sourceLabel: "Most recently updated crop record",
      listingId: String(latestListing._id),
      decisionSupported: Boolean(normalizedCrop),
    };
  }

  return {
    available: false,
    value: null,
    label: "No current crop selected",
    source: "NONE",
    sourceLabel: "No decision or crop record is available",
  };
};

const mapCropRecommendation = (item) => ({
  available: item.status === "AVAILABLE",
  generatedAt: item.createdAt,
  freshness: item.freshness,
  ageHours: item.ageHours,
  planningOnly: true,
  topRecommendation: item.data?.recommendedCrop || null,
  recommendations: item.data?.recommendations || [],
  modelVersion: item.data?.modelVersion || null,
  note:
    item.status === "AVAILABLE"
      ? "Planning information only; it does not mean an existing crop should be replaced."
      : item.usageNote,
});

const mapDisease = (item) => ({
  available: item.status === "AVAILABLE",
  crop: item.crop,
  condition: item.data?.condition || null,
  predictedClass: item.data?.predictedClass || null,
  isHealthy: item.data?.isHealthy ?? null,
  confidence: item.data?.confidence ?? null,
  supportedClass: item.data?.supportedClass ?? null,
  modelVersion: item.data?.modelVersion || null,
  generatedAt: item.createdAt,
  freshness: item.freshness,
  ageHours: item.ageHours,
  note: item.usageNote,
});

const mapIrrigation = (item) => ({
  available: item.status === "AVAILABLE",
  crop: item.crop,
  growthStage: item.data?.growthStage || null,
  irrigationRequired: item.data?.irrigationRequired ?? null,
  decisionCode: item.data?.decisionCode || null,
  recommendedTiming: item.data?.recommendedTiming || null,
  waterStress: item.data?.waterStress || null,
  soilMoistureStatus: item.data?.soilMoistureStatus || null,
  referenceET: item.data?.referenceET ?? null,
  cropWaterRequirement: item.data?.cropWaterRequirement ?? null,
  estimatedIrrigationNeed: item.data?.estimatedIrrigationNeed ?? null,
  effectiveForecastRainfall: item.data?.effectiveForecastRainfall ?? null,
  units: item.data?.units || {
    referenceET: "mm/day",
    cropWaterRequirement: "mm/day",
    estimatedIrrigationNeed: "mm net depth over next 24 hours",
    effectiveForecastRainfall: "mm",
  },
  engineVersion: item.data?.engineVersion || null,
  generatedAt: item.createdAt,
  evidenceAt: item.evidenceAt || null,
  timestampSource: item.timestampSource || null,
  freshness: item.freshness,
  ageHours: item.ageHours,
  note: item.usageNote,
});

const mapMarket = (item) => ({
  available: item.status === "AVAILABLE",
  crop: item.crop,
  selection: item.data?.selection || null,
  referencePrice: item.data?.referencePrice || null,
  historicalDateThrough: item.data?.historicalDateThrough || null,
  trend: item.data?.trend || null,
  percentageChange: item.data?.percentageChange ?? null,
  manualScenario: item.data?.manualScenario || null,
  forecastAvailable: false,
  currentSignalAllowed: false,
  analysisVersion: item.data?.analysisVersion || null,
  generatedAt: item.createdAt,
  freshness: item.status === "AVAILABLE" ? "HISTORICAL_STALE" : "MISSING",
  note:
    item.status === "AVAILABLE"
      ? "Historical reference only. It is not a current market price or a future forecast."
      : item.usageNote,
});

const normalizeInventorySummary = (rows = []) => {
  const stockByUnit = rows
    .map((row) => ({
      unit: row._id,
      listingCount: Number(row.listingCount || 0),
      stockQuantity: Number(row.stockQuantity || 0),
    }))
    .sort((left, right) => left.unit.localeCompare(right.unit));

  return {
    listingCount: stockByUnit.reduce(
      (total, row) => total + row.listingCount,
      0
    ),
    stockByUnit,
    latestListingUpdatedAt: rows.reduce((latest, row) => {
      if (!row.latestListingUpdatedAt) {
        return latest;
      }
      if (!latest || new Date(row.latestListingUpdatedAt) > new Date(latest)) {
        return toIsoString(row.latestListingUpdatedAt);
      }
      return latest;
    }, null),
  };
};

const normalizeOrderSummary = (row) => ({
  totalOrders: Number(row?.totalOrders || 0),
  openOrders: Number(row?.openOrders || 0),
  deliveredOrders: Number(row?.deliveredOrders || 0),
  deliveredOrderValue: Number(row?.deliveredOrderValue || 0),
  latestOrderAt: toIsoString(row?.latestOrderAt),
});

const getLatestInventoryEvidenceTime = (inventoryEvidence) =>
  (inventoryEvidence?.data?.listings || []).reduce((latest, listing) => {
    const timestamp = listing.updatedAt || listing.createdAt;
    if (!timestamp) {
      return latest;
    }
    if (!latest || new Date(timestamp) > new Date(latest)) {
      return timestamp;
    }
    return latest;
  }, null);

const detectNewerEvidence = ({ decision, evidence }) => {
  if (!decision) {
    return [];
  }

  const decisionTime = new Date(decision.generatedAt || decision.createdAt);
  const candidates = [
    ["Crop planning recommendation", evidence.cropRecommendation?.createdAt],
    ["Leaf disease scan", evidence.disease?.createdAt],
    ["Irrigation advice", evidence.irrigation?.createdAt],
    ["Market analysis record", evidence.market?.createdAt],
    ["Crop inventory", getLatestInventoryEvidenceTime(evidence.inventory)],
  ];

  return candidates
    .filter(([, timestamp]) => timestamp && new Date(timestamp) > decisionTime)
    .map(([source, timestamp]) => ({
      source,
      createdAt: toIsoString(timestamp),
    }));
};

const createAlert = (category, code, title, message, source) => ({
  category,
  code,
  title,
  message,
  source,
});

const detectOutdatedSupportingEvidence = ({ decision, evidence, now }) => {
  const winner = decision?.candidateActions?.find(
    (candidate) => candidate.code === decision.nextBestAction?.code && candidate.status === "SCORED"
  );
  if (!winner || !decision.evidenceSnapshot) {
    // Legacy snapshots without a factor audit cannot establish contribution.
    return [];
  }

  return [
    ["disease", "DiseaseScan", "disease"],
    ["irrigation", "IrrigationRecord", "irrigation"],
  ].flatMap(([key, source, label]) => {
    const saved = decision.evidenceSnapshot[key];
    const contributed = winner.factors?.some(
      (factor) => factor.source === source && Number.isFinite(factor.effect) && factor.effect !== 0
    );
    if (!contributed || saved?.status !== "AVAILABLE" || !saved.sourceId ||
        saved.usedInScoring !== true || !["FRESH", "OLDER"].includes(saved.freshness)) {
      return [];
    }

    const current = evidence[key];
    if (!current || current.status !== "AVAILABLE") {
      return [`Supporting ${label} evidence is no longer available.`];
    }
    // Old snapshots omitted the irrigation observation date. Recover it from
    // the same source record when available, never from a different record.
    const sameRecord = String(saved.sourceId) === String(current.sourceId);
    const item = sameRecord ? current : saved;
    const recency = key === "irrigation"
      ? getIrrigationRecency({
          inputs: Object.hasOwn(item, "evidenceAt")
            ? { observationDate: item.evidenceAt ?? "" }
            : {},
          createdAt: item.createdAt,
        }, now)
      : classifyRecency(item.createdAt, "disease", now);

    if (recency.timestampIssue) {
      return [`Supporting ${label} evidence has an invalid or future observation time.`];
    }
    if (recency.freshness === "STALE" || (sameRecord && current.freshness === "STALE")) {
      return [`Supporting ${label} evidence is stale.`];
    }
    if (recency.freshness === "MISSING" ||
        (sameRecord && (current.usedInScoring === false ||
          (key === "disease" && current.data?.supportedClass !== true)))) {
      return [`Supporting ${label} evidence is no longer usable.`];
    }
    return [];
  });
};

const buildAlerts = ({
  primaryCrop,
  cards,
  decisionAvailable,
  decisionNeedsRefresh,
  decisionRefreshReasons,
}) => {
  const alerts = [];
  const irrigationIsCurrent =
    cards.irrigation.available &&
    ["FRESH", "OLDER"].includes(cards.irrigation.freshness);

  if (
    irrigationIsCurrent &&
    (cards.irrigation.waterStress === "High" ||
      cards.irrigation.decisionCode === "irrigate_today")
  ) {
    alerts.push(
      createAlert(
        "URGENT",
        "IRRIGATION_URGENT",
        "Irrigation needs attention",
        cards.irrigation.waterStress === "High"
          ? "Latest stored irrigation advice reports high water stress."
          : "Latest stored irrigation advice recommends irrigating today.",
        "IrrigationRecord"
      )
    );
  }

  const diseaseIsCurrent =
    cards.disease.available &&
    ["FRESH", "OLDER"].includes(cards.disease.freshness);
  if (
    diseaseIsCurrent &&
    cards.disease.supportedClass === true &&
    cards.disease.isHealthy === false
  ) {
    alerts.push(
      createAlert(
        "ATTENTION",
        "DISEASE_CONCERN",
        "Supported disease class detected",
        `${cards.disease.condition} was classified for the current crop. This is a classification, not disease severity.`,
        "DiseaseScan"
      )
    );
  }

  if (decisionNeedsRefresh) {
    alerts.push(
      createAlert(
        "ATTENTION",
        "DECISION_REFRESH",
        "Decision may be outdated",
        `${decisionRefreshReasons.join(" ")} Regenerate Farm Decision using current evidence.`,
        "DecisionSnapshot evidence provenance"
      )
    );
  }

  if (cards.market.available) {
    alerts.push(
      createAlert(
        "INFO",
        "MARKET_HISTORICAL",
        "Market reference is historical",
        "The stored market record is historical/stale and is neither a current price nor a future forecast.",
        "MarketAnalysis"
      )
    );
  }

  if (cards.disease.available && cards.disease.freshness === "STALE") {
    alerts.push(
      createAlert(
        "INFO",
        "DISEASE_STALE",
        "Leaf scan is stale",
        "The latest leaf scan is displayed but is not current decision evidence.",
        "DiseaseScan"
      )
    );
  }

  if (cards.irrigation.available && cards.irrigation.freshness === "STALE") {
    alerts.push(
      createAlert(
        "INFO",
        "IRRIGATION_STALE",
        "Irrigation advice is stale",
        "The latest irrigation advice is displayed but is not current urgency evidence.",
        "IrrigationRecord"
      )
    );
  }

  if (!primaryCrop.available) {
    alerts.push(
      createAlert(
        "MISSING",
        "PRIMARY_CROP_MISSING",
        "No current crop selected",
        "Generate a farm decision or create a crop record to establish dashboard context.",
        "Crop context"
      )
    );
  }

  if (!decisionAvailable) {
    alerts.push(
      createAlert(
        "MISSING",
        "DECISION_MISSING",
        "No farm decision yet",
        "Generate a Next Best Action when the current farm context is available.",
        "DecisionSnapshot"
      )
    );
  }

  [
    ["cropRecommendation", "CROP_PLAN_MISSING", "No crop recommendation yet", "Open Crop Advisor to create planning information."],
    ["disease", "DISEASE_MISSING", "No leaf scan yet", "Scan a supported crop leaf to add crop-health evidence."],
    ["irrigation", "IRRIGATION_MISSING", "No irrigation advice yet", "Open Irrigation Advisor to create a stored recommendation."],
    ["market", "MARKET_MISSING", "No market analysis yet", "Open Market Intelligence to create a historical reference analysis."],
  ].forEach(([key, code, title, message]) => {
    if (!cards[key].available) {
      alerts.push(createAlert("MISSING", code, title, message, cards[key].sourceType || key));
    }
  });

  return alerts.sort((left, right) => ALERT_RANK[left.category] - ALERT_RANK[right.category]);
};

const buildDashboardPayload = ({
  now = new Date(),
  user,
  profile,
  primaryCrop,
  decision,
  evidence,
  inventorySummary = {},
  orderSummary = {},
}) => {
  const cards = {
    cropRecommendation: mapCropRecommendation(evidence.cropRecommendation),
    disease: mapDisease(evidence.disease),
    irrigation: mapIrrigation(evidence.irrigation),
    market: mapMarket(evidence.market),
  };
  const newerEvidence = detectNewerEvidence({ decision, evidence });
  const outdatedEvidence = detectOutdatedSupportingEvidence({ decision, evidence, now });
  const decisionRefreshReasons = [
    ...newerEvidence.map((item) => `${item.source} changed after the latest decision.`),
    ...outdatedEvidence,
  ];
  const decisionNeedsRefresh = decisionRefreshReasons.length > 0;
  const alerts = buildAlerts({
    primaryCrop,
    cards,
    decisionAvailable: Boolean(decision),
    decisionNeedsRefresh,
    decisionRefreshReasons,
  });

  const nextBestAction = decision
    ? {
        available: true,
        decisionId: String(decision._id),
        code: decision.nextBestAction.code,
        title: decision.nextBestAction.title,
        priorityScore: decision.nextBestAction.score,
        reasons: (decision.reasons || []).slice(0, 4),
        decisionVersion: decision.decisionVersion,
        generatedAt: toIsoString(decision.generatedAt || decision.createdAt),
        farmState: decision.farmState,
        missingDataAtDecisionTime: decision.missingData || [],
      }
    : {
        available: false,
        decisionId: null,
        code: null,
        title: null,
        priorityScore: null,
        reasons: [],
        decisionVersion: null,
        generatedAt: null,
        farmState: null,
        missingDataAtDecisionTime: [],
      };

  return {
    success: true,
    generatedAt: now.toISOString(),
    farmer: {
      name: user?.name || "Farmer",
      farmName: profile?.farmName || null,
      location: profile?.location
        ? {
            district: profile.location.district,
            state: profile.location.state,
            label: `${profile.location.district}, ${profile.location.state}`,
          }
        : null,
    },
    primaryCrop,
    nextBestAction,
    decisionNeedsRefresh,
    decisionRefreshReasons,
    newerEvidence,
    cropRecommendation: cards.cropRecommendation,
    disease: cards.disease,
    irrigation: cards.irrigation,
    market: cards.market,
    inventory: {
      listingCount: Number(inventorySummary.listingCount || 0),
      stockByUnit: inventorySummary.stockByUnit || [],
      currentCropListingCount:
        evidence.inventory?.data?.matchingListingCount || 0,
      latestListingUpdatedAt: inventorySummary.latestListingUpdatedAt || null,
      terminologyNote:
        "Crop records have no active/inactive status, so the dashboard reports current listing records without claiming they are active.",
    },
    orders: normalizeOrderSummary(orderSummary),
    alerts,
    missingData: alerts
      .filter((alert) => alert.category === "MISSING")
      .map((alert) => alert.message),
    freshness: {
      decision: decision
        ? outdatedEvidence.length > 0
          ? "DECISION_OUTDATED"
          : newerEvidence.length > 0
            ? "NEW_EVIDENCE_AVAILABLE"
            : "LATEST_STORED_DECISION"
        : "MISSING",
      disease: cards.disease.freshness,
      irrigation: cards.irrigation.freshness,
      market: cards.market.freshness,
      cropRecommendation: cards.cropRecommendation.freshness,
    },
    quickActions: QUICK_ACTIONS,
  };
};

const loadInventorySummary = async (profileId) => {
  if (!profileId) {
    return normalizeInventorySummary([]);
  }

  const rows = await Crop.aggregate([
    { $match: { farmer: profileId } },
    {
      $group: {
        _id: "$unit",
        listingCount: { $sum: 1 },
        stockQuantity: { $sum: "$stockQuantity" },
        latestListingUpdatedAt: { $max: "$updatedAt" },
      },
    },
  ]);

  return normalizeInventorySummary(rows);
};

const loadOrderSummary = async (profileId) => {
  if (!profileId) {
    return normalizeOrderSummary(null);
  }

  const rows = await Order.aggregate([
    { $match: { "items.farmer": profileId } },
    {
      $project: {
        status: 1,
        placedAt: 1,
        farmerItems: {
          $filter: {
            input: "$items",
            as: "item",
            cond: { $eq: ["$$item.farmer", profileId] },
          },
        },
      },
    },
    {
      $project: {
        status: 1,
        placedAt: 1,
        farmerOrderValue: {
          $sum: {
            $map: {
              input: "$farmerItems",
              as: "item",
              in: { $multiply: ["$$item.quantity", "$$item.priceAtOrder"] },
            },
          },
        },
      },
    },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        openOrders: {
          $sum: { $cond: [{ $ne: ["$status", "Delivered"] }, 1, 0] },
        },
        deliveredOrders: {
          $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0] },
        },
        deliveredOrderValue: {
          $sum: {
            $cond: [
              { $eq: ["$status", "Delivered"] },
              "$farmerOrderValue",
              0,
            ],
          },
        },
        latestOrderAt: { $max: "$placedAt" },
      },
    },
  ]);

  return normalizeOrderSummary(rows[0]);
};

const getIntelligenceDashboard = async ({ farmer, now = new Date() }) => {
  const [profile, decision] = await Promise.all([
    FarmerProfile.findOne({ user: farmer._id }).lean(),
    DecisionSnapshot.findOne({ farmer: farmer._id })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const latestListing =
    !decision && profile
      ? await Crop.findOne({ farmer: profile._id })
          .sort({ updatedAt: -1 })
          .lean()
      : null;
  const primaryCrop = selectPrimaryCrop({ decision, latestListing });

  let evidence = createEmptyEvidence(primaryCrop.label);
  if (primaryCrop.value) {
    const preview = await getEvidencePreview({
      farmerId: farmer._id,
      selectedCrop: primaryCrop.value,
      now,
    });
    evidence = preview.evidence;
  } else {
    const latestRecommendation = await CropRecommendation.findOne({
      farmer: farmer._id,
    })
      .sort({ createdAt: -1 })
      .lean();
    evidence.cropRecommendation = normalizeStandaloneCropRecommendation(
      latestRecommendation,
      now
    );
    evidence.inventory.data.farmerProfileFound = Boolean(profile);
    evidence.inventory.sourceId = profile ? String(profile._id) : null;
  }

  const [inventorySummary, orderSummary] = await Promise.all([
    loadInventorySummary(profile?._id),
    loadOrderSummary(profile?._id),
  ]);

  return buildDashboardPayload({
    now,
    user: farmer,
    profile,
    primaryCrop,
    decision,
    evidence,
    inventorySummary,
    orderSummary,
  });
};

module.exports = {
  buildDashboardPayload,
  getIntelligenceDashboard,
  normalizeInventorySummary,
  selectPrimaryCrop,
};
