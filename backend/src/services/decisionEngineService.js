const Crop = require("../models/Crop");
const CropRecommendation = require("../models/CropRecommendation");
const DiseaseScan = require("../models/DiseaseScan");
const FarmerProfile = require("../models/FarmerProfile");
const IrrigationRecord = require("../models/IrrigationRecord");
const MarketAnalysis = require("../models/MarketAnalysis");
const {
  ACTION_DEFINITIONS,
  ACTION_TIE_PRIORITY,
  CROP_DEFINITIONS,
  DECISION_VERSION,
  EVIDENCE_CONFIDENCE_THRESHOLDS,
  RECENCY_THRESHOLDS_HOURS,
  SCORE_RULES,
  STORAGE_COST_RATIO_THRESHOLDS,
} = require("../config/decisionEngineConfig");

const normalizeAlias = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

const CROP_ALIAS_LOOKUP = Object.entries(CROP_DEFINITIONS).reduce(
  (lookup, [canonicalName, definition]) => {
    definition.aliases.forEach((alias) => {
      lookup.set(normalizeAlias(alias), canonicalName);
    });
    lookup.set(normalizeAlias(canonicalName), canonicalName);
    return lookup;
  },
  new Map()
);

const normalizeCropName = (value) => CROP_ALIAS_LOOKUP.get(normalizeAlias(value)) || null;

const getSupportedCrops = () =>
  Object.entries(CROP_DEFINITIONS).map(([value, definition]) => ({
    value,
    label: definition.label,
  }));

const toIsoString = (value) => (value ? new Date(value).toISOString() : null);

const classifyRecency = (createdAt, evidenceType, now = new Date()) => {
  if (!createdAt) {
    return {
      freshness: "MISSING",
      ageHours: null,
    };
  }

  const ageHours = Math.max(0, (now.getTime() - new Date(createdAt).getTime()) / 3_600_000);
  const thresholds = RECENCY_THRESHOLDS_HOURS[evidenceType];
  let freshness = "STALE";

  if (ageHours <= thresholds.fresh) {
    freshness = "FRESH";
  } else if (ageHours <= thresholds.older) {
    freshness = "OLDER";
  }

  return {
    freshness,
    ageHours: Math.round(ageHours * 10) / 10,
  };
};

