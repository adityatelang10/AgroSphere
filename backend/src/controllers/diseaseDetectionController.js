const path = require("path");

const DiseaseScan = require("../models/DiseaseScan");
const { getDiseaseDetection } = require("../services/mlServiceClient");

const detectImageMimeType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) {
    return "image/png";
  }

  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
};

const sanitizeFileName = (value) =>
  path
    .basename(value || "leaf-image")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 255) || "leaf-image";

const createDiseaseDetection = async (req, res, next) => {
  if (!req.file?.buffer?.length) {
    return res.status(400).json({
      success: false,
      message: "A leaf image is required",
    });
  }

  const detectedMimeType = detectImageMimeType(req.file.buffer);
  if (!detectedMimeType) {
    return res.status(400).json({
      success: false,
      message: "The uploaded file is not a supported JPEG, PNG, or WEBP image",
    });
  }

  if (req.file.mimetype !== detectedMimeType) {
    return res.status(400).json({
      success: false,
      message: "The uploaded image content does not match its declared file type",
    });
  }

  try {
    const originalFileName = sanitizeFileName(req.file.originalname);
    const prediction = await getDiseaseDetection({
      buffer: req.file.buffer,
      filename: originalFileName,
      mimeType: detectedMimeType,
    });
    const scan = await DiseaseScan.create({
      farmer: req.user._id,
      originalFileName,
      mimeType: detectedMimeType,
      sizeBytes: req.file.size,
      crop: prediction.crop,
      condition: prediction.condition,
      predictedClass: prediction.predictedClass,
      isHealthy: prediction.isHealthy,
      confidence: prediction.confidence,
      modelVersion: prediction.modelVersion,
      supportedClass: prediction.supportedClass,
    });

    return res.status(200).json({
      success: true,
      scanId: scan._id,
      ...prediction,
    });
  } catch (error) {
    if ([400, 413, 502, 503].includes(error.statusCode)) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
};

module.exports = {
  createDiseaseDetection,
};
