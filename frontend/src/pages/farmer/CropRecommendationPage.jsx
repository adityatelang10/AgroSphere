import { useState } from "react";

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

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((currentState) => ({ ...currentState, [name]: value }));
    setFieldErrors((currentErrors) => ({ ...currentErrors, [name]: "" }));
    setError("");
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
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-white/60 bg-white/85 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/75 sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
          AI Crop Recommendation
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold text-slate-950 dark:text-slate-50">
          Match farm conditions with suitable crops.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
          Enter values from your soil and local climate observations. AgroSphere compares
          them with a trained crop-classification model and ranks its three strongest crop
          classes.
        </p>
        <p className="mt-3 max-w-3xl text-xs leading-6 text-amber-700 dark:text-amber-300">
          Dataset note: the source describes N, P, and K as soil-content ratios but does not
          publish a physical measurement unit. Use values on the same dataset scale rather
          than treating them as kg/ha or mg/kg.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <section className="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
          <h2 className="font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
            Farm conditions
          </h2>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-5 sm:grid-cols-2">
            {FIELD_DEFINITIONS.map((field) => (
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
                  step={field.step}
                  required
                  disabled={isSubmitting}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                {fieldErrors[field.name] ? (
                  <span className="mt-1 block text-xs text-rose-600 dark:text-rose-400">
                    {fieldErrors[field.name]}
                  </span>
                ) : null}
              </label>
            ))}

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
              {isSubmitting ? "Analyzing farm conditions..." : "Recommend crops"}
            </button>
          </form>
        </section>

        <section className="rounded-[2rem] border border-white/60 bg-slate-950 p-6 text-white shadow-xl dark:border-slate-800">
          {!result ? (
            <div className="flex min-h-[28rem] flex-col items-center justify-center text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-emerald-500 to-lime-400 text-4xl text-slate-950">
                &#127793;
              </div>
              <h2 className="mt-6 font-display text-2xl font-semibold">
                Your recommendation will appear here
              </h2>
              <p className="mt-3 max-w-md text-sm leading-7 text-slate-400">
                Complete all seven inputs. No weather, market price, profit, irrigation, or
                disease data is used in this Task 3 model.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lime-300">
                Recommended crop
              </p>
              <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-wide">
                {result.recommendedCrop}
              </h2>
              <p className="mt-2 text-xs text-slate-400">Model version: {result.modelVersion}</p>

              <div className="mt-7 space-y-3">
                <h3 className="text-sm font-semibold text-white">Top recommendations</h3>
                {result.recommendations.map((recommendation, index) => (
                  <article
                    key={recommendation.crop}
                    className="rounded-2xl border border-slate-700 bg-slate-900 p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs text-slate-500">#{index + 1}</p>
                        <p className="mt-1 font-semibold text-white">{recommendation.crop}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-lime-300">
                          {formatScore(recommendation.score)}
                        </p>
                        <p className="text-[11px] text-slate-400">Model confidence</p>
                      </div>
                    </div>
                  </article>
                ))}
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
                This is an AI-assisted recommendation and should be considered together with
                local agronomic conditions. Model confidence is not a guaranteed chance of crop
                success or yield.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
