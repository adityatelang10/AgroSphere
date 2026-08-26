import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  getWhatIfContext,
  runWhatIfSimulation,
} from "../../services/whatIfSimulatorService";

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

const EDITABLE_FIELDS = [
  "farmState",
  "availableQuantity",
  "waterAvailability",
  "storageAvailable",
  "currentSalePrice",
  "transportCost",
  "storageCost",
  "otherCost",
];

const DISPLAY_FIELDS = [
  ["farmState", "Farm state"],
  ["availableQuantity", "Available quantity"],
  ["waterAvailability", "Water availability"],
  ["storageAvailable", "Storage available"],
  ["currentSalePrice", "Manual current price"],
  ["transportCost", "Transport cost"],
  ["storageCost", "Storage cost"],
  ["otherCost", "Other cost"],
];

const EVIDENCE_LABELS = {
  cropRecommendation: "Crop Recommendation",
  disease: "Disease Scan",
  irrigation: "Irrigation Advice",
  market: "Market Information",
  inventory: "Crop Inventory",
};

const formatMoney = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatDateTime = (value) => {
  if (!value) {
    return "Unavailable";
  }
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const humanize = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());

const toScenarioForm = (context) => ({
  farmState: context.farmState,
  availableQuantity: String(context.availableQuantity),
  waterAvailability: context.waterAvailability,
  storageAvailable: String(context.storageAvailable),
  currentSalePrice:
    typeof context.currentSalePrice === "number"
      ? String(context.currentSalePrice)
      : "",
  transportCost: String(context.transportCost),
  storageCost: String(context.storageCost),
  otherCost: String(context.otherCost),
});

const normalizeScenarioForm = (form) => ({
  farmState: form.farmState,
  availableQuantity: Number(form.availableQuantity),
  waterAvailability: form.waterAvailability,
  storageAvailable: form.storageAvailable === "true",
  currentSalePrice:
    form.currentSalePrice === "" ? null : Number(form.currentSalePrice),
  transportCost: Number(form.transportCost),
  storageCost: Number(form.storageCost),
  otherCost: Number(form.otherCost),
});

const displayContextValue = (field, value, context) => {
  if (field === "farmState" || field === "waterAvailability") {
    return humanize(value);
  }
  if (field === "storageAvailable") {
    return value ? "Yes" : "No";
  }
  if (field === "availableQuantity") {
    return `${value} ${context.quantityUnit}`;
  }
  if (field === "currentSalePrice") {
    return value === null ? "Not entered" : `${formatMoney(value)} / ${context.quantityUnit}`;
  }
  return formatMoney(value);
};

const EvidenceSummary = ({ evidence }) => (
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
    {Object.entries(EVIDENCE_LABELS).map(([key, label]) => {
      const item = evidence[key];
      const missing = item?.status === "MISSING";
      let detail = item?.usageNote || "No record found.";
      if (!missing && key === "disease") {
        detail = `${item.data.condition} · ${(item.data.confidence * 100).toFixed(1)}% classification confidence`;
      } else if (!missing && key === "irrigation") {
        detail = `${item.data.waterStress} stress · ${item.data.recommendedTiming}`;
      } else if (!missing && key === "market") {
        detail = `${item.data.trend} historical trend · not a current signal`;
      } else if (!missing && key === "cropRecommendation") {
        detail = `${item.data.recommendedCrop} · planning information only`;
      } else if (!missing && key === "inventory") {
        detail = `${item.data.matchingListingCount} matching inventory record(s)`;
      }

      return (
        <article key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</p>
            <span className="rounded-full bg-slate-200 px-2 py-1 text-[0.65rem] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {missing ? "MISSING" : item.freshness.replaceAll("_", " ")}
            </span>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">{detail}</p>
          {!missing && item.createdAt ? <p className="mt-2 text-[0.68rem] text-slate-400">{formatDateTime(item.createdAt)}</p> : null}
        </article>
      );
    })}
  </div>
);

const DecisionCard = ({ label, decision, accent }) => (
  <article className={`rounded-[2rem] border p-6 shadow-xl ${accent}`}>
    <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-75">{label}</p>
    <h3 className="mt-3 font-display text-3xl font-bold">{decision.nextBestAction.title}</h3>
    <p className="mt-3 inline-flex rounded-full bg-white/15 px-4 py-2 text-sm font-semibold">
      Priority Score: {decision.nextBestAction.score} / 100
    </p>
    <p className="mt-3 text-xs opacity-70">Priority score is a deterministic ranking, not a probability.</p>
    <div className="mt-5 border-t border-current/15 pt-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-75">Top reasons</p>
      <ul className="mt-3 space-y-2 text-sm leading-6">
        {decision.why.slice(0, 4).map((reason) => <li key={reason}>• {reason}</li>)}
      </ul>
    </div>
  </article>
);

