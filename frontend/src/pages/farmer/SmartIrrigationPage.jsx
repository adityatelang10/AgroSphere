import { useState } from "react";

import { requestIrrigationAdvice } from "../../services/irrigationService";

const CROP_OPTIONS = [
  { value: "tomato", label: "Tomato" },
  { value: "maize", label: "Maize (field grain)" },
  { value: "cotton", label: "Cotton" },
  { value: "groundnut", label: "Groundnut (peanut)" },
];

const STAGE_OPTIONS = [
  { value: "initial", label: "Initial" },
  { value: "development", label: "Development" },
  { value: "mid_season", label: "Mid-season" },
  { value: "late_season", label: "Late-season" },
];

const SOIL_OPTIONS = [
  { value: "loamy_sand", label: "Loamy Sand" },
  { value: "silt", label: "Silt" },
  { value: "silty_clay", label: "Silty Clay" },
];

const NUMERIC_FIELDS = [
  {
    name: "soilMoisture",
    label: "Current soil moisture",
    unit: "% volumetric",
    min: 0,
    max: 100,
  },
  {
    name: "minimumTemperature",
    label: "Minimum temperature",
    unit: "°C",
    min: -20,
    max: 55,
  },
  {
    name: "maximumTemperature",
    label: "Maximum temperature",
    unit: "°C",
    min: -15,
    max: 60,
  },
  {
    name: "latitude",
    label: "Field latitude",
    unit: "degrees (North +)",
    min: -55,
    max: 55,
  },
  {
    name: "recentRainfall",
    label: "Rain since moisture reading",
    unit: "mm",
    min: 0,
    max: 300,
  },
  {
    name: "forecastRainfall",
    label: "Expected rain, next 24 hours",
    unit: "mm",
    min: 0,
    max: 300,
  },
  {
    name: "daysSinceLastIrrigation",
    label: "Days since last irrigation",
    unit: "whole days",
    min: 0,
    max: 60,
    integer: true,
  },
];

const getLocalDate = () => {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 10);
};

const initialFormState = {
  crop: "tomato",
  growthStage: "mid_season",
  soilType: "silt",
  soilMoisture: "",
  minimumTemperature: "",
  maximumTemperature: "",
  latitude: "",
  observationDate: getLocalDate(),
  recentRainfall: "0",
  forecastRainfall: "0",
  daysSinceLastIrrigation: "",
};

const formatNumber = (value, digits = 2) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(Number(value) || 0);

const getStressClasses = (stress) => {
  if (stress === "High") {
    return "bg-rose-500/20 text-rose-200";
  }

  if (stress === "Medium") {
    return "bg-amber-500/20 text-amber-200";
  }

  return "bg-emerald-500/20 text-emerald-200";
};

