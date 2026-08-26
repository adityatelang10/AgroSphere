const DEFAULT_ML_SERVICE_URL = "http://127.0.0.1:8000";
const DEFAULT_TIMEOUT_MS = 3000;

const getMlServiceUrl = () =>
  (process.env.ML_SERVICE_URL || DEFAULT_ML_SERVICE_URL).replace(/\/+$/, "");

const getTimeoutMs = () => {
  const configuredTimeout = Number(process.env.ML_SERVICE_TIMEOUT_MS);

  if (!Number.isFinite(configuredTimeout) || configuredTimeout <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return configuredTimeout;
};

const createUnavailableError = (cause) => {
  const error = new Error("AI service is currently unavailable");
  error.statusCode = 503;
  error.cause = cause;
  return error;
};

const requestMlService = async (path, options = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getTimeoutMs());
  let response;

  try {
    response = await fetch(`${getMlServiceUrl()}${path}`, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        ...(typeof options.body === "undefined" || typeof options.rawBody !== "undefined"
          ? {}
          : { "Content-Type": "application/json" }),
        ...(options.headers || {}),
      },
      body:
        typeof options.rawBody !== "undefined"
          ? options.rawBody
          : typeof options.body === "undefined"
            ? undefined
            : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    throw createUnavailableError(error);
  }

  let data;

  try {
    data = await response.json();
  } catch (error) {
    const invalidResponseError = new Error("AI service returned an invalid JSON response");
    invalidResponseError.upstreamStatus = response.status;
    invalidResponseError.cause = error;
    throw invalidResponseError;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const upstreamError = new Error(
      typeof data?.detail === "string"
        ? data.detail
        : `AI service returned HTTP ${response.status}`
    );
    upstreamError.upstreamStatus = response.status;
    upstreamError.upstreamData = data;
    throw upstreamError;
  }

  return data;
};

const getMlServiceHealth = async () => {
  try {
    const health = await requestMlService("/health");

    if (health?.status !== "ok" || typeof health?.service !== "string") {
      throw new Error("AI service returned an invalid health response");
    }

    return {
      status: health.status,
      service: health.service,
    };
  } catch (error) {
    throw createUnavailableError(error);
  }
};

const getCropRecommendation = async (inputs) => {
  try {
    const prediction = await requestMlService("/predict/crop", {
      method: "POST",
      body: inputs,
    });

    if (
      prediction?.status !== "ok" ||
      typeof prediction?.modelVersion !== "string" ||
      typeof prediction?.recommendedCrop !== "string" ||
      !Array.isArray(prediction?.recommendations)
    ) {
      const invalidResponseError = new Error(
        "Crop recommendation service returned an invalid response"
      );
      invalidResponseError.statusCode = 502;
      throw invalidResponseError;
    }

    return prediction;
  } catch (error) {
    if (error.upstreamStatus === 422) {
      const validationError = new Error("Invalid crop recommendation input");
      validationError.statusCode = 400;
      validationError.details = error.upstreamData?.detail;
      throw validationError;
    }

    if (error.statusCode === 503 || error.upstreamStatus === 503) {
      const unavailableError = new Error(
        "Crop recommendation service is currently unavailable"
      );
      unavailableError.statusCode = 503;
      unavailableError.cause = error;
      throw unavailableError;
    }

    if (error.statusCode === 502) {
      throw error;
    }

    const predictionError = new Error(
      "Crop recommendation service could not complete the prediction"
    );
    predictionError.statusCode = 502;
    predictionError.cause = error;
    throw predictionError;
  }
};

const getDiseaseDetection = async ({ buffer, filename, mimeType }) => {
  try {
    const formData = new FormData();
    formData.append("image", new Blob([buffer], { type: mimeType }), filename);
    const prediction = await requestMlService("/predict/disease", {
      method: "POST",
      rawBody: formData,
    });

    if (
      prediction?.status !== "ok" ||
      typeof prediction?.modelVersion !== "string" ||
      typeof prediction?.predictedClass !== "string" ||
      typeof prediction?.crop !== "string" ||
      typeof prediction?.condition !== "string" ||
      typeof prediction?.isHealthy !== "boolean" ||
      typeof prediction?.confidence !== "number" ||
      prediction.confidence < 0 ||
      prediction.confidence > 1 ||
      typeof prediction?.supportedClass !== "boolean" ||
      !Array.isArray(prediction?.supportedCrops) ||
      typeof prediction?.guidance !== "string"
    ) {
      const invalidResponseError = new Error(
        "Disease detection service returned an invalid response"
      );
      invalidResponseError.statusCode = 502;
      throw invalidResponseError;
    }

    return prediction;
  } catch (error) {
    if ([400, 415, 422].includes(error.upstreamStatus)) {
      const validationError = new Error(
        typeof error.upstreamData?.detail === "string"
          ? error.upstreamData.detail
          : "Invalid leaf image"
      );
      validationError.statusCode = 400;
      throw validationError;
    }

    if (error.upstreamStatus === 413) {
      const oversizedError = new Error("Leaf image must not exceed 5 MB");
      oversizedError.statusCode = 413;
      throw oversizedError;
    }

    if (error.statusCode === 503 || error.upstreamStatus === 503) {
      const unavailableError = new Error(
        "Disease detection service is currently unavailable"
      );
      unavailableError.statusCode = 503;
      unavailableError.cause = error;
      throw unavailableError;
    }

    if (error.statusCode === 502) {
      throw error;
    }

    const predictionError = new Error(
      "Disease detection service could not complete the prediction"
    );
    predictionError.statusCode = 502;
    predictionError.cause = error;
    throw predictionError;
  }
};

