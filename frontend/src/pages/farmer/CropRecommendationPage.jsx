import { useState } from "react";

import ModuleHeader from "../../components/ui/ModuleHeader";
import ScrollReveal from "../../components/ui/ScrollReveal";
import useResultReveal from "../../hooks/useResultReveal";
import { requestCropRecommendation } from "../../services/cropRecommendationService";

const FIELD_DEFINITIONS = [
  {
    name: "nitrogen",
    label: "Nitrogen (N)",
    unit: "dataset-scale soil value",
    min: 0,
    max: 300,
    step: "any",
  },
  {
    name: "phosphorus",
    label: "Phosphorus (P)",
    unit: "dataset-scale soil value",
    min: 0,
    max: 300,
    step: "any",
  },
  {
    name: "potassium",
    label: "Potassium (K)",
    unit: "dataset-scale soil value",
    min: 0,
    max: 300,
    step: "any",
  },
  {
    name: "temperature",
    label: "Temperature",
    unit: "°C",
    min: -10,
    max: 60,
    step: "any",
  },
  {
    name: "humidity",
    label: "Relative humidity",
    unit: "%",
    min: 0,
    max: 100,
    step: "any",
  },
  {
    name: "ph",
    label: "Soil pH",
    unit: "unitless (0–14)",
    min: 0,
    max: 14,
    step: "any",
  },
  {
    name: "rainfall",
    label: "Rainfall",
    unit: "mm",
    min: 0,
    max: 5000,
    step: "any",
  },
];

const initialFormState = Object.fromEntries(
  FIELD_DEFINITIONS.map((field) => [field.name, ""])
);