export default function SmartIrrigationPage() {
  const [formState, setFormState] = useState(initialFormState);
  const [fieldErrors, setFieldErrors] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: "" }));
    setError("");
    setResult(null);
  };

  const validateAndBuildPayload = () => {
    const nextErrors = {};
    const payload = {
      crop: formState.crop,
      growthStage: formState.growthStage,
      soilType: formState.soilType,
      observationDate: formState.observationDate,
    };

    if (!formState.observationDate) {
      nextErrors.observationDate = "Observation date is required.";
    }

    NUMERIC_FIELDS.forEach((field) => {
      const rawValue = formState[field.name];

      if (rawValue === "") {
        nextErrors[field.name] = `${field.label} is required.`;
        return;
      }

      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        nextErrors[field.name] = `${field.label} must be a valid number.`;
        return;
      }

      if (field.integer && !Number.isInteger(numericValue)) {
        nextErrors[field.name] = `${field.label} must be a whole number.`;
        return;
      }

      if (numericValue < field.min || numericValue > field.max) {
        nextErrors[field.name] = `${field.label} must be between ${field.min} and ${field.max}.`;
        return;
      }

      payload[field.name] = numericValue;
    });

    if (
      !nextErrors.minimumTemperature &&
      !nextErrors.maximumTemperature &&
      payload.maximumTemperature <= payload.minimumTemperature
    ) {
      nextErrors.maximumTemperature =
        "Maximum temperature must be greater than minimum temperature.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0 ? payload : null;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = validateAndBuildPayload();

    if (!payload || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setResult(null);
    setError("");

    try {
      const response = await requestIrrigationAdvice(payload);
      setResult(response);
    } catch (requestError) {
      if (requestError.status === 503) {
        setError(
          "Irrigation advisor is currently unavailable. Please try again later."
        );
      } else {
        setError(requestError.message || "We could not calculate irrigation advice.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-white/60 bg-white/85 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/75 sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
          Smart Irrigation Advisor
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold text-slate-950 dark:text-slate-50">
          Understand when crop water needs attention.
        </h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-600 dark:text-slate-300">
          AgroSphere uses a transparent FAO-style crop-water calculation: Hargreaves
          reference evapotranspiration, a crop-stage coefficient, rainfall, and soil-water
          stress. This is a deterministic agronomic engine, not a trained ML classifier.
        </p>
        <p className="mt-3 max-w-4xl text-xs leading-6 text-amber-700 dark:text-amber-300">
          Enter manual field observations. Humidity is intentionally not requested because
          the selected Hargreaves ETo equation does not use it; wind, radiation, and
          automatic weather data are not available in this version.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.08fr,0.92fr]">
        <section className="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
          <h2 className="font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
            Crop and field conditions
          </h2>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Crop
              </span>
              <select
                name="crop"
                value={formState.crop}
                onChange={handleChange}
                disabled={isSubmitting}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {CROP_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Growth stage
              </span>
              <select
                name="growthStage"
                value={formState.growthStage}
                onChange={handleChange}
                disabled={isSubmitting}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {STAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Soil reference profile
              </span>
              <select
                name="soilType"
                value={formState.soilType}
                onChange={handleChange}
                disabled={isSubmitting}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {SOIL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Observation date
              </span>
              <input
                type="date"
                name="observationDate"
                value={formState.observationDate}
                onChange={handleChange}
                required
                disabled={isSubmitting}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              {fieldErrors.observationDate ? (
                <span className="mt-1 block text-xs text-rose-600">
                  {fieldErrors.observationDate}
                </span>
              ) : null}
            </label>

            {NUMERIC_FIELDS.map((field) => (
              <label key={field.name} className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {field.label}
                </span>
                <span className="ml-2 text-xs text-slate-400">{field.unit}</span>
                <input
                  type="number"
                  name={field.name}
                  value={formState[field.name]}
                  onChange={handleChange}
                  min={field.min}
                  max={field.max}
                  step={field.integer ? 1 : "any"}
                  required
                  disabled={isSubmitting}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                {fieldErrors[field.name] ? (
                  <span className="mt-1 block text-xs text-rose-600 dark:text-rose-400">
                    {fieldErrors[field.name]}
                  </span>
                ) : null}
              </label>
            ))}

            <p className="text-xs leading-6 text-slate-500 dark:text-slate-400 sm:col-span-2">
              “Rain since moisture reading” prevents double-counting. If the moisture value
              was measured after the latest rain, enter 0 for recent rainfall.
            </p>

            {error ? (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 sm:col-span-2">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-400 sm:col-span-2"
            >
              {isSubmitting
                ? "Analyzing crop-water conditions..."
                : "Calculate irrigation advice"}
            </button>
          </form>
        </section>

        <section className="rounded-[2rem] border border-white/60 bg-slate-950 p-6 text-white shadow-xl dark:border-slate-800">
          {!result ? (
            <div className="flex min-h-[44rem] flex-col justify-center">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lime-300">
                Transparent decision support
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold">
                Your irrigation recommendation will appear here.
              </h2>
              <div className="mt-7 space-y-3 text-sm leading-7 text-slate-400">
                <p>1. Hargreaves estimates reference ETo from temperature and solar geometry.</p>
                <p>2. Crop-stage Kc converts ETo into crop water requirement.</p>
                <p>3. Soil moisture and crop depletion limits determine water stress.</p>
                <p>4. Effective rainfall and recent irrigation influence timing.</p>
              </div>
              <p className="mt-7 text-xs leading-6 text-amber-200">
                Supported crops: Tomato, field Maize, Cotton, and Groundnut. Paddy Rice is
                intentionally excluded because it requires a specialised flooded-field water
                balance.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lime-300">
                Irrigation recommendation
              </p>
              <h2 className="mt-3 font-display text-4xl font-bold">
                {result.recommendedTiming}
              </h2>

              <div className="mt-5 flex flex-wrap gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    result.irrigationRequired
                      ? "bg-sky-500/20 text-sky-200"
                      : "bg-emerald-500/20 text-emerald-200"
                  }`}
                >
                  Irrigation required: {result.irrigationRequired ? "Yes" : "No"}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${getStressClasses(
                    result.waterStress
                  )}`}
                >
                  Water stress: {result.waterStress}
                </span>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  {
                    label: "Reference ETo",
                    value: `${formatNumber(result.referenceET)} mm/day`,
                  },
                  {
                    label: "Crop coefficient",
                    value: formatNumber(result.cropCoefficient, 3),
                  },
                  {
                    label: "Crop water requirement",
                    value: `${formatNumber(result.cropWaterRequirement)} mm/day`,
                  },
                  {
                    label: "Estimated net need",
                    value: `${formatNumber(result.estimatedIrrigationNeed)} mm`,
                  },
                ].map((metric) => (
                  <article key={metric.label} className="rounded-2xl bg-white/5 p-4">
                    <p className="text-xs text-slate-500">{metric.label}</p>
                    <p className="mt-2 text-lg font-semibold text-white">{metric.value}</p>
                  </article>
                ))}
              </div>

              <div className="mt-5 rounded-2xl bg-white/5 p-4 text-sm leading-7 text-slate-300">
                <p>
                  <span className="text-slate-500">Soil moisture status:</span>{" "}
                  {result.soilMoistureStatus}
                </p>
                <p>
                  <span className="text-slate-500">Effective recent rain:</span>{" "}
                  {formatNumber(result.effectiveRecentRainfall)} mm
                </p>
                <p>
                  <span className="text-slate-500">Effective forecast rain:</span>{" "}
                  {formatNumber(result.effectiveForecastRainfall)} mm
                </p>
                <p>
                  <span className="text-slate-500">Engine:</span> {result.engineVersion}
                </p>
              </div>

              <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  Why?
                </p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-emerald-100">
                  {result.reasons.map((reason) => (
                    <li key={reason} className="flex gap-2">
                      <span aria-hidden="true">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {result.warnings?.length ? (
                <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
                    Check these inputs
                  </p>
                  {result.warnings.map((warning) => (
                    <p key={warning} className="mt-2 text-xs leading-6 text-amber-100">
                      {warning}
                    </p>
                  ))}
                </div>
              ) : null}

              <details className="mt-5 rounded-2xl border border-slate-700 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-200">
                  Calculation assumptions
                </summary>
                <ul className="mt-3 space-y-2 text-xs leading-6 text-slate-400">
                  {result.assumptions.map((assumption) => (
                    <li key={assumption}>• {assumption}</li>
                  ))}
                </ul>
              </details>

              <p className="mt-6 text-xs leading-6 text-amber-200">
                This is a decision-support estimate. Actual irrigation requirements can vary
                with field conditions, measurement quality, irrigation efficiency, runoff,
                drainage, crop variety, and local agronomic practices.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
