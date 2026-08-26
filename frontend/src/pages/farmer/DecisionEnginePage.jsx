import { useEffect, useMemo, useState } from "react";

import {
  getDecisionEvidence,
  requestFarmDecision,
} from "../../services/decisionEngineService";

const CROP_OPTIONS = [
  ["tomato", "Tomato"],
  ["maize", "Maize"],
  ["groundnut", "Groundnut"],
  ["cotton", "Cotton"],
  ["potato", "Potato"],
  ["bell_pepper", "Bell Pepper"],
  ["rice", "Rice"],
  ["mango", "Mango"],
  ["watermelon", "Watermelon"],
];

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

const initialFormState = {
  selectedCrop: "tomato",
  farmState: "growing",
  availableQuantity: "0",
  quantityUnit: "kg",
  waterAvailability: "adequate",
  storageAvailable: "false",
  currentSalePrice: "",
  transportCost: "0",
  storageCost: "0",
  otherCost: "0",
};

const EVIDENCE_LABELS = {
  cropRecommendation: "Crop Recommendation",
  disease: "Disease Scan",
  irrigation: "Irrigation Advice",
  market: "Market Information",
  inventory: "Marketplace Inventory",
};

const formatDateTime = (value) => {
  if (!value) {
    return "No timestamp available";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const formatMoney = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const humanize = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());

const EvidenceCard = ({ evidenceKey, item }) => {
  const isMissing = !item || item.status === "MISSING";
  const freshnessClass =
    item?.freshness === "FRESH"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
      : item?.freshness === "OLDER"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"
        : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200";

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {EVIDENCE_LABELS[evidenceKey]}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isMissing ? item?.usageNote || "No record found." : formatDateTime(item.createdAt)}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[0.68rem] font-semibold ${freshnessClass}`}>
          {isMissing ? "MISSING" : item.freshness.replaceAll("_", " ")}
        </span>
      </div>

      {!isMissing ? (
        <div className="mt-3 space-y-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {evidenceKey === "cropRecommendation" ? (
            <p>
              Recommended: <span className="font-semibold">{item.data.recommendedCrop}</span> · planning information only
            </p>
          ) : null}
          {evidenceKey === "disease" ? (
            <>
              <p>
                {humanize(item.crop)} — <span className="font-semibold">{item.data.condition}</span>
              </p>
              <p>
                Model confidence: {(item.data.confidence * 100).toFixed(1)}% · {item.data.modelVersion}
              </p>
              <p className="text-xs text-slate-500">Confidence is classification strength, not disease severity.</p>
            </>
          ) : null}
          {evidenceKey === "irrigation" ? (
            <>
              <p>
                {item.data.waterStress} water stress · {item.data.recommendedTiming}
              </p>
              <p>{item.data.engineVersion}</p>
            </>
          ) : null}
          {evidenceKey === "market" ? (
            <>
              <p>
                Historical trend: <span className="font-semibold">{item.data.trend}</span> · data through {formatDateTime(item.data.historicalDateThrough)}
              </p>
              <p className="font-medium text-amber-700 dark:text-amber-300">
                Historical reference only — not used as a current market signal.
              </p>
            </>
          ) : null}
          {evidenceKey === "inventory" ? (
            <p>
              {item.data.matchingListingCount} matching inventory record(s). The existing schema does not prove active listing status.
            </p>
          ) : null}
          <p className="pt-1 text-xs text-slate-500 dark:text-slate-400">{item.usageNote}</p>
        </div>
      ) : null}
    </article>
  );
};

export default function DecisionEnginePage() {
  const [formState, setFormState] = useState(initialFormState);
  const [fieldErrors, setFieldErrors] = useState({});
  const [evidencePreview, setEvidencePreview] = useState(null);
  const [evidenceError, setEvidenceError] = useState("");
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let ignore = false;
    setIsLoadingEvidence(true);
    setEvidenceError("");
    setResult(null);

    getDecisionEvidence(formState.selectedCrop)
      .then((response) => {
        if (!ignore) {
          setEvidencePreview(response);
        }
      })
      .catch((requestError) => {
        if (!ignore) {
          setEvidencePreview(null);
          if (requestError.status === 401) {
            setEvidenceError("Your session has expired. Please log in again.");
          } else if (requestError.status === 403) {
            setEvidenceError("Farm Decision is available to farmer accounts only.");
          } else {
            setEvidenceError(requestError.message || "Existing evidence could not be loaded.");
          }
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoadingEvidence(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [formState.selectedCrop]);

  const selectedCropLabel = useMemo(
    () => CROP_OPTIONS.find(([value]) => value === formState.selectedCrop)?.[1],
    [formState.selectedCrop]
  );

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: "" }));
    setError("");
    setResult(null);
  };

  const validateAndBuildPayload = () => {
    const nextErrors = {};
    const quantity = Number(formState.availableQuantity);
    const payload = {
      selectedCrop: formState.selectedCrop,
      farmState: formState.farmState,
      quantityUnit: formState.quantityUnit,
      waterAvailability: formState.waterAvailability,
      storageAvailable: formState.storageAvailable === "true",
    };

    if (!Number.isFinite(quantity) || quantity < 0) {
      nextErrors.availableQuantity = "Quantity must be zero or a positive number.";
    } else if (formState.farmState !== "growing" && quantity <= 0) {
      nextErrors.availableQuantity = "Harvest-ready or harvested produce needs a quantity above zero.";
    } else {
      payload.availableQuantity = quantity;
    }

    ["transportCost", "storageCost", "otherCost"].forEach((field) => {
      const value = Number(formState[field]);
      if (!Number.isFinite(value) || value < 0) {
        nextErrors[field] = "Enter zero or a positive amount.";
      } else {
        payload[field] = value;
      }
    });

    if (formState.currentSalePrice !== "") {
      const price = Number(formState.currentSalePrice);
      if (!Number.isFinite(price) || price <= 0) {
        nextErrors.currentSalePrice = "Current sale price must be greater than zero.";
      } else {
        payload.currentSalePrice = price;
      }
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length ? null : payload;
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
      const response = await requestFarmDecision(payload);
      setResult(response);
      setEvidencePreview(response);
    } catch (requestError) {
      if (requestError.status === 401) {
        setError("Your session has expired. Please log in again.");
      } else if (requestError.status === 403) {
        setError("Farm Decision is available to farmer accounts only.");
      } else {
        const validationMessage = requestError.data?.errors?.[0]?.msg;
        setError(validationMessage || requestError.message || "The decision could not be generated.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const evidence = result?.evidence || evidencePreview?.evidence;

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/60 bg-white/85 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/75 sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
          Explainable Farm Decision Engine
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold text-slate-950 dark:text-slate-50">
          Turn stored farm evidence into one next best action.
        </h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-600 dark:text-slate-300">
          decision-v1 uses transparent Node.js rules, persisted AgroSphere module outputs, and only the current values you enter. It does not call Gemini, predict a future market price, or invent missing farm data.
        </p>
        <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-300">
          Priority score is a deterministic ranking score, not a probability of correctness.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <section className="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
          <h2 className="font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
            Current farm context
          </h2>
          <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
            These fields describe one current scenario. Farmer identity always comes from your authenticated session.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Current crop</span>
              <select name="selectedCrop" value={formState.selectedCrop} onChange={handleChange} disabled={isSubmitting} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                {CROP_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Crop / produce state</span>
              <select name="farmState" value={formState.farmState} onChange={handleChange} disabled={isSubmitting} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <option value="growing">Growing crop</option>
                <option value="harvest_ready">Harvest-ready</option>
                <option value="harvested">Harvested produce</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Available quantity</span>
              <input type="number" name="availableQuantity" value={formState.availableQuantity} onChange={handleChange} min="0" step="any" disabled={isSubmitting} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              {fieldErrors.availableQuantity ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.availableQuantity}</span> : null}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Quantity unit</span>
              <select name="quantityUnit" value={formState.quantityUnit} onChange={handleChange} disabled={isSubmitting} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                {QUANTITY_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Water availability</span>
              <select name="waterAvailability" value={formState.waterAvailability} onChange={handleChange} disabled={isSubmitting} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <option value="adequate">Adequate</option>
                <option value="limited">Limited</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Storage available</span>
              <select name="storageAvailable" value={formState.storageAvailable} onChange={handleChange} disabled={isSubmitting} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Current buyer / listing price</span>
              <span className="ml-2 text-xs text-slate-400">₹ per selected quantity unit · optional</span>
              <input type="number" name="currentSalePrice" value={formState.currentSalePrice} onChange={handleChange} min="0.01" step="any" disabled={isSubmitting} placeholder="Farmer-entered current offer only" className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              {fieldErrors.currentSalePrice ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.currentSalePrice}</span> : null}
            </label>

            {[
              ["transportCost", "Transport cost"],
              ["storageCost", "Storage cost"],
              ["otherCost", "Other entered costs"],
            ].map(([name, label]) => (
              <label key={name} className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
                <span className="ml-2 text-xs text-slate-400">₹ total</span>
                <input type="number" name={name} value={formState[name]} onChange={handleChange} min="0" step="any" disabled={isSubmitting} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                {fieldErrors[name] ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors[name]}</span> : null}
              </label>
            ))}

            <p className="rounded-2xl bg-violet-50 px-4 py-3 text-xs leading-6 text-violet-800 dark:bg-violet-950/30 dark:text-violet-200 sm:col-span-2">
              Manual economics = quantity × your current price − entered transport, storage, and other costs. Cultivation cost is excluded unless you include it under other costs.
            </p>

            {error ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 sm:col-span-2">{error}</p> : null}

            <button type="submit" disabled={isSubmitting || isLoadingEvidence} className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-400 sm:col-span-2">
              {isSubmitting ? "Evaluating candidate actions..." : "Generate Next Best Action"}
            </button>
          </form>
        </section>

        <section className="rounded-[2rem] border border-white/60 bg-slate-950 p-6 text-white shadow-xl dark:border-slate-800">
          {!result ? (
            <div className="flex min-h-[42rem] flex-col justify-center">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-lime-300">Next best action</p>
              <h2 className="mt-3 font-display text-3xl font-semibold">Review evidence and evaluate one current scenario.</h2>
              <div className="mt-7 space-y-3 text-sm leading-7 text-slate-400">
                <p>1. Choose the crop and its real current state.</p>
                <p>2. Enter operational constraints and any current manual price.</p>
                <p>3. Stored disease, irrigation, market, recommendation, and inventory evidence is loaded automatically.</p>
                <p>4. decision-v1 ranks feasible actions and exposes every scoring factor.</p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lime-300">Next best action</p>
              <h2 className="mt-3 font-display text-4xl font-bold">{result.nextBestAction.title}</h2>
              <div className="mt-4 inline-flex rounded-full bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-200">
                Priority Score: {result.nextBestAction.score} / 100
              </div>
              <p className="mt-3 text-xs text-slate-400">{result.decisionVersion} · generated {formatDateTime(result.generatedAt)}</p>

              <div className="mt-7 rounded-2xl bg-white/5 p-5">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Why?</h3>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
                  {result.why.map((reason) => <li key={reason} className="flex gap-3"><span className="text-lime-300">✓</span><span>{reason}</span></li>)}
                </ul>
              </div>

              <div className="mt-5">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Other options</h3>
                <div className="mt-3 space-y-3">
                  {result.alternatives.map((alternative, index) => (
                    <article key={alternative.code} className="rounded-2xl border border-slate-800 p-4">
                      <div className="flex justify-between gap-3"><p className="font-semibold">{index + 2}. {alternative.title}</p><p className="text-sky-300">{alternative.score}/100</p></div>
                      <p className="mt-2 text-xs leading-5 text-slate-400">{alternative.reason}</p>
                    </article>
                  ))}
                </div>
              </div>

              {result.farmerContext.currentSalePrice !== null ? (
                <div className="mt-5 rounded-2xl border border-violet-500/25 bg-violet-500/10 p-4 text-sm">
                  <p className="font-semibold text-violet-200">Manual current economics</p>
                  <p className="mt-2 text-violet-100">Gross {formatMoney(result.farmerContext.grossSaleValue)} − entered costs {formatMoney(result.farmerContext.totalEnteredCosts)} = estimated net return {formatMoney(result.farmerContext.estimatedNetReturn)}</p>
                  <p className="mt-2 text-xs text-violet-200/70">No future price or profit is forecast.</p>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Evidence used</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">Latest records for {selectedCropLabel}</h2>
          </div>
          {isLoadingEvidence ? <p className="text-sm text-slate-500">Loading stored evidence...</p> : null}
        </div>
        {evidenceError ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{evidenceError}</p> : null}
        {evidence ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Object.keys(EVIDENCE_LABELS).map((key) => <EvidenceCard key={key} evidenceKey={key} item={evidence[key]} />)}
          </div>
        ) : null}
      </section>

      {result ? (
        <>
          <section className="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700 dark:text-violet-300">Candidate evaluation</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">Every action and factor</h2>
            <div className="mt-5 space-y-3">
              {result.candidateActions.map((candidate) => (
                <details key={candidate.code} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{candidate.title}</span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">{candidate.status === "SCORED" ? `${candidate.score} / 100` : humanize(candidate.status)}</span>
                  </summary>
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                    {candidate.factors.map((factor, index) => (
                      <div key={`${factor.factor}-${index}`} className="grid gap-1 text-sm sm:grid-cols-[10rem,4rem,1fr]">
                        <span className="font-medium text-slate-700 dark:text-slate-200">{humanize(factor.factor)}</span>
                        <span className={factor.effect > 0 ? "text-emerald-700 dark:text-emerald-300" : factor.effect < 0 ? "text-rose-700 dark:text-rose-300" : "text-slate-500"}>{factor.effect > 0 ? "+" : ""}{factor.effect}</span>
                        <span className="text-slate-600 dark:text-slate-400">{factor.reason} <span className="text-xs">({factor.source})</span></span>
                      </div>
                    ))}
                    {candidate.constraints.map((constraint) => <p key={constraint} className="text-sm font-medium text-rose-700 dark:text-rose-300">Constraint: {constraint}</p>)}
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/40 dark:bg-amber-950/20">
              <h2 className="font-display text-xl font-semibold text-amber-950 dark:text-amber-100">Constraints and missing information</h2>
              <div className="mt-4 space-y-4 text-sm leading-6 text-amber-900 dark:text-amber-200">
                <div><p className="font-semibold">Constraints</p><ul className="mt-2 list-disc space-y-1 pl-5">{result.constraints.length ? result.constraints.map((item) => <li key={item}>{item}</li>) : <li>No global hard constraint affected the top action.</li>}</ul></div>
                <div><p className="font-semibold">Missing / unusable evidence</p><ul className="mt-2 list-disc space-y-1 pl-5">{result.missingData.length ? result.missingData.map((item) => <li key={item}>{item}</li>) : <li>No configured evidence source is missing.</li>}</ul></div>
              </div>
            </article>
            <article className="rounded-[2rem] border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900/70">
              <h2 className="font-display text-xl font-semibold text-slate-950 dark:text-slate-50">Assumptions and disclaimer</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600 dark:text-slate-300">{result.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
              <p className="mt-4 rounded-2xl bg-white p-4 text-xs leading-6 text-slate-600 dark:bg-slate-950 dark:text-slate-300">{result.disclaimer}</p>
            </article>
          </section>
        </>
      ) : null}
    </div>
  );
}
