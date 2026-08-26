const DECISION_VERSION = "decision-v1";

const FARM_STATES = ["growing", "harvest_ready", "harvested"];
const WATER_AVAILABILITY = ["adequate", "limited", "unavailable"];
const QUANTITY_UNITS = [
  "kg",
  "gram",
  "quintal",
  "dozen",
  "piece",
  "bundle",
  "packet",
  "litre",
];

const CROP_DEFINITIONS = {
  tomato: {
    label: "Tomato",
    aliases: [
      "tomato",
      "tomatoes",
      "organic tomato",
      "organic tomatoes",
      "organic tomatos",
    ],
  },
  maize: {
    label: "Maize",
    aliases: ["maize", "field maize", "corn"],
  },
  groundnut: {
    label: "Groundnut",
    aliases: [
      "groundnut",
      "groundnuts",
      "groundnut/peanut",
      "peanut",
      "peanuts",
    ],
  },
  cotton: {
    label: "Cotton",
    aliases: ["cotton"],
  },
  potato: {
    label: "Potato",
    aliases: ["potato", "potatoes"],
  },
  bell_pepper: {
    label: "Bell Pepper",
    aliases: ["bell pepper", "pepper bell", "pepper, bell", "capsicum"],
  },
  rice: {
    label: "Rice",
    aliases: ["rice", "paddy rice"],
  },
  mango: {
    label: "Mango",
    aliases: ["mango", "mangoes"],
  },
  watermelon: {
    label: "Watermelon",
    aliases: [
      "watermelon",
      "water melon",
      "organic watermelon",
      "organic water melon",
    ],
  },
};

const RECENCY_THRESHOLDS_HOURS = {
  disease: {
    fresh: 24,
    older: 7 * 24,
  },
  irrigation: {
    fresh: 24,
    older: 72,
  },
  cropRecommendation: {
    fresh: 30 * 24,
    older: 90 * 24,
  },
  marketRecord: {
    fresh: 24,
    older: 7 * 24,
  },
};

const ACTION_DEFINITIONS = {
  ADDRESS_WATER_CONSTRAINT: {
    title: "Secure water access and reassess",
  },
  IRRIGATE_NOW: {
    title: "Irrigate today",
  },
  CHECK_CROP_HEALTH: {
    title: "Inspect and confirm crop health",
  },
  IRRIGATE_SOON: {
    title: "Plan irrigation soon",
  },
  PREPARE_FOR_HARVEST: {
    title: "Prepare for harvest",
  },
  SELL_NOW: {
    title: "Use the current offer and sell",
  },
  LIST_FOR_SALE: {
    title: "Prepare or update a sale listing",
  },
  HOLD_AND_MONITOR: {
    title: "Hold safely and reassess",
  },
  CONTINUE_MONITORING: {
    title: "Continue crop monitoring",
  },
};

const ACTION_TIE_PRIORITY = [
  "ADDRESS_WATER_CONSTRAINT",
  "IRRIGATE_NOW",
  "CHECK_CROP_HEALTH",
  "IRRIGATE_SOON",
  "PREPARE_FOR_HARVEST",
  "SELL_NOW",
  "LIST_FOR_SALE",
  "HOLD_AND_MONITOR",
  "CONTINUE_MONITORING",
];

// These are AgroSphere project-design weights, not scientific constants.
const SCORE_RULES = {
  CHECK_CROP_HEALTH: {
    base: 10,
    supportedDisease: 55,
    highClassificationConfidence: 10,
    mediumClassificationConfidence: 5,
    freshEvidence: 10,
    olderEvidence: 5,
    harvestedQualityCheck: 10,
  },
  IRRIGATE_NOW: {
    base: 10,
    irrigateToday: 60,
    highWaterStress: 20,
    mediumWaterStress: 10,
    freshEvidence: 10,
    olderEvidence: 4,
    limitedWater: -25,
  },
  IRRIGATE_SOON: {
    base: 10,
    irrigateTomorrow: 55,
    irrigationRequired: 15,
    waterStress: 10,
    freshEvidence: 10,
    olderEvidence: 5,
    limitedWater: -20,
  },
  ADDRESS_WATER_CONSTRAINT: {
    base: 20,
    waterUnavailable: 60,
    waterLimited: 35,
    irrigateToday: 20,
    irrigateTomorrow: 10,
  },
  CONTINUE_MONITORING: {
    base: 30,
    healthyDiseaseEvidence: 20,
    irrigationNotRequired: 20,
    diseaseConcern: -35,
    irrigationRequired: -35,
    missingDiseaseEvidence: -5,
    missingIrrigationEvidence: -5,
  },
  PREPARE_FOR_HARVEST: {
    harvestReadyBase: 45,
    growingLateSeasonBase: 25,
    healthyDiseaseEvidence: 15,
    irrigationNotRequired: 10,
    diseaseConcern: -25,
    urgentIrrigation: -20,
  },
  LIST_FOR_SALE: {
    harvestedBase: 45,
    harvestReadyBase: 40,
    manualSalePriceAvailable: 15,
    storageUnavailable: 15,
    matchingMarketplaceListing: 5,
    diseaseConcern: -20,
  },
  SELL_NOW: {
    base: 40,
    storageUnavailable: 30,
    positiveEstimatedNetReturn: 15,
    nonpositiveEstimatedNetReturn: -20,
    freshHealthyEvidence: 10,
    storageAvailable: -5,
  },
  HOLD_AND_MONITOR: {
    harvestReadyBase: 45,
    harvestedBase: 30,
    storageAvailable: 5,
    lowStorageCostRatio: 10,
    highStorageCostRatio: -15,
    noImmediateCropRisk: 10,
    staleHistoricalMarketTrend: 0,
  },
};

const EVIDENCE_CONFIDENCE_THRESHOLDS = {
  high: 0.8,
  medium: 0.5,
};

const STORAGE_COST_RATIO_THRESHOLDS = {
  lowMaximum: 0.05,
  highMinimum: 0.1,
};

module.exports = {
  ACTION_DEFINITIONS,
  ACTION_TIE_PRIORITY,
  CROP_DEFINITIONS,
  DECISION_VERSION,
  EVIDENCE_CONFIDENCE_THRESHOLDS,
  FARM_STATES,
  QUANTITY_UNITS,
  RECENCY_THRESHOLDS_HOURS,
  SCORE_RULES,
  STORAGE_COST_RATIO_THRESHOLDS,
  WATER_AVAILABILITY,
};