const formatScore = (score) =>
  new Intl.NumberFormat("en-IN", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(Number(score) || 0);

export default function CropRecommendationPage() {
  const [formState, setFormState] = useState(initialFormState);
  const [fieldErrors, setFieldErrors] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const resultRef = useResultReveal(result);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((currentState) => ({ ...currentState, [name]: value }));
    setFieldErrors((currentErrors) => ({ ...currentErrors, [name]: "" }));
    setError("");
    setResult(null);
  };

  const validateAndBuildPayload = () => {
    const nextErrors = {};
    const payload = {};

    FIELD_DEFINITIONS.forEach((field) => {
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

      if (numericValue < field.min || numericValue > field.max) {
        nextErrors[field.name] = `${field.label} must be between ${field.min} and ${field.max}.`;
        return;
      }

      payload[field.name] = numericValue;
    });

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
    setError("");
    setResult(null);

    try {
      const response = await requestCropRecommendation(payload);
      setResult({ ...response, inputs: payload });
    } catch (requestError) {
      if (requestError.status === 503) {
        setError(
          "Crop recommendation service is currently unavailable. Please try again later."
        );
      } else {
        setError(requestError.message || "We could not generate a crop recommendation.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Crop Advisor"
        category="ML Recommendation"
        method="Random Forest"
        icon="crop"
        tone="planning"
        description="Find crop classes suited to the soil nutrients and environmental conditions you enter."
      >
        <p className="max-w-4xl text-xs leading-6 text-amber-700 dark:text-amber-300">
          Dataset note: the source describes N, P, and K as soil-content ratios but does not
          publish a physical measurement unit. Use values on the same dataset scale rather
          than treating them as kg/ha or mg/kg.
        </p>
      </ModuleHeader>

      <ScrollReveal
        as="section"
        className="mx-auto w-full max-w-6xl rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 sm:p-5"
      >
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
                Planning inputs
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
                Describe the growing environment
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              7 observations
            </span>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            {[
              {
                title: "Soil nutrients",
                note: "Dataset-scale N, P, and K values",
                fields: FIELD_DEFINITIONS.slice(0, 3),
                columns: "sm:grid-cols-3",
              },
              {
                title: "Field conditions",
                note: "Local environment and soil reaction",
                fields: FIELD_DEFINITIONS.slice(3),
                columns: "sm:grid-cols-2 lg:grid-cols-4",
              },
            ].map((group, groupIndex) => (
              <fieldset
                key={group.title}
                className={`rounded-2xl border px-4 pb-4 pt-3 ${
                  groupIndex === 0
                    ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20"
                    : "border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/60"
                }`}
              >
                <legend className="px-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-200">
                  {group.title}
                </legend>
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{group.note}</p>
                <div className={`grid gap-3 ${group.columns}`}>
                  {group.fields.map((field) => (
                    <label key={field.name} className="block">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {field.label}
                      </span>
                      <span className="ml-1 text-[0.68rem] text-slate-400">{field.unit}</span>
                      <input
                        type="number"
                        name={field.name}
                        value={formState[field.name]}
                        onChange={handleChange}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        required
                        disabled={isSubmitting}
                        className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                      {fieldErrors[field.name] ? (
                        <span className="mt-1 block text-xs text-rose-600 dark:text-rose-400">
                          {fieldErrors[field.name]}
                        </span>
                      ) : null}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}

            {error ? (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mx-auto block w-full max-w-sm rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400 dark:focus-visible:ring-offset-slate-950"
            >
              {isSubmitting ? "Analyzing farm conditions..." : "Analyze Crop Suitability"}
            </button>
          </form>
      </ScrollReveal>

      {result ? (
        <div ref={resultRef} className="scroll-mt-24 border-t border-slate-200 pt-6 dark:border-slate-800">
          <ScrollReveal
            as="section"
            className="mx-auto w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-5 text-white shadow-xl sm:p-6"
          >
            <div>
              <div className="rounded-3xl border border-lime-300/30 bg-gradient-to-br from-emerald-500/20 to-lime-300/5 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lime-300">
                  Top match
                </p>
                <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                  <h2 className="font-display text-4xl font-bold uppercase tracking-wide sm:text-5xl">
                    {result.recommendedCrop}
                  </h2>
                  <div className="text-left sm:text-right">
                    <p className="font-display text-2xl font-bold text-lime-300">
                      {formatScore(result.recommendations[0]?.score)}
                    </p>
                    <p className="text-xs text-slate-400">Model confidence</p>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Other recommendations
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {result.recommendations.slice(1).map((recommendation, index) => (
                    <article key={recommendation.crop} className="rounded-2xl border border-slate-800 bg-white/5 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-slate-500">#{index + 2}</p>
                          <p className="mt-1 font-semibold text-white">{recommendation.crop}</p>
                        </div>
                        <p className="font-display text-lg font-bold text-emerald-300">
                          {formatScore(recommendation.score)}
                        </p>
                      </div>
                      <p className="mt-1 text-right text-[0.68rem] text-slate-500">Model confidence</p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="mt-6 rounded-2xl bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Based on
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-300">
                  N {result.inputs.nitrogen} · P {result.inputs.phosphorus} · K{" "}
                  {result.inputs.potassium} · {result.inputs.temperature} °C ·{" "}
                  {result.inputs.humidity}% humidity · pH {result.inputs.ph} ·{" "}
                  {result.inputs.rainfall} mm rainfall
                </p>
              </div>

              {result.warnings?.length ? (
                <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
                    Data-range warning
                  </p>
                  {result.warnings.map((warning) => (
                    <p key={warning} className="mt-2 text-xs leading-6 text-amber-100">
                      {warning}
                    </p>
                  ))}
                </div>
              ) : null}

              <p className="mt-6 text-xs leading-6 text-amber-200">
                This ML recommendation should be considered together with local agronomic
                conditions. Model confidence is not a guaranteed chance of crop success or yield.
              </p>
              <span className="mt-4 inline-flex rounded-full border border-slate-700 px-3 py-1 text-[0.68rem] font-semibold text-slate-400">
                {result.modelVersion}
              </span>
            </div>
          </ScrollReveal>
        </div>
      ) : null}
    </div>
  );
}