export default function WhatIfSimulatorPage() {
  const [selectedCrop, setSelectedCrop] = useState("tomato");
  const [context, setContext] = useState(null);
  const [scenarioForm, setScenarioForm] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let ignore = false;
    setIsLoading(true);
    setError("");
    setResult(null);
    setContext(null);
    setScenarioForm(null);

    getWhatIfContext(selectedCrop)
      .then((response) => {
        if (!ignore) {
          setContext(response);
          if (response.hasBaseScenario) {
            setScenarioForm(toScenarioForm(response.baseContext));
          }
        }
      })
      .catch((requestError) => {
        if (!ignore) {
          if (requestError.status === 401) {
            setError("Your session has expired. Please log in again.");
          } else if (requestError.status === 403) {
            setError("The What-If Simulator is available to farmer accounts only.");
          } else {
            setError(requestError.message || "The current decision context could not be loaded.");
          }
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedCrop]);

  const currentDecision = result?.baseScenario || context?.baseDecision;
  const handleScenarioChange = (event) => {
    const { name, value } = event.target;
    setScenarioForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: "" }));
    setError("");
    setResult(null);
  };

  const validateAndBuildPayload = () => {
    const errors = {};
    const simulated = normalizeScenarioForm(scenarioForm);

    if (!Number.isFinite(simulated.availableQuantity) || simulated.availableQuantity < 0) {
      errors.availableQuantity = "Enter zero or a positive quantity.";
    } else if (simulated.farmState !== "growing" && simulated.availableQuantity <= 0) {
      errors.availableQuantity = "Harvest-ready or harvested produce needs a quantity above zero.";
    }
    if (
      simulated.currentSalePrice !== null &&
      (!Number.isFinite(simulated.currentSalePrice) || simulated.currentSalePrice <= 0)
    ) {
      errors.currentSalePrice = "Enter a positive manual scenario price or leave it blank.";
    }
    ["transportCost", "storageCost", "otherCost"].forEach((field) => {
      if (!Number.isFinite(simulated[field]) || simulated[field] < 0) {
        errors[field] = "Enter zero or a positive amount.";
      }
    });

    const scenarioOverrides = EDITABLE_FIELDS.reduce((overrides, field) => {
      if (!Object.is(simulated[field], context.baseContext[field])) {
        overrides[field] = simulated[field];
      }
      return overrides;
    }, {});
    if (!Object.keys(scenarioOverrides).length) {
      errors.form = "Change at least one scenario assumption before running the comparison.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length
      ? null
      : {
          selectedCrop,
          baseContext: context.baseContext,
          scenarioOverrides,
        };
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
      setResult(await runWhatIfSimulation(payload));
    } catch (requestError) {
      if (requestError.status === 401) {
        setError("Your session has expired. Please log in again.");
      } else if (requestError.status === 403) {
        setError("The What-If Simulator is available to farmer accounts only.");
      } else {
        setError(requestError.data?.errors?.[0]?.msg || requestError.message || "The scenario could not be evaluated.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/60 bg-white/85 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/75 sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-fuchsia-700 dark:text-fuchsia-300">AgroSphere What-If Simulator</p>
        <h1 className="mt-3 font-display text-4xl font-bold text-slate-950 dark:text-slate-50">Compare current conditions with one hypothetical scenario.</h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-600 dark:text-slate-300">
          whatif-v1 runs the unchanged decision-v1 rules twice over the same stored disease, irrigation, market, recommendation, and inventory evidence. Only the assumptions you edit are changed; no future value is predicted and no real decision record is overwritten.
        </p>
      </section>

      <section className="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
        <label className="block max-w-md">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Decision crop</span>
          <select value={selectedCrop} onChange={(event) => setSelectedCrop(event.target.value)} disabled={isLoading || isSubmitting} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-fuchsia-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            {CROP_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {isLoading ? <p className="mt-4 text-sm text-slate-500">Loading latest Decision Engine context...</p> : null}
        {error ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p> : null}
      </section>

      {!isLoading && context && !context.hasBaseScenario ? (
        <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/40 dark:bg-amber-950/20">
          <h2 className="font-display text-2xl font-semibold text-amber-950 dark:text-amber-100">Create a current decision first</h2>
          <p className="mt-3 text-sm leading-7 text-amber-900 dark:text-amber-200">No real DecisionSnapshot exists for {context.selectedCropLabel}. The simulator will not invent a base context.</p>
          <Link to="/farmer/decision-engine" className="mt-5 inline-flex rounded-full bg-amber-700 px-4 py-2 text-sm font-semibold text-white">Open Farm Decision</Link>
        </section>
      ) : null}

      {context?.hasBaseScenario && scenarioForm ? (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50/80 p-6 shadow-xl dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">Current scenario</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">Latest saved farmer context</h2>
              <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">From DecisionSnapshot {context.sourceDecisionId} · saved {formatDateTime(context.sourceDecisionCreatedAt)}. Re-evaluated against the latest stored evidence without creating a new snapshot.</p>
              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                {DISPLAY_FIELDS.map(([field, label]) => (
                  <div key={field} className="rounded-2xl bg-white/70 p-4 dark:bg-slate-950/50">
                    <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
                    <dd className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{displayContextValue(field, context.baseContext[field], context.baseContext)}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="rounded-[2rem] border border-fuchsia-200 bg-fuchsia-50/80 p-6 shadow-xl dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-700 dark:text-fuchsia-300">What-if scenario</p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">Change explicit assumptions</h2>
              <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Farm state is hypothetical here and does not change the actual crop. Quantity unit remains {context.baseContext.quantityUnit} to avoid an unconverted unit change.</p>

              <form onSubmit={handleSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="text-sm font-medium text-slate-700 dark:text-slate-200">Assumed farm state</span><select name="farmState" value={scenarioForm.farmState} onChange={handleScenarioChange} disabled={isSubmitting} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"><option value="growing">Growing</option><option value="harvest_ready">Harvest-ready</option><option value="harvested">Harvested</option></select></label>
                <label className="block"><span className="text-sm font-medium text-slate-700 dark:text-slate-200">Available quantity ({context.baseContext.quantityUnit})</span><input type="number" name="availableQuantity" min="0" step="any" value={scenarioForm.availableQuantity} onChange={handleScenarioChange} disabled={isSubmitting} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900" />{fieldErrors.availableQuantity ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.availableQuantity}</span> : null}</label>
                <label className="block"><span className="text-sm font-medium text-slate-700 dark:text-slate-200">Water availability</span><select name="waterAvailability" value={scenarioForm.waterAvailability} onChange={handleScenarioChange} disabled={isSubmitting} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"><option value="adequate">Adequate</option><option value="limited">Limited</option><option value="unavailable">Unavailable</option></select></label>
                <label className="block"><span className="text-sm font-medium text-slate-700 dark:text-slate-200">Storage available</span><select name="storageAvailable" value={scenarioForm.storageAvailable} onChange={handleScenarioChange} disabled={isSubmitting} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"><option value="true">Yes</option><option value="false">No</option></select></label>
                <label className="block sm:col-span-2"><span className="text-sm font-medium text-slate-700 dark:text-slate-200">Farmer-entered scenario price</span><span className="ml-2 text-xs text-fuchsia-600 dark:text-fuchsia-300">hypothetical · ₹/{context.baseContext.quantityUnit}</span><input type="number" name="currentSalePrice" min="0.01" step="any" value={scenarioForm.currentSalePrice} onChange={handleScenarioChange} disabled={isSubmitting} placeholder="Blank means no manual current price" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900" />{fieldErrors.currentSalePrice ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.currentSalePrice}</span> : null}</label>
                {[["transportCost", "Transport cost"], ["storageCost", "Storage cost"], ["otherCost", "Other entered cost"]].map(([name, label]) => <label key={name} className="block"><span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label} (₹ total)</span><input type="number" name={name} min="0" step="any" value={scenarioForm[name]} onChange={handleScenarioChange} disabled={isSubmitting} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900" />{fieldErrors[name] ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors[name]}</span> : null}</label>)}
                {fieldErrors.form ? <p className="rounded-2xl bg-rose-100 px-4 py-3 text-sm text-rose-700 sm:col-span-2">{fieldErrors.form}</p> : null}
                <button type="submit" disabled={isSubmitting} className="rounded-2xl bg-fuchsia-700 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-fuchsia-600 disabled:cursor-not-allowed disabled:bg-slate-400 sm:col-span-2">{isSubmitting ? "Running the same decision-v1 rules..." : "Run What-If Analysis"}</button>
              </form>
            </section>
          </div>

          <section className="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 dark:text-slate-300">Unchanged stored evidence</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">Both scenarios use these exact records</h2>
            <div className="mt-5"><EvidenceSummary evidence={result?.evidence || context.evidence} /></div>
          </section>

          {currentDecision ? (
            <section className="grid gap-6 lg:grid-cols-2">
              <DecisionCard label="Current recommendation" decision={currentDecision} accent="border-emerald-300 bg-emerald-800 text-white dark:border-emerald-800" />
              {result ? <DecisionCard label="Simulated recommendation" decision={result.simulatedScenario} accent="border-fuchsia-300 bg-fuchsia-900 text-white dark:border-fuchsia-800" /> : <article className="flex min-h-[22rem] items-center rounded-[2rem] border border-dashed border-fuchsia-300 bg-fuchsia-50 p-6 text-fuchsia-900 dark:border-fuchsia-900 dark:bg-fuchsia-950/20 dark:text-fuchsia-100"><div><p className="text-xs font-semibold uppercase tracking-[0.2em]">Simulated recommendation</p><p className="mt-3 font-display text-2xl font-semibold">Change an assumption and run the comparison.</p></div></article>}
            </section>
          ) : null}

          {result ? (
            <>
              <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-xl dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800 dark:text-amber-300">Changed assumptions</p><h2 className="mt-2 font-display text-2xl font-semibold text-amber-950 dark:text-amber-100">Only farmer-entered values changed</h2></div><span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">HYPOTHETICAL / NOT SAVED</span></div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{result.changes.map((change) => <article key={change.field} className="rounded-2xl bg-white/70 p-4 dark:bg-slate-950/40"><p className="text-xs text-amber-700 dark:text-amber-300">{change.label}</p><p className="mt-2 font-semibold text-slate-900 dark:text-slate-100">{displayContextValue(change.field, change.before, result.baseScenario.farmerContext)} <span className="mx-2 text-amber-600">→</span> {displayContextValue(change.field, change.after, result.simulatedScenario.farmerContext)}</p></article>)}</div>
              </section>

              <section className="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-700 dark:text-fuchsia-300">{result.decisionChanged ? "Why did it change?" : "Why did it remain the same?"}</p>
                <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-700 dark:text-slate-200">{result.explanation.map((item) => <li key={item} className="flex gap-3"><span className="text-fuchsia-600">✓</span><span>{item}</span></li>)}</ul>
              </section>

              <section className="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
                <h2 className="font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">Candidate action comparison</h2>
                <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[48rem] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800"><tr><th className="px-3 py-3">Action</th><th className="px-3 py-3">Current</th><th className="px-3 py-3">What-if</th><th className="px-3 py-3">Change</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{result.baseScenario.candidateActions.map((baseCandidate) => { const simulatedCandidate = result.simulatedScenario.candidateActions.find((candidate) => candidate.code === baseCandidate.code); const baseValue = baseCandidate.status === "SCORED" ? `${baseCandidate.score}/100` : humanize(baseCandidate.status); const simulatedValue = simulatedCandidate.status === "SCORED" ? `${simulatedCandidate.score}/100` : humanize(simulatedCandidate.status); return <tr key={baseCandidate.code}><td className="px-3 py-3 font-semibold text-slate-800 dark:text-slate-100">{baseCandidate.title}</td><td className="px-3 py-3 text-slate-600 dark:text-slate-300">{baseValue}</td><td className="px-3 py-3 text-slate-600 dark:text-slate-300">{simulatedValue}</td><td className="px-3 py-3 text-fuchsia-700 dark:text-fuchsia-300">{baseValue === simulatedValue ? "No score/status change" : `${baseValue} → ${simulatedValue}`}</td></tr>; })}</tbody></table></div>
              </section>

              {(result.baseScenario.farmerContext.currentSalePrice !== null || result.simulatedScenario.farmerContext.currentSalePrice !== null) ? <section className="grid gap-5 md:grid-cols-2"><article className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900/40 dark:bg-emerald-950/20"><h2 className="font-display text-xl font-semibold text-emerald-950 dark:text-emerald-100">Current manual economics</h2><p className="mt-3 text-sm text-emerald-900 dark:text-emerald-200">Gross: {formatMoney(result.baseScenario.farmerContext.grossSaleValue)}<br />Entered costs: {formatMoney(result.baseScenario.farmerContext.totalEnteredCosts)}<br />Estimated net return: {formatMoney(result.baseScenario.farmerContext.estimatedNetReturn)}</p></article><article className="rounded-[2rem] border border-fuchsia-200 bg-fuchsia-50 p-6 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20"><h2 className="font-display text-xl font-semibold text-fuchsia-950 dark:text-fuchsia-100">Hypothetical manual economics</h2><p className="mt-3 text-sm text-fuchsia-900 dark:text-fuchsia-200">Gross: {formatMoney(result.simulatedScenario.farmerContext.grossSaleValue)}<br />Entered costs: {formatMoney(result.simulatedScenario.farmerContext.totalEnteredCosts)}<br />Estimated net return: {formatMoney(result.simulatedScenario.farmerContext.estimatedNetReturn)}</p><p className="mt-3 text-xs text-fuchsia-700 dark:text-fuchsia-300">Scenario price is farmer-entered—not predicted.</p></article></section> : null}

              <p className="rounded-[2rem] bg-slate-950 p-5 text-xs leading-6 text-slate-300">{result.disclaimer}</p>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