const getIrrigationAdvice = async (inputs) => {
  try {
    const advice = await requestMlService("/predict/irrigation", {
      method: "POST",
      body: inputs,
    });

    const numericFields = [
      "referenceET",
      "cropCoefficient",
      "cropWaterRequirement",
      "effectiveRecentRainfall",
      "effectiveForecastRainfall",
      "estimatedIrrigationNeed",
      "depletionFraction",
      "allowableDepletionFraction",
    ];

    if (
      advice?.status !== "ok" ||
      typeof advice?.engineVersion !== "string" ||
      typeof advice?.method !== "string" ||
      typeof advice?.irrigationRequired !== "boolean" ||
      typeof advice?.decisionCode !== "string" ||
      typeof advice?.recommendedTiming !== "string" ||
      !["Low", "Medium", "High"].includes(advice?.waterStress) ||
      !["Low", "Moderate", "Adequate", "High"].includes(
        advice?.soilMoistureStatus
      ) ||
      numericFields.some(
        (field) => typeof advice?.[field] !== "number" || !Number.isFinite(advice[field])
      ) ||
      !Array.isArray(advice?.reasons) ||
      !Array.isArray(advice?.assumptions) ||
      !Array.isArray(advice?.warnings) ||
      typeof advice?.units !== "object" ||
      !Array.isArray(advice?.supportedCrops) ||
      !Array.isArray(advice?.supportedStages)
    ) {
      const invalidResponseError = new Error(
        "Irrigation advisor returned an invalid response"
      );
      invalidResponseError.statusCode = 502;
      throw invalidResponseError;
    }

    return advice;
  } catch (error) {
    if (error.upstreamStatus === 422) {
      const validationError = new Error("Invalid irrigation advice input");
      validationError.statusCode = 400;
      validationError.details = error.upstreamData?.detail;
      throw validationError;
    }

    if (error.statusCode === 503 || error.upstreamStatus === 503) {
      const unavailableError = new Error(
        "Irrigation advisor is currently unavailable"
      );
      unavailableError.statusCode = 503;
      unavailableError.cause = error;
      throw unavailableError;
    }

    if (error.statusCode === 502) {
      throw error;
    }

    const adviceError = new Error(
      "Irrigation advisor could not complete the calculation"
    );
    adviceError.statusCode = 502;
    adviceError.cause = error;
    throw adviceError;
  }
};

const getMarketIntelligence = async (inputs) => {
  try {
    const analysis = await requestMlService("/analyze/market", {
      method: "POST",
      body: inputs,
    });

    const validHistory =
      Array.isArray(analysis?.history) &&
      analysis.history.length > 0 &&
      analysis.history.every(
        (item) =>
          typeof item?.observedDate === "string" &&
          typeof item?.minimumPrice === "number" &&
          Number.isFinite(item.minimumPrice) &&
          typeof item?.maximumPrice === "number" &&
          Number.isFinite(item.maximumPrice) &&
          typeof item?.modalPrice === "number" &&
          Number.isFinite(item.modalPrice)
      );

    if (
      analysis?.status !== "ok" ||
      analysis?.analysisVersion !== "market-v1" ||
      typeof analysis?.selection?.marketKey !== "string" ||
      analysis?.selection?.unit !== "INR/quintal" ||
      typeof analysis?.referencePrice?.observedDate !== "string" ||
      typeof analysis?.referencePrice?.modalPrice !== "number" ||
      typeof analysis?.historicalSummary?.observationCount !== "number" ||
      !["Rising", "Stable", "Falling"].includes(analysis?.trend?.direction) ||
      typeof analysis?.trend?.percentageChange !== "number" ||
      !validHistory ||
      analysis?.forecast?.available !== false ||
      analysis?.forecast?.status !== "UNAVAILABLE" ||
      analysis?.profitAnalysis?.status !== "MANUAL_SCENARIO" ||
      typeof analysis?.profitAnalysis?.grossSaleValue !== "number" ||
      typeof analysis?.profitAnalysis?.totalEnteredCosts !== "number" ||
      typeof analysis?.profitAnalysis?.estimatedNetReturn !== "number" ||
      analysis?.dataProvenance?.status !== "HISTORICAL" ||
      analysis?.dataProvenance?.freshnessStatus !== "STALE_HISTORICAL" ||
      typeof analysis?.dataProvenance?.source !== "string" ||
      typeof analysis?.dataProvenance?.officialCatalogUrl !== "string" ||
      !Array.isArray(analysis?.supportedSelections) ||
      typeof analysis?.disclaimer !== "string"
    ) {
      const invalidResponseError = new Error(
        "Market intelligence service returned an invalid response"
      );
      invalidResponseError.statusCode = 502;
      throw invalidResponseError;
    }

    return analysis;
  } catch (error) {
    if ([400, 404, 422].includes(error.upstreamStatus)) {
      const validationError = new Error(
        typeof error.upstreamData?.detail === "string"
          ? error.upstreamData.detail
          : "Invalid market intelligence input"
      );
      validationError.statusCode = 400;
      validationError.details = error.upstreamData?.detail;
      throw validationError;
    }

    if (error.statusCode === 503 || error.upstreamStatus === 503) {
      const unavailableError = new Error(
        "Market intelligence data is currently unavailable"
      );
      unavailableError.statusCode = 503;
      unavailableError.cause = error;
      throw unavailableError;
    }

    if (error.statusCode === 502) {
      throw error;
    }

    const analysisError = new Error(
      "Market intelligence service could not complete the analysis"
    );
    analysisError.statusCode = 502;
    analysisError.cause = error;
    throw analysisError;
  }
};

module.exports = {
  getCropRecommendation,
  getDiseaseDetection,
  getIrrigationAdvice,
  getMarketIntelligence,
  getMlServiceHealth,
};
