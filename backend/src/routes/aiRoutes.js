const express = require("express");
const multer = require("multer");

const { getAiHealth } = require("../controllers/aiController");
const {
  createCropRecommendation,
  cropRecommendationValidation,
} = require("../controllers/cropRecommendationController");
const { createDiseaseDetection } = require("../controllers/diseaseDetectionController");
const {
  createDecision,
  decisionEngineValidation,
  decisionEvidenceValidation,
  getDecisionEvidence,
  rejectUnexpectedDecisionFields,
} = require("../controllers/decisionEngineController");
const {
  createIrrigationAdvice,
  irrigationAdviceValidation,
} = require("../controllers/irrigationController");
const {
  createMarketIntelligence,
  marketIntelligenceValidation,
} = require("../controllers/marketIntelligenceController");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

const diseaseImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fields: 0,
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      const error = new Error("Only JPEG, PNG, and WEBP leaf images are supported");
      error.statusCode = 400;
      return cb(error);
    }

    return cb(null, true);
  },
});

const uploadDiseaseImage = (req, res, next) => {
  diseaseImageUpload.single("image")(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: "Leaf image must not exceed 5 MB",
      });
    }

    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Leaf image upload failed",
    });
  });
};

router.get("/health", getAiHealth);
router.post(
  "/crop-recommendation",
  authMiddleware,
  requireRole("FARMER"),
  cropRecommendationValidation,
  createCropRecommendation
);
router.post(
  "/disease-detection",
  authMiddleware,
  requireRole("FARMER"),
  uploadDiseaseImage,
  createDiseaseDetection
);
router.post(
  "/irrigation-advice",
  authMiddleware,
  requireRole("FARMER"),
  irrigationAdviceValidation,
  createIrrigationAdvice
);
router.post(
  "/market-intelligence",
  authMiddleware,
  requireRole("FARMER"),
  marketIntelligenceValidation,
  createMarketIntelligence
);
router.get(
  "/decision-engine/evidence",
  authMiddleware,
  requireRole("FARMER"),
  decisionEvidenceValidation,
  getDecisionEvidence
);
router.post(
  "/decision-engine",
  authMiddleware,
  requireRole("FARMER"),
  rejectUnexpectedDecisionFields,
  decisionEngineValidation,
  createDecision
);

module.exports = router;