const getIrrigationRecency = (record, now = new Date()) => {
  // The form submits YYYY-MM-DD; MongoDB casts it to UTC midnight. Keep that
  // convention explicit instead of interpreting the calendar date in server time.
  // Only genuinely absent observation dates may use the legacy creation time.
  const observationDate = record.inputs?.observationDate;
  const timestampSource = observationDate == null ? "createdAt" : "inputs.observationDate";
  const value = observationDate == null ? record.createdAt : observationDate;
  const parsed = value == null || value === ""
    ? NaN
    : new Date(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00.000Z`
      : value).getTime();
  const valid = Number.isFinite(parsed);
  const timestampIssue = !valid ? "INVALID" : parsed > now.getTime() ? "FUTURE" : null;

  return {
    evidenceAt: valid ? new Date(parsed).toISOString() : null,
    timestampSource,
    timestampIssue,
    ...(timestampIssue
      ? { freshness: "STALE", ageHours: null }
      : classifyRecency(new Date(parsed), "irrigation", now)),
  };
};

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

const escapeRegularExpression = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const createCropAliasPattern = (selectedCrop) => {
  const aliases = [selectedCrop, ...CROP_DEFINITIONS[selectedCrop].aliases];
  return new RegExp(
    `^(?:${aliases.map(escapeRegularExpression).join("|")})$`,
    "i"
  );
};

const loadLatestEvidence = async ({ farmerId, selectedCrop, now = new Date() }) => {
  const cropAliasPattern = createCropAliasPattern(selectedCrop);
  const [cropRecommendation, disease, irrigation, market, profile] =
    await Promise.all([
      CropRecommendation.findOne({ farmer: farmerId }).sort({ createdAt: -1 }).lean(),
      DiseaseScan.findOne({ farmer: farmerId, crop: cropAliasPattern })
        .sort({ createdAt: -1 })
        .lean(),
      IrrigationRecord.findOne({
        farmer: farmerId,
        "inputs.crop": cropAliasPattern,
      })
        .sort({ createdAt: -1 })
        .lean(),
      MarketAnalysis.findOne({
        farmer: farmerId,
        "inputs.crop": cropAliasPattern,
      })
        .sort({ createdAt: -1 })
        .lean(),
      FarmerProfile.findOne({ user: farmerId }).lean(),
    ]);

  const matchingListings = profile
    ? await Crop.find({ farmer: profile._id, name: cropAliasPattern })
        .sort({ updatedAt: -1 })
        .lean()
    : [];

  const cropRecommendationRecency = cropRecommendation
    ? classifyRecency(cropRecommendation.createdAt, "cropRecommendation", now)
    : null;
  const diseaseRecency = disease
    ? classifyRecency(disease.createdAt, "disease", now)
    : null;
  const irrigationRecency = irrigation
    ? getIrrigationRecency(irrigation, now)
    : null;
  const marketRecordRecency = market
    ? classifyRecency(market.createdAt, "marketRecord", now)
    : null;

  return {
    cropRecommendation: cropRecommendation
      ? {
          status: "AVAILABLE",
          sourceType: "CropRecommendation",
          sourceId: String(cropRecommendation._id),
          crop: normalizeCropName(cropRecommendation.recommendedCrop),
          createdAt: toIsoString(cropRecommendation.createdAt),
          ageHours: cropRecommendationRecency.ageHours,
          freshness: cropRecommendationRecency.freshness,
          usedInScoring: false,
          usageNote:
            "Crop Recommendation is planning evidence only and is not scored for an existing growing or harvested crop.",
          data: {
            recommendedCrop: cropRecommendation.recommendedCrop,
            recommendations: cropRecommendation.recommendations.map((item) => ({
              crop: item.crop,
              score: item.score,
            })),
            modelVersion: cropRecommendation.modelVersion,
          },
        }
      : missingEvidence(
          "CropRecommendation",
          "No planning recommendation is stored for this farmer. It is informational for current-crop decisions."
        ),
    disease: disease
      ? {
          status: "AVAILABLE",
          sourceType: "DiseaseScan",
          sourceId: String(disease._id),
          crop: selectedCrop,
          createdAt: toIsoString(disease.createdAt),
          ageHours: diseaseRecency.ageHours,
          freshness: diseaseRecency.freshness,
          usedInScoring:
            diseaseRecency.freshness !== "STALE" && disease.supportedClass === true,
          usageNote:
            diseaseRecency.freshness === "STALE"
              ? "The disease scan is stale and is displayed but not used as current crop-health evidence."
              : "Classification confidence is used only as evidence strength, never as disease severity.",
          data: {
            condition: disease.condition,
            predictedClass: disease.predictedClass,
            isHealthy: disease.isHealthy,
            confidence: disease.confidence,
            supportedClass: disease.supportedClass,
            modelVersion: disease.modelVersion,
          },
        }
      : missingEvidence(
          "DiseaseScan",
          `No Disease Scan is stored for ${CROP_DEFINITIONS[selectedCrop].label}.`
        ),
    irrigation: irrigation
      ? {
          status: "AVAILABLE",
          sourceType: "IrrigationRecord",
          sourceId: String(irrigation._id),
          crop: selectedCrop,
          createdAt: toIsoString(irrigation.createdAt),
          evidenceAt: irrigationRecency.evidenceAt,
          timestampSource: irrigationRecency.timestampSource,
          timestampIssue: irrigationRecency.timestampIssue,
          ageHours: irrigationRecency.ageHours,
          freshness: irrigationRecency.freshness,
          usedInScoring: irrigationRecency.freshness !== "STALE",
          usageNote:
            irrigationRecency.timestampIssue
              ? "The irrigation observation time is invalid or in the future; this record is displayed but is not used as current irrigation evidence."
              : irrigationRecency.freshness === "STALE"
              ? "The irrigation advice is stale and is not used for current irrigation urgency."
              : irrigationRecency.timestampSource === "createdAt"
                ? "Legacy record has no observation date; freshness uses its creation time. Usable irrigation evidence influences growing-crop actions."
                : "Freshness uses the field observation date (UTC midnight for date-only input). Usable irrigation urgency and water-stress fields influence growing-crop actions.",
          data: {
            growthStage: irrigation.inputs.growthStage,
            irrigationRequired: irrigation.result.irrigationRequired,
            decisionCode: irrigation.result.decisionCode,
            recommendedTiming: irrigation.result.recommendedTiming,
            waterStress: irrigation.result.waterStress,
            soilMoistureStatus: irrigation.result.soilMoistureStatus,
            referenceET: irrigation.result.referenceET,
            cropWaterRequirement: irrigation.result.cropWaterRequirement,
            estimatedIrrigationNeed: irrigation.result.estimatedIrrigationNeed,
            effectiveForecastRainfall: irrigation.result.effectiveForecastRainfall,
            units: {
              referenceET: "mm/day",
              cropWaterRequirement: "mm/day",
              estimatedIrrigationNeed: "mm net depth over next 24 hours",
              effectiveForecastRainfall: "mm",
            },
            engineVersion: irrigation.engineVersion,
          },
        }
      : missingEvidence(
          "IrrigationRecord",
          `No Irrigation Advice is stored for ${CROP_DEFINITIONS[selectedCrop].label}.`
        ),
    market: market
      ? {
          status: "AVAILABLE",
          sourceType: "MarketAnalysis",
          sourceId: String(market._id),
          crop: selectedCrop,
          createdAt: toIsoString(market.createdAt),
          ageHours: marketRecordRecency.ageHours,
          freshness: "HISTORICAL_STALE",
          usedInScoring: false,
          usageNote:
            "The 2021 AGMARKNET-origin trend is historical context only and contributes zero current-market score.",
          data: {
            selection: {
              commodity: market.selection.commodity,
              market: market.selection.market,
              district: market.selection.district,
              state: market.selection.state,
              variety: market.selection.variety,
            },
            trend: market.trend.direction,
            percentageChange: market.trend.percentageChange,
            referencePrice: {
              observedDate: toIsoString(market.referencePrice.observedDate),
              minimumPrice: market.referencePrice.minimumPrice,
              modalPrice: market.referencePrice.modalPrice,
              maximumPrice: market.referencePrice.maximumPrice,
              unit: market.selection.unit,
            },
            historicalDateThrough: toIsoString(market.historicalSummary.dateThrough),
            manualScenario: {
              quantityQuintals: market.inputs.quantityQuintals,
              expectedSalePrice: market.inputs.expectedSalePrice,
              estimatedNetReturn: market.profitAnalysis.estimatedNetReturn,
            },
            freshnessStatus: market.dataProvenance.freshnessStatus,
            forecastAvailable: market.forecastAvailable,
            analysisVersion: market.analysisVersion,
            currentSignalAllowed: false,
          },
        }
      : missingEvidence(
          "MarketAnalysis",
          `No Market Analysis is stored for ${CROP_DEFINITIONS[selectedCrop].label}.`
        ),
    inventory: {
      status: matchingListings.length ? "AVAILABLE" : "MISSING",
      sourceType: "CropInventory",
      sourceId: profile ? String(profile._id) : null,
      crop: selectedCrop,
      createdAt: null,
      ageHours: null,
      freshness: "CURRENT_DATABASE",
      usedInScoring: matchingListings.length > 0,
      usageNote: profile
        ? "Crop has no listing-status field; existing matching records are inventory context and are not claimed to be active."
        : "No FarmerProfile exists, so marketplace inventory could not be matched.",
      data: {
        farmerProfileFound: Boolean(profile),
        matchingListingCount: matchingListings.length,
        listings: matchingListings.map((listing) => ({
          cropId: String(listing._id),
          name: listing.name,
          price: listing.price,
          unit: listing.unit,
          stockQuantity: listing.stockQuantity,
          createdAt: toIsoString(listing.createdAt),
          updatedAt: toIsoString(listing.updatedAt),
        })),
      },
    },
  };
};

const createCandidate = (code, status = "SCORED") => ({
  code,
  title: ACTION_DEFINITIONS[code].title,
  status,
  score: null,
  factors: [],
  constraints: [],
});

const addFactor = (candidate, factor, effect, reason, source) => {
  candidate.factors.push({ factor, effect, reason, source });
};

const markCandidate = (candidate, status, reason) => {
  candidate.status = status;
  candidate.score = null;
  candidate.constraints.push(reason);
  addFactor(candidate, "eligibility", 0, reason, "Decision rules");
};

const finalizeCandidate = (candidate) => {
  if (candidate.status === "SCORED") {
    const rawScore = candidate.factors.reduce((sum, factor) => sum + factor.effect, 0);
    candidate.score = Math.max(0, Math.min(100, Math.round(rawScore)));
  }
  return candidate;
};

const isUsableEvidence = (item) =>
  item?.status === "AVAILABLE" && ["FRESH", "OLDER"].includes(item.freshness);

const buildFarmerContext = (input) => {
  const currentSalePrice =
    typeof input.currentSalePrice === "number" ? input.currentSalePrice : null;
  const totalEnteredCosts = input.transportCost + input.storageCost + input.otherCost;
  const grossSaleValue =
    currentSalePrice === null ? null : input.availableQuantity * currentSalePrice;

  return {
    selectedCrop: input.selectedCrop,
    farmState: input.farmState,
    availableQuantity: input.availableQuantity,
    quantityUnit: input.quantityUnit,
    waterAvailability: input.waterAvailability,
    storageAvailable: input.storageAvailable,
    currentSalePrice,
    priceUnit: currentSalePrice === null ? null : `INR/${input.quantityUnit}`,
    transportCost: input.transportCost,
    storageCost: input.storageCost,
    otherCost: input.otherCost,
    grossSaleValue: grossSaleValue === null ? null : Math.round(grossSaleValue * 100) / 100,
    totalEnteredCosts: Math.round(totalEnteredCosts * 100) / 100,
    estimatedNetReturn:
      grossSaleValue === null
        ? null
        : Math.round((grossSaleValue - totalEnteredCosts) * 100) / 100,
    economicsStatus: currentSalePrice === null ? "UNAVAILABLE" : "MANUAL_CURRENT_SCENARIO",
    includesCultivationCost: false,
  };
};

const evaluateDecision = ({ input, evidence, now = new Date() }) => {
  const context = buildFarmerContext(input);
  const diseaseUsable = isUsableEvidence(evidence.disease) && evidence.disease.data.supportedClass;
  const diseaseConcern = diseaseUsable && !evidence.disease.data.isHealthy;
  const diseaseHealthy = diseaseUsable && evidence.disease.data.isHealthy;
  const irrigationUsable = isUsableEvidence(evidence.irrigation);
  const irrigationRequired = irrigationUsable && evidence.irrigation.data.irrigationRequired;
  const irrigateToday =
    irrigationUsable && evidence.irrigation.data.decisionCode === "irrigate_today";
  const irrigateTomorrow =
    irrigationUsable && evidence.irrigation.data.decisionCode === "irrigate_tomorrow";
  const irrigationSafe = irrigationUsable && !evidence.irrigation.data.irrigationRequired;
  const isGrowingContext = ["growing", "harvest_ready"].includes(context.farmState);
  const candidates = [];
  const globalConstraints = [];
  const missingData = [];
  const assumptions = [
    "Decision weights are AgroSphere project-design rules, not scientific constants or probabilities.",
    "Disease confidence represents classification evidence strength, not disease severity.",
    "Farmer-entered quantity, current sale price, water, storage, and costs are accepted as the current scenario.",
    "Cultivation cost is excluded unless the farmer includes it under other cost.",
    "Crop Recommendation is informational for an existing growing or harvested crop.",
    "Historical market-v1 trends contribute zero current-market score and do not predict a future price.",
  ];

  if (evidence.disease.status === "MISSING") {
    missingData.push(evidence.disease.usageNote);
  } else if (evidence.disease.freshness === "STALE") {
    missingData.push("The available Disease Scan is stale and was not used as current evidence.");
  }
  if (evidence.irrigation.status === "MISSING") {
    missingData.push(evidence.irrigation.usageNote);
  } else if (evidence.irrigation.freshness === "STALE") {
    missingData.push("The available Irrigation Advice is stale and was not used for current urgency.");
  }
  if (evidence.market.status === "MISSING") {
    missingData.push(evidence.market.usageNote);
  } else {
    globalConstraints.push(
      "The stored 2021 historical market trend is not used as a current price signal."
    );
  }
  if (evidence.cropRecommendation.status === "MISSING") {
    missingData.push(evidence.cropRecommendation.usageNote);
  }
  if (evidence.inventory.status === "MISSING") {
    missingData.push("No matching marketplace inventory record was found for the selected crop.");
  }
  if (context.farmState !== "growing" && context.currentSalePrice === null) {
    missingData.push(
      "No manual current sale price was provided, so price-based sale evaluation is unavailable."
    );
  }

  const health = createCandidate("CHECK_CROP_HEALTH");
  addFactor(
    health,
    "basePriority",
    SCORE_RULES.CHECK_CROP_HEALTH.base,
    "Crop-health inspection remains a low baseline option because visual model results can be wrong.",
    "Decision rules"
  );
  if (diseaseConcern) {
    addFactor(
      health,
      "supportedDiseaseDetected",
      SCORE_RULES.CHECK_CROP_HEALTH.supportedDisease,
      `Latest supported Disease Scan classified ${evidence.disease.data.condition}; this indicates a health concern but not severity.`,
      "DiseaseScan"
    );
    const confidence = evidence.disease.data.confidence;
    if (confidence >= EVIDENCE_CONFIDENCE_THRESHOLDS.high) {
      addFactor(
        health,
        "classificationEvidenceStrength",
        SCORE_RULES.CHECK_CROP_HEALTH.highClassificationConfidence,
        "Disease classification confidence is at least 0.80, strengthening classification evidence without implying severity.",
        "DiseaseScan"
      );
    } else if (confidence >= EVIDENCE_CONFIDENCE_THRESHOLDS.medium) {
      addFactor(
        health,
        "classificationEvidenceStrength",
        SCORE_RULES.CHECK_CROP_HEALTH.mediumClassificationConfidence,
        "Disease classification confidence is between 0.50 and 0.80; it modestly strengthens classification evidence only.",
        "DiseaseScan"
      );
    } else {
      addFactor(
        health,
        "classificationEvidenceStrength",
        0,
        "Disease classification confidence is below 0.50, so no evidence-strength bonus is added; confirmation remains important.",
        "DiseaseScan"
      );
    }
    addFactor(
      health,
      "diseaseRecency",
      evidence.disease.freshness === "FRESH"
        ? SCORE_RULES.CHECK_CROP_HEALTH.freshEvidence
        : SCORE_RULES.CHECK_CROP_HEALTH.olderEvidence,
      `Disease evidence is ${evidence.disease.freshness.toLowerCase()} (${evidence.disease.ageHours} hours old).`,
      "DiseaseScan"
    );
    if (context.farmState !== "growing") {
      addFactor(
        health,
        "produceQualityGate",
        SCORE_RULES.CHECK_CROP_HEALTH.harvestedQualityCheck,
        "Crop-health confirmation is prioritized before a harvest or sale action.",
        "Decision rules"
      );
    }
  } else if (diseaseHealthy) {
    addFactor(
      health,
      "healthyClassification",
      0,
      `Latest usable Disease Scan classified the leaf as healthy with ${(evidence.disease.data.confidence * 100).toFixed(1)}% model confidence.`,
      "DiseaseScan"
    );
  } else {
    addFactor(
      health,
      "diseaseEvidenceUnavailable",
      0,
      "No usable crop-matched Disease Scan supports a stronger crop-health action.",
      "DiseaseScan"
    );
  }
  candidates.push(finalizeCandidate(health));

  const irrigateNowCandidate = createCandidate("IRRIGATE_NOW");
  if (!isGrowingContext) {
    markCandidate(
      irrigateNowCandidate,
      "NOT_APPLICABLE",
      "Irrigation actions are not evaluated for harvested produce."
    );
  } else if (!irrigationUsable) {
    markCandidate(
      irrigateNowCandidate,
      "INSUFFICIENT_EVIDENCE",
      "Fresh or older crop-matched Irrigation Advice is required to score immediate irrigation."
    );
  } else if (!irrigateToday) {
    markCandidate(
      irrigateNowCandidate,
      "NOT_APPLICABLE",
      "Latest Irrigation Advice does not recommend irrigation today."
    );
  } else if (context.waterAvailability === "unavailable") {
    const reason =
      "Irrigation is urgent, but farmer-entered water availability is unavailable; immediate irrigation is infeasible.";
    markCandidate(irrigateNowCandidate, "BLOCKED", reason);
    globalConstraints.push(reason);
  } else {
    addFactor(
      irrigateNowCandidate,
      "basePriority",
      SCORE_RULES.IRRIGATE_NOW.base,
      "Immediate irrigation has a baseline priority only when current irrigation evidence supports it.",
      "Decision rules"
    );
    addFactor(
      irrigateNowCandidate,
      "irrigationTiming",
      SCORE_RULES.IRRIGATE_NOW.irrigateToday,
      "Latest Irrigation Advice explicitly recommends irrigating today.",
      "IrrigationRecord"
    );
    const stressEffect =
      evidence.irrigation.data.waterStress === "High"
        ? SCORE_RULES.IRRIGATE_NOW.highWaterStress
        : evidence.irrigation.data.waterStress === "Medium"
          ? SCORE_RULES.IRRIGATE_NOW.mediumWaterStress
          : 0;
    addFactor(
      irrigateNowCandidate,
      "waterStress",
      stressEffect,
      `Latest Irrigation Advice reports ${evidence.irrigation.data.waterStress} water stress.`,
      "IrrigationRecord"
    );
    addFactor(
      irrigateNowCandidate,
      "irrigationRecency",
      evidence.irrigation.freshness === "FRESH"
        ? SCORE_RULES.IRRIGATE_NOW.freshEvidence
        : SCORE_RULES.IRRIGATE_NOW.olderEvidence,
      `Irrigation evidence is ${evidence.irrigation.freshness.toLowerCase()} (${evidence.irrigation.ageHours} hours old).`,
      "IrrigationRecord"
    );
    if (context.waterAvailability === "limited") {
      addFactor(
        irrigateNowCandidate,
        "limitedWater",
        SCORE_RULES.IRRIGATE_NOW.limitedWater,
        "Farmer reports limited water, reducing immediate operational feasibility.",
        "Farmer context"
      );
      globalConstraints.push(
        "Water is limited; confirm sufficient supply before following an irrigation action."
      );
    }
  }
  candidates.push(finalizeCandidate(irrigateNowCandidate));

  const irrigateSoonCandidate = createCandidate("IRRIGATE_SOON");
  if (!isGrowingContext) {
    markCandidate(
      irrigateSoonCandidate,
      "NOT_APPLICABLE",
      "Irrigation actions are not evaluated for harvested produce."
    );
  } else if (!irrigationUsable) {
    markCandidate(
      irrigateSoonCandidate,
      "INSUFFICIENT_EVIDENCE",
      "Fresh or older crop-matched Irrigation Advice is required to score upcoming irrigation."
    );
  } else if (!irrigationRequired || irrigateToday) {
    markCandidate(
      irrigateSoonCandidate,
      "NOT_APPLICABLE",
      irrigateToday
        ? "Immediate irrigation is evaluated separately."
        : "Latest Irrigation Advice does not require irrigation soon."
    );
  } else if (context.waterAvailability === "unavailable") {
    const reason =
      "Irrigation is required, but farmer-entered water availability is unavailable.";
    markCandidate(irrigateSoonCandidate, "BLOCKED", reason);
    globalConstraints.push(reason);
  } else {
    addFactor(
      irrigateSoonCandidate,
      "basePriority",
      SCORE_RULES.IRRIGATE_SOON.base,
      "Upcoming irrigation has a baseline priority when stored advice requires water.",
      "Decision rules"
    );
    addFactor(
      irrigateSoonCandidate,
      "irrigationTiming",
      irrigateTomorrow ? SCORE_RULES.IRRIGATE_SOON.irrigateTomorrow : 0,
      irrigateTomorrow
        ? "Latest Irrigation Advice recommends irrigation tomorrow."
        : "Stored advice requires irrigation but does not use the irrigate-tomorrow code.",
      "IrrigationRecord"
    );
    addFactor(
      irrigateSoonCandidate,
      "irrigationRequired",
      SCORE_RULES.IRRIGATE_SOON.irrigationRequired,
      "Latest Irrigation Advice marks irrigation as required.",
      "IrrigationRecord"
    );
    addFactor(
      irrigateSoonCandidate,
      "waterStress",
      ["Medium", "High"].includes(evidence.irrigation.data.waterStress)
        ? SCORE_RULES.IRRIGATE_SOON.waterStress
        : 0,
      `Latest Irrigation Advice reports ${evidence.irrigation.data.waterStress} water stress.`,
      "IrrigationRecord"
    );
    addFactor(
      irrigateSoonCandidate,
      "irrigationRecency",
      evidence.irrigation.freshness === "FRESH"
        ? SCORE_RULES.IRRIGATE_SOON.freshEvidence
        : SCORE_RULES.IRRIGATE_SOON.olderEvidence,
      `Irrigation evidence is ${evidence.irrigation.freshness.toLowerCase()}.`,
      "IrrigationRecord"
    );
    if (context.waterAvailability === "limited") {
      addFactor(
        irrigateSoonCandidate,
        "limitedWater",
        SCORE_RULES.IRRIGATE_SOON.limitedWater,
        "Farmer reports limited water, so supply planning is required.",
        "Farmer context"
      );
    }
  }
  candidates.push(finalizeCandidate(irrigateSoonCandidate));

  const waterConstraintCandidate = createCandidate("ADDRESS_WATER_CONSTRAINT");
  if (!isGrowingContext || !irrigationUsable || !irrigationRequired) {
    markCandidate(
      waterConstraintCandidate,
      "NOT_APPLICABLE",
      "This action applies only when usable irrigation evidence requires water."
    );
  } else if (context.waterAvailability === "adequate") {
    markCandidate(
      waterConstraintCandidate,
      "NOT_APPLICABLE",
      "Farmer reports adequate water, so there is no water-access conflict."
    );
  } else {
    addFactor(
      waterConstraintCandidate,
      "basePriority",
      SCORE_RULES.ADDRESS_WATER_CONSTRAINT.base,
      "A water-access conflict requires an operational response before irrigation can be followed.",
      "Decision rules"
    );
    addFactor(
      waterConstraintCandidate,
      "waterAvailability",
      context.waterAvailability === "unavailable"
        ? SCORE_RULES.ADDRESS_WATER_CONSTRAINT.waterUnavailable
        : SCORE_RULES.ADDRESS_WATER_CONSTRAINT.waterLimited,
      `Farmer reports water as ${context.waterAvailability}.`,
      "Farmer context"
    );
    addFactor(
      waterConstraintCandidate,
      "irrigationUrgency",
      irrigateToday
        ? SCORE_RULES.ADDRESS_WATER_CONSTRAINT.irrigateToday
        : irrigateTomorrow
          ? SCORE_RULES.ADDRESS_WATER_CONSTRAINT.irrigateTomorrow
          : 0,
      irrigateToday
        ? "Stored advice recommends irrigation today, increasing urgency to secure water or local assistance."
        : "Stored advice requires irrigation, so water access should be resolved and conditions reassessed.",
      "IrrigationRecord"
    );
  }
  candidates.push(finalizeCandidate(waterConstraintCandidate));

  const monitorCandidate = createCandidate("CONTINUE_MONITORING");
  if (context.farmState !== "growing") {
    markCandidate(
      monitorCandidate,
      "NOT_APPLICABLE",
      "General crop monitoring is evaluated as a primary action only while the crop is growing."
    );
  } else {
    addFactor(
      monitorCandidate,
      "basePriority",
      SCORE_RULES.CONTINUE_MONITORING.base,
      "A growing crop has a baseline need for continued observation.",
      "Decision rules"
    );
    if (diseaseHealthy) {
      addFactor(
        monitorCandidate,
        "healthyDiseaseEvidence",
        SCORE_RULES.CONTINUE_MONITORING.healthyDiseaseEvidence,
        "Latest usable Disease Scan classified the supported leaf as healthy.",
        "DiseaseScan"
      );
    } else if (diseaseConcern) {
      addFactor(
        monitorCandidate,
        "diseaseConcern",
        SCORE_RULES.CONTINUE_MONITORING.diseaseConcern,
        "A supported disease classification makes simple monitoring insufficient.",
        "DiseaseScan"
      );
    } else {
      addFactor(
        monitorCandidate,
        "missingDiseaseEvidence",
        SCORE_RULES.CONTINUE_MONITORING.missingDiseaseEvidence,
        "No usable crop-matched Disease Scan confirms current leaf condition.",
        "DiseaseScan"
      );
    }
    if (irrigationSafe) {
      addFactor(
        monitorCandidate,
        "irrigationNotRequired",
        SCORE_RULES.CONTINUE_MONITORING.irrigationNotRequired,
        "Latest usable Irrigation Advice does not require irrigation.",
        "IrrigationRecord"
      );
    } else if (irrigationRequired) {
      addFactor(
        monitorCandidate,
        "irrigationRequired",
        SCORE_RULES.CONTINUE_MONITORING.irrigationRequired,
        "Current irrigation evidence requires action beyond simple monitoring.",
        "IrrigationRecord"
      );
    } else {
      addFactor(
        monitorCandidate,
        "missingIrrigationEvidence",
        SCORE_RULES.CONTINUE_MONITORING.missingIrrigationEvidence,
        "No usable crop-matched Irrigation Advice confirms current water needs.",
        "IrrigationRecord"
      );
    }
  }
  candidates.push(finalizeCandidate(monitorCandidate));

  const prepareCandidate = createCandidate("PREPARE_FOR_HARVEST");
  const growingLateSeason =
    context.farmState === "growing" &&
    irrigationUsable &&
    evidence.irrigation.data.growthStage === "late_season";
  if (context.farmState !== "harvest_ready" && !growingLateSeason) {
    markCandidate(
      prepareCandidate,
      "NOT_APPLICABLE",
      "Harvest preparation applies to harvest-ready crops or a growing crop with late-season irrigation evidence."
    );
  } else {
    addFactor(
      prepareCandidate,
      "harvestReadiness",
      context.farmState === "harvest_ready"
        ? SCORE_RULES.PREPARE_FOR_HARVEST.harvestReadyBase
        : SCORE_RULES.PREPARE_FOR_HARVEST.growingLateSeasonBase,
      context.farmState === "harvest_ready"
        ? "Farmer identifies the crop as harvest-ready."
        : "Latest usable Irrigation Advice records the crop in its late-season stage.",
      context.farmState === "harvest_ready" ? "Farmer context" : "IrrigationRecord"
    );
    if (diseaseHealthy) {
      addFactor(
        prepareCandidate,
        "healthyDiseaseEvidence",
        SCORE_RULES.PREPARE_FOR_HARVEST.healthyDiseaseEvidence,
        "Latest usable Disease Scan found a supported healthy leaf condition.",
        "DiseaseScan"
      );
    } else if (diseaseConcern) {
      addFactor(
        prepareCandidate,
        "diseaseConcern",
        SCORE_RULES.PREPARE_FOR_HARVEST.diseaseConcern,
        "A supported disease classification should be confirmed before relying on harvest preparation alone.",
        "DiseaseScan"
      );
    }
    if (irrigationSafe) {
      addFactor(
        prepareCandidate,
        "irrigationNotRequired",
        SCORE_RULES.PREPARE_FOR_HARVEST.irrigationNotRequired,
        "Latest usable Irrigation Advice does not require immediate water action.",
        "IrrigationRecord"
      );
    } else if (irrigateToday) {
      addFactor(
        prepareCandidate,
        "urgentIrrigation",
        SCORE_RULES.PREPARE_FOR_HARVEST.urgentIrrigation,
        "Immediate water urgency should be addressed before optional harvest preparation.",
        "IrrigationRecord"
      );
    }
  }
  candidates.push(finalizeCandidate(prepareCandidate));

  const listCandidate = createCandidate("LIST_FOR_SALE");
  if (context.farmState === "growing") {
    markCandidate(
      listCandidate,
      "BLOCKED",
      "A growing crop is not eligible for a produce-sale listing decision."
    );
  } else if (context.availableQuantity <= 0) {
    markCandidate(
      listCandidate,
      "INSUFFICIENT_EVIDENCE",
      "Available harvested or harvest-ready quantity must be greater than zero."
    );
  } else {
    addFactor(
      listCandidate,
      "farmState",
      context.farmState === "harvested"
        ? SCORE_RULES.LIST_FOR_SALE.harvestedBase
        : SCORE_RULES.LIST_FOR_SALE.harvestReadyBase,
      context.farmState === "harvested"
        ? "Farmer identifies produce as harvested and available."
        : "Farmer identifies the crop as harvest-ready, so sale preparation is operationally relevant.",
      "Farmer context"
    );
    if (context.currentSalePrice !== null) {
      addFactor(
        listCandidate,
        "manualSalePrice",
        SCORE_RULES.LIST_FOR_SALE.manualSalePriceAvailable,
        "Farmer provided a manual current sale price for this scenario.",
        "Farmer context"
      );
    }
    if (!context.storageAvailable) {
      addFactor(
        listCandidate,
        "storageUnavailable",
        SCORE_RULES.LIST_FOR_SALE.storageUnavailable,
        "Farmer reports no storage, increasing the priority of arranging a sale channel.",
        "Farmer context"
      );
    }
    if (evidence.inventory.data.matchingListingCount > 0) {
      addFactor(
        listCandidate,
        "matchingMarketplaceListing",
        SCORE_RULES.LIST_FOR_SALE.matchingMarketplaceListing,
        "A matching marketplace inventory record exists; its active status is not assumed because the schema has no status field.",
        "Crop inventory"
      );
    }
    if (diseaseConcern) {
      addFactor(
        listCandidate,
        "diseaseConcern",
        SCORE_RULES.LIST_FOR_SALE.diseaseConcern,
        "A supported disease classification reduces sale-listing priority until crop condition is confirmed.",
        "DiseaseScan"
      );
    }
  }
  candidates.push(finalizeCandidate(listCandidate));

  const sellCandidate = createCandidate("SELL_NOW");
  if (context.farmState !== "harvested") {
    markCandidate(
      sellCandidate,
      "BLOCKED",
      "SELL_NOW is allowed only for produce the farmer identifies as harvested."
    );
  } else if (context.availableQuantity <= 0 || context.currentSalePrice === null) {
    markCandidate(
      sellCandidate,
      "INSUFFICIENT_EVIDENCE",
      "Harvested quantity and a farmer-entered current sale price are required to score SELL_NOW."
    );
  } else if (diseaseConcern) {
    const reason =
      "A supported disease classification must be inspected and confirmed before a direct sale decision.";
    markCandidate(sellCandidate, "BLOCKED", reason);
    globalConstraints.push(reason);
  } else {
    addFactor(
      sellCandidate,
      "farmState",
      SCORE_RULES.SELL_NOW.base,
      "Farmer identifies produce as harvested and available for a current transaction.",
      "Farmer context"
    );
    addFactor(
      sellCandidate,
      "storageAvailability",
      context.storageAvailable
        ? SCORE_RULES.SELL_NOW.storageAvailable
        : SCORE_RULES.SELL_NOW.storageUnavailable,
      context.storageAvailable
        ? "Storage is available, so immediate sale is not forced by storage feasibility."
        : "Storage is unavailable, increasing current-sale urgency.",
      "Farmer context"
    );
    addFactor(
      sellCandidate,
      "manualEstimatedNetReturn",
      context.estimatedNetReturn > 0
        ? SCORE_RULES.SELL_NOW.positiveEstimatedNetReturn
        : SCORE_RULES.SELL_NOW.nonpositiveEstimatedNetReturn,
      context.estimatedNetReturn > 0
        ? `Farmer-entered current scenario produces a positive estimated net return of INR ${context.estimatedNetReturn}.`
        : `Farmer-entered current scenario produces a non-positive estimated net return of INR ${context.estimatedNetReturn}.`,
      "Farmer context"
    );
    if (diseaseHealthy && evidence.disease.freshness === "FRESH") {
      addFactor(
        sellCandidate,
        "freshHealthyEvidence",
        SCORE_RULES.SELL_NOW.freshHealthyEvidence,
        "A fresh supported Disease Scan classified the leaf as healthy; this is not a quality guarantee.",
        "DiseaseScan"
      );
    }
  }
  candidates.push(finalizeCandidate(sellCandidate));

  const holdCandidate = createCandidate("HOLD_AND_MONITOR");
  if (context.farmState === "growing") {
    markCandidate(
      holdCandidate,
      "NOT_APPLICABLE",
      "Produce holding is not evaluated for a growing crop."
    );
  } else if (!context.storageAvailable) {
    const reason = "HOLD_AND_MONITOR is infeasible because the farmer reports no storage.";
    markCandidate(holdCandidate, "BLOCKED", reason);
    globalConstraints.push(reason);
  } else if (diseaseConcern) {
    const reason =
      "HOLD_AND_MONITOR is blocked until the supported disease classification is inspected and confirmed.";
    markCandidate(holdCandidate, "BLOCKED", reason);
    globalConstraints.push(reason);
  } else {
    addFactor(
      holdCandidate,
      "farmState",
      context.farmState === "harvest_ready"
        ? SCORE_RULES.HOLD_AND_MONITOR.harvestReadyBase
        : SCORE_RULES.HOLD_AND_MONITOR.harvestedBase,
      context.farmState === "harvest_ready"
        ? "Farmer identifies the crop as harvest-ready, so a short reassessment period may be feasible."
        : "Harvested produce can be held only because farmer-confirmed storage is available.",
      "Farmer context"
    );
    addFactor(
      holdCandidate,
      "storageAvailable",
      SCORE_RULES.HOLD_AND_MONITOR.storageAvailable,
      "Farmer reports that storage is available.",
      "Farmer context"
    );
    if (context.grossSaleValue && context.grossSaleValue > 0) {
      const ratio = context.storageCost / context.grossSaleValue;
      if (ratio <= STORAGE_COST_RATIO_THRESHOLDS.lowMaximum) {
        addFactor(
          holdCandidate,
          "storageCostRatio",
          SCORE_RULES.HOLD_AND_MONITOR.lowStorageCostRatio,
          `Entered storage cost is ${(ratio * 100).toFixed(1)}% of the manual gross-sale scenario, within the project-designed low-cost threshold.`,
          "Farmer context"
        );
      } else if (ratio >= STORAGE_COST_RATIO_THRESHOLDS.highMinimum) {
        addFactor(
          holdCandidate,
          "storageCostRatio",
          SCORE_RULES.HOLD_AND_MONITOR.highStorageCostRatio,
          `Entered storage cost is ${(ratio * 100).toFixed(1)}% of the manual gross-sale scenario, meeting the project-designed high-cost threshold.`,
          "Farmer context"
        );
      } else {
        addFactor(
          holdCandidate,
          "storageCostRatio",
          0,
          `Entered storage cost is ${(ratio * 100).toFixed(1)}% of the manual gross-sale scenario, between the scoring thresholds.`,
          "Farmer context"
        );
      }
    } else {
      addFactor(
        holdCandidate,
        "storageEconomics",
        0,
        "No manual current price is available, so storage cost cannot be compared with gross value.",
        "Farmer context"
      );
    }
    if (!diseaseConcern && !irrigateToday) {
      addFactor(
        holdCandidate,
        "noImmediateCropRisk",
        SCORE_RULES.HOLD_AND_MONITOR.noImmediateCropRisk,
        "No usable evidence currently triggers an immediate disease-confirmation or same-day irrigation action.",
        "Decision rules"
      );
    }
    if (evidence.market.status === "AVAILABLE") {
      addFactor(
        holdCandidate,
        "historicalMarketTrend",
        SCORE_RULES.HOLD_AND_MONITOR.staleHistoricalMarketTrend,
        `Stored market trend is ${evidence.market.data.trend}, but its 2021 historical data contributes exactly 0 points and does not predict a price increase.`,
        "MarketAnalysis"
      );
    }
  }
  candidates.push(finalizeCandidate(holdCandidate));

  const scoredCandidates = candidates
    .filter((candidate) => candidate.status === "SCORED")
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return ACTION_TIE_PRIORITY.indexOf(left.code) - ACTION_TIE_PRIORITY.indexOf(right.code);
    });

  if (!scoredCandidates.length) {
    throw new Error("No feasible candidate action could be scored for this context.");
  }

  const top = scoredCandidates[0];
  const rankFactorsByImpact = (factors) =>
    [...factors].sort((left, right) => {
      if (Math.abs(right.effect) !== Math.abs(left.effect)) {
        return Math.abs(right.effect) - Math.abs(left.effect);
      }
      return left.factor.localeCompare(right.factor);
    });
  const why = rankFactorsByImpact(top.factors)
    .slice(0, 5)
    .map((factor) => factor.reason);
  const alternatives = scoredCandidates.slice(1, 4).map((candidate) => ({
    code: candidate.code,
    title: candidate.title,
    score: candidate.score,
    reason:
      rankFactorsByImpact(candidate.factors).find((factor) => factor.effect > 0)
        ?.reason ||
      candidate.factors[0]?.reason ||
      "This action remains a lower-ranked feasible alternative.",
  }));

  return {
    decisionVersion: DECISION_VERSION,
    generatedAt: now.toISOString(),
    selectedCrop: context.selectedCrop,
    selectedCropLabel: CROP_DEFINITIONS[context.selectedCrop].label,
    farmState: context.farmState,
    farmerContext: context,
    nextBestAction: {
      code: top.code,
      title: top.title,
      score: top.score,
    },
    why,
    alternatives,
    candidateActions: candidates,
    evidence,
    constraints: [...new Set(globalConstraints)],
    missingData: [...new Set(missingData)],
    assumptions,
    disclaimer:
      "This explainable priority score is deterministic decision support, not a probability or guarantee. Confirm important crop, irrigation, storage, and sale decisions with current field observations and appropriate local expertise.",
  };
};

const generateDecision = async ({ farmerId, input, now = new Date() }) => {
  const selectedCrop = normalizeCropName(input.selectedCrop);
  if (!selectedCrop) {
    throw new Error("Unsupported crop mapping.");
  }

  const normalizedInput = {
    ...input,
    selectedCrop,
  };
  const evidence = await loadLatestEvidence({
    farmerId,
    selectedCrop,
    now,
  });

  return evaluateDecision({
    input: normalizedInput,
    evidence,
    now,
  });
};

const getEvidencePreview = async ({ farmerId, selectedCrop, now = new Date() }) => {
  const normalizedCrop = normalizeCropName(selectedCrop);
  if (!normalizedCrop) {
    throw new Error("Unsupported crop mapping.");
  }

  return {
    decisionVersion: DECISION_VERSION,
    selectedCrop: normalizedCrop,
    selectedCropLabel: CROP_DEFINITIONS[normalizedCrop].label,
    supportedCrops: getSupportedCrops(),
    evidence: await loadLatestEvidence({
      farmerId,
      selectedCrop: normalizedCrop,
      now,
    }),
  };
};

module.exports = {
  classifyRecency,
  getIrrigationRecency,
  evaluateDecision,
  generateDecision,
  getEvidencePreview,
  getSupportedCrops,
  normalizeCropName,
};
