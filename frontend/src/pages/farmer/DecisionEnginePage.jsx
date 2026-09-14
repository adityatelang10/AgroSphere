import { useEffect, useMemo, useState } from "react";

import ModuleHeader from "../../components/ui/ModuleHeader";
import ScrollReveal from "../../components/ui/ScrollReveal";
import useResultReveal from "../../hooks/useResultReveal";
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

const CONTROL_CLASSES =
  "mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

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
    <article className="relative rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
      <span className="absolute -top-3 left-1/2 hidden h-3 w-px bg-amber-300/70 xl:block" aria-hidden="true" />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {EVIDENCE_LABELS[evidenceKey]}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isMissing ? item?.usageNote || "No record found." : "Saved " + formatDateTime(item.createdAt)}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[0.68rem] font-semibold ${freshnessClass}`}>
          {isMissing ? "MISSING" : item.freshness.replaceAll("_", " ")}
        </span>
      </div>

      {!isMissing ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-amber-700 dark:text-amber-300">
            View evidence details
          </summary>
        <div className="mt-2 space-y-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
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
                {item.timestampSource === "createdAt" ? "Legacy evidence time" : "Observation time"}:{" "}
                {formatDateTime(item.evidenceAt)}
              </p>
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
        </details>
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
  const resultRef = useResultReveal(result);

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
    <div className="space-y-6">
      <ModuleHeader
        title="Farm Decision"
        category="Explainable Decision Support"
        method="Multi-factor rules · decision-v1"
        icon="decision"
        tone="decision"
        description="Combine persisted AgroSphere evidence and your current farm constraints into one explainable next best action."
      >
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
          Priority score is a deterministic ranking score, not a probability of correctness.
        </p>
      </ModuleHeader>

      <ScrollReveal as="section" className="rounded-3xl border border-amber-200/80 bg-white/90 p-4 shadow-sm dark:border-amber-950 dark:bg-slate-950/80 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">Current evidence</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-slate-950 dark:text-slate-50">Latest records for {selectedCropLabel}</h2>
          </div>
          {isLoadingEvidence ? <p className="text-sm text-slate-500">Loading stored evidence...</p> : null}
        </div>
        {evidenceError ? <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{evidenceError}</p> : null}
        {evidence ? (
          <div className="relative mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <span className="absolute -top-3 left-[10%] right-[10%] hidden h-px bg-amber-300/50 xl:block" aria-hidden="true" />
            {Object.keys(EVIDENCE_LABELS).map((key) => <EvidenceCard key={key} evidenceKey={key} item={evidence[key]} />)}
          </div>
        ) : null}
      </ScrollReveal>

        <ScrollReveal as="section" className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 dark:text-slate-300">Current operating context</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">Describe the decision boundary</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Farmer-entered now</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            These fields describe one current scenario. Farmer identity always comes from your authenticated session.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Current crop</span>
              <select name="selectedCrop" value={formState.selectedCrop} onChange={handleChange} disabled={isSubmitting} className={CONTROL_CLASSES}>
                {CROP_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Crop / produce state</span>
              <select name="farmState" value={formState.farmState} onChange={handleChange} disabled={isSubmitting} className={CONTROL_CLASSES}>
                <option value="growing">Growing crop</option>
                <option value="harvest_ready">Harvest-ready</option>
                <option value="harvested">Harvested produce</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Available quantity</span>
              <input type="number" name="availableQuantity" value={formState.availableQuantity} onChange={handleChange} min="0" step="any" disabled={isSubmitting} className={CONTROL_CLASSES} />
              {fieldErrors.availableQuantity ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.availableQuantity}</span> : null}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Quantity unit</span>
              <select name="quantityUnit" value={formState.quantityUnit} onChange={handleChange} disabled={isSubmitting} className={CONTROL_CLASSES}>
                {QUANTITY_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Water availability</span>
              <select name="waterAvailability" value={formState.waterAvailability} onChange={handleChange} disabled={isSubmitting} className={CONTROL_CLASSES}>
                <option value="adequate">Adequate</option>
                <option value="limited">Limited</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Storage available</span>
              <select name="storageAvailable" value={formState.storageAvailable} onChange={handleChange} disabled={isSubmitting} className={CONTROL_CLASSES}>
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Current buyer / listing price</span>
              <span className="ml-2 text-xs text-slate-400">₹ per selected quantity unit · optional</span>
              <input type="number" name="currentSalePrice" value={formState.currentSalePrice} onChange={handleChange} min="0.01" step="any" disabled={isSubmitting} placeholder="Farmer-entered current offer only" className={CONTROL_CLASSES} />
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
                <input type="number" name={name} value={formState[name]} onChange={handleChange} min="0" step="any" disabled={isSubmitting} className={CONTROL_CLASSES} />
                {fieldErrors[name] ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors[name]}</span> : null}
              </label>
            ))}

            <p className="rounded-2xl bg-violet-50 px-4 py-2.5 text-xs leading-5 text-violet-800 dark:bg-violet-950/30 dark:text-violet-200 sm:col-span-2 lg:col-span-4">
              Manual economics = quantity × your current price − entered transport, storage, and other costs. Cultivation cost is excluded unless you include it under other costs.
            </p>

            {error ? <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 sm:col-span-2 lg:col-span-4">{error}</p> : null}

            <button type="submit" disabled={isSubmitting || isLoadingEvidence} className="mx-auto w-full max-w-sm rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-400 sm:col-span-2 lg:col-span-4">
              {isSubmitting ? "Evaluating candidate actions..." : "Generate Next Best Action"}
            </button>
          </form>
        </ScrollReveal>

      {result ? (
        <div ref={resultRef} className="scroll-mt-24 space-y-6 border-t border-slate-200 pt-6 dark:border-slate-800">
          <ScrollReveal as="section" className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-2xl">
            <div>
              <div className="grid gap-7 bg-gradient-to-br from-amber-500/15 via-slate-950 to-slate-950 p-6 lg:grid-cols-[1.15fr,0.85fr] lg:items-center sm:p-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Next best action</p>
                  <h2 className="mt-4 font-display text-4xl font-bold sm:text-6xl">{result.nextBestAction.title}</h2>
                  <p className="mt-4 text-xs text-slate-400">{result.decisionVersion} · generated {formatDateTime(result.generatedAt)}</p>
                </div>
                <div className="rounded-3xl border border-amber-300/30 bg-amber-300/10 p-6 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Priority Score</p>
                  <p className="mt-2 font-display text-5xl font-bold text-white">{result.nextBestAction.score}</p>
                  <p className="mt-1 text-sm text-amber-200">/ 100</p>
                  <p className="mt-3 text-xs leading-5 text-slate-400">Deterministic ranking, not confidence</p>
                </div>
              </div>

              <div className="grid gap-5 p-6 lg:grid-cols-[1.1fr,0.9fr]">
                <div className="rounded-2xl bg-white/5 p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Why this action?</h3>
                  <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
                    {result.why.map((reason, index) => <li key={reason} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-300/15 text-xs font-bold text-amber-300">{index + 1}</span><span>{reason}</span></li>)}
                  </ol>
                </div>
                <div className="rounded-2xl border border-slate-800 p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Ranked alternatives</h3>
                  <div className="mt-3 divide-y divide-slate-800">
                    {result.alternatives.map((alternative, index) => (
                      <div key={alternative.code} className="flex items-start justify-between gap-3 py-3">
                        <div><p className="font-semibold">{index + 2}. {alternative.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{alternative.reason}</p></div>
                        <span className="shrink-0 text-sm font-bold text-sky-300">{alternative.score}/100</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {result.farmerContext.currentSalePrice !== null ? (
                <div className="mx-6 mb-6 rounded-2xl border border-violet-500/25 bg-violet-500/10 p-4 text-sm">
                  <p className="font-semibold text-violet-200">Manual current economics</p>
                  <p className="mt-2 text-violet-100">Gross {formatMoney(result.farmerContext.grossSaleValue)} − entered costs {formatMoney(result.farmerContext.totalEnteredCosts)} = estimated net return {formatMoney(result.farmerContext.estimatedNetReturn)}</p>
                  <p className="mt-2 text-xs text-violet-200/70">No future price or profit is forecast.</p>
                </div>
              ) : null}
            </div>
          </ScrollReveal>

          <ScrollReveal as="section" className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700 dark:text-violet-300">Candidate evaluation</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">Every action and factor</h2>
            <div className="mt-5 space-y-3">
              {result.candidateActions.map((candidate) => (
                <details key={candidate.code} className={`rounded-2xl border p-4 ${candidate.status === "SCORED" ? "border-slate-200 dark:border-slate-800" : "border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/20"}`}>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{candidate.title}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${candidate.status === "SCORED" ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"}`}>{candidate.status === "SCORED" ? `${candidate.score} / 100` : humanize(candidate.status)}</span>
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
          </ScrollReveal>

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
        </div>
      ) : null}
    </div>
  );
}
