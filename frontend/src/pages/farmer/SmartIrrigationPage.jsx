import { useState } from "react";

import ModuleHeader from "../../components/ui/ModuleHeader";
import ScrollReveal from "../../components/ui/ScrollReveal";
import IrrigationWeatherAssist from "../../components/weather/IrrigationWeatherAssist";
import useResultReveal from "../../hooks/useResultReveal";
import { requestIrrigationAdvice } from "../../services/irrigationService";
import { readWeatherLocation } from "../../utils/weatherLocation";
import {
  WEATHER_ASSISTED_FIELDS,
  getIrrigationWeatherSources,
  getIrrigationWeatherUpdates,
} from "../../utils/irrigationWeatherMapping";

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

const initialFieldSources = {
  minimumTemperature: "manual",
  maximumTemperature: "manual",
  latitude: "manual",
  observationDate: "manual",
  recentRainfall: "manual",
  forecastRainfall: "manual",
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
  const [formState, setFormState] = useState(() => ({
    ...initialFormState,
    latitude: readWeatherLocation()?.latitude ?? "",
  }));
  const [fieldErrors, setFieldErrors] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldSources, setFieldSources] = useState(() => ({
    ...initialFieldSources,
    latitude: readWeatherLocation() ? "saved" : "manual",
  }));
  const resultRef = useResultReveal(result);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((current) => ({ ...current, [name]: value }));
    if (WEATHER_ASSISTED_FIELDS.has(name)) {
      setFieldSources((current) => ({ ...current, [name]: "manual" }));
    }
    setFieldErrors((current) => ({ ...current, [name]: "" }));
    setError("");
    setResult(null);
  };

  const handleWeatherLoaded = (weather) => {
    const updates = getIrrigationWeatherUpdates(weather);
    setFormState((current) => ({ ...current, ...updates }));
    setFieldSources((current) => getIrrigationWeatherSources(current, updates));
    setFieldErrors((current) => ({
      ...current,
      ...Object.fromEntries(Object.keys(updates).map((field) => [field, ""])),
    }));
    setError("");
    setResult(null);
  };

  const renderSourceBadge = (fieldName) => {
    const source = fieldSources[fieldName];
    if (!source) {
      return null;
    }

    const isWeather = source === "weather";
    const label = isWeather
      ? "From Open-Meteo"
      : source === "saved"
        ? "Saved coordinate"
        : source === "retained"
          ? "Retained input · review"
          : "Manual input";

    return (
      <span
        className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-[0.62rem] font-semibold ${
          isWeather
            ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200"
            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        }`}
      >
        {label}
      </span>
    );
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

  const renderNumericField = (fieldName) => {
    const field = NUMERIC_FIELDS.find((item) => item.name === fieldName);

    return (
      <label key={field.name} className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {field.label}
        </span>
        <span className="ml-1 text-[0.68rem] text-slate-400">{field.unit}</span>
        {renderSourceBadge(field.name)}
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
          className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        {fieldErrors[field.name] ? (
          <span className="mt-1 block text-xs text-rose-600 dark:text-rose-400">
            {fieldErrors[field.name]}
          </span>
        ) : null}
      </label>
    );
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Smart Irrigation"
        category="Agronomic Decision Engine"
        method="Hargreaves ETo + crop-stage Kc"
        icon="water"
        tone="water"
        description="Assess crop-water status from editable field observations, optional live weather inputs, and a transparent FAO-style calculation."
      >
        <p className="max-w-4xl text-xs leading-6 text-amber-700 dark:text-amber-300">
          Weather can assist with compatible inputs, but every value remains editable.
          Humidity and wind are shown only as context because the existing Hargreaves ETo
          equation does not use them.
        </p>
      </ModuleHeader>

      <ScrollReveal as="section" className="mx-auto w-full max-w-7xl rounded-3xl border border-sky-200/80 bg-white/90 p-4 shadow-sm dark:border-sky-950 dark:bg-slate-950/80 sm:p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-300">Field observations</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">Build the water-balance context</h2>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <IrrigationWeatherAssist
              latitude={formState.latitude}
              latitudeSource={fieldSources.latitude}
              disabled={isSubmitting}
              onLatitudeChange={handleChange}
              onWeatherLoaded={handleWeatherLoaded}
            />

            <fieldset className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 pb-3 pt-2.5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <legend className="px-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-200">Crop &amp; soil</legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Crop</span>
                  <select name="crop" value={formState.crop} onChange={handleChange} disabled={isSubmitting} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                    {CROP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Growth stage</span>
                  <select name="growthStage" value={formState.growthStage} onChange={handleChange} disabled={isSubmitting} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                    {STAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Soil reference profile</span>
                  <select name="soilType" value={formState.soilType} onChange={handleChange} disabled={isSubmitting} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                    {SOIL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                {renderNumericField("soilMoisture")}
              </div>
            </fieldset>

            <fieldset className="rounded-2xl border border-sky-200 bg-sky-50/70 px-4 pb-3 pt-2.5 dark:border-sky-900/50 dark:bg-sky-950/20">
              <legend className="px-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-800 dark:text-sky-200">Weather</legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {renderNumericField("minimumTemperature")}
                {renderNumericField("maximumTemperature")}
                {renderNumericField("recentRainfall")}
                {renderNumericField("forecastRainfall")}
              </div>
            </fieldset>

            <fieldset className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 pb-3 pt-2.5 dark:border-slate-800 dark:bg-slate-900/60">
              <legend className="px-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-200">Field context</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Observation date</span>{renderSourceBadge("observationDate")}
                  <input type="date" name="observationDate" value={formState.observationDate} onChange={handleChange} required disabled={isSubmitting} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
                  {fieldErrors.observationDate ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.observationDate}</span> : null}
                </label>
                {renderNumericField("daysSinceLastIrrigation")}
              </div>
            </fieldset>

            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              “Rain since moisture reading” prevents double-counting. If the moisture value
              was measured after the latest rain, enter 0 for recent rainfall. This field is
              always manual; today’s provider rain total is not substituted for it.
            </p>

            {error ? (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mx-auto block w-full max-w-sm rounded-2xl bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400 dark:focus-visible:ring-offset-slate-950"
            >
              {isSubmitting
                ? "Analyzing crop-water conditions..."
                : "Calculate irrigation advice"}
            </button>
          </form>
      </ScrollReveal>

      {result ? (
        <div ref={resultRef} className="scroll-mt-24 border-t border-slate-200 pt-6 dark:border-slate-800">
          <ScrollReveal as="section" className="mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border border-sky-900 bg-slate-950 text-white shadow-xl">
            <div>
              <div className="bg-gradient-to-br from-sky-700/35 via-slate-950 to-slate-950 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">Water status</p>
                <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="font-display text-3xl font-bold">{result.waterStress} Stress</p>
                    <h2 className="mt-4 font-display text-4xl font-bold text-white">{result.recommendedTiming}</h2>
                  </div>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getStressClasses(result.waterStress)}`}>
                    Irrigation required: {result.irrigationRequired ? "Yes" : "No"}
                  </span>
                </div>

                <div className="mt-6 grid grid-cols-3 gap-2" aria-label={`Water stress: ${result.waterStress}`}>
                  {["Low", "Medium", "High"].map((level) => (
                    <div key={level} className={`h-2 rounded-full ${level === result.waterStress ? level === "High" ? "bg-rose-400" : level === "Medium" ? "bg-amber-400" : "bg-emerald-400" : "bg-white/10"}`} />
                  ))}
                </div>
              </div>

              <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-4">
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
                  <article key={metric.label} className="rounded-2xl border border-sky-900/60 bg-sky-950/30 p-4">
                    <p className="text-xs text-sky-300">{metric.label}</p>
                    <p className="mt-2 font-display text-xl font-semibold text-white">{metric.value}</p>
                  </article>
                ))}
              </div>

              <div className="mx-6 rounded-2xl bg-white/5 p-4 text-sm leading-7 text-slate-300">
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

              <div className="mx-6 mt-5 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
                  Why?
                </p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-sky-100">
                  {result.reasons.map((reason) => (
                    <li key={reason} className="flex gap-2">
                      <span aria-hidden="true">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {result.warnings?.length ? (
                <div className="mx-6 mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
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

              <details className="mx-6 mt-5 rounded-2xl border border-slate-700 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-200">
                  Calculation assumptions
                </summary>
                <ul className="mt-3 space-y-2 text-xs leading-6 text-slate-400">
                  {result.assumptions.map((assumption) => (
                    <li key={assumption}>• {assumption}</li>
                  ))}
                </ul>
              </details>

              <p className="p-6 text-xs leading-6 text-amber-200">
                This is a decision-support estimate. Actual irrigation requirements can vary
                with field conditions, measurement quality, irrigation efficiency, runoff,
                drainage, crop variety, and local agronomic practices.
              </p>
            </div>
          </ScrollReveal>
        </div>
      ) : null}
    </div>
  );
}
