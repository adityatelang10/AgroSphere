const mongoose = require("mongoose");

const diseaseScanSchema = new mongoose.Schema(
  {
    farmer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    originalFileName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    mimeType: {
      type: String,
      required: true,
      enum: ["image/jpeg", "image/png", "image/webp"],
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 1,
      max: 5 * 1024 * 1024,
    },
    crop: {
      type: String,
      required: true,
      trim: true,
    },
    condition: {
      type: String,
      required: true,
      trim: true,
    },
    predictedClass: {
      type: String,
      required: true,
      trim: true,
    },
    isHealthy: {
      type: Boolean,
      required: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    modelVersion: {
      type: String,
      required: true,
      trim: true,
    },
    supportedClass: {
      type: Boolean,
      required: true,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  }
);

diseaseScanSchema.index({ farmer: 1, createdAt: -1 });

module.exports = mongoose.models.DiseaseScan || mongoose.model("DiseaseScan", diseaseScanSchema);
