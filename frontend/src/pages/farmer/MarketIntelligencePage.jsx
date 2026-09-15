import { useMemo, useState } from "react";

import LatestMandiPricePanel from "../../components/market/LatestMandiPricePanel";
import ModuleHeader from "../../components/ui/ModuleHeader";
import ScrollReveal from "../../components/ui/ScrollReveal";
import useResultReveal from "../../hooks/useResultReveal";
import { requestMarketIntelligence } from "../../services/marketIntelligenceService";

const MARKET_OPTIONS = [
  {
    crop: "tomato",
    cropLabel: "Tomato",
    marketKey: "tomato-pune-local",
    marketLabel: "Pune APMC — Pune, Maharashtra",
    variety: "Local",
  },
  {
    crop: "maize",
    cropLabel: "Maize",
    marketKey: "maize-pune-deshi-red",
    marketLabel: "Pune APMC — Pune, Maharashtra",
    variety: "Deshi Red",
  },
  {
    crop: "groundnut",
    cropLabel: "Groundnut",
    marketKey: "groundnut-laxmeshwar-balli-habbu",
    marketLabel: "Laxmeshwar APMC — Gadag, Karnataka",
    variety: "Balli/Habbu",
  },
];

const NUMERIC_FIELDS = [
  {
    name: "quantityQuintals",
    label: "Quantity",
    unit: "quintals",
    minimum: Number.EPSILON,
    required: true,
  },
  {
    name: "expectedSalePrice",
    label: "Expected sale price",
    unit: "₹ / quintal",
    minimum: Number.EPSILON,
    required: true,
  },
  {
    name: "transportCost",
    label: "Transport cost",
    unit: "₹ total",
    minimum: 0,
  },
  {
    name: "storageCost",
    label: "Storage cost",
    unit: "₹ total",
    minimum: 0,
  },
  {
    name: "otherCost",
    label: "Other entered costs",
    unit: "₹ total",
    minimum: 0,
  },
];

const initialFormState = {
  crop: "tomato",
  marketKey: "tomato-pune-local",
  quantityQuintals: "",
  expectedSalePrice: "",
  transportCost: "0",
  storageCost: "0",
  otherCost: "0",
};

const formatMoney = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatNumber = (value, digits = 2) =>
  new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: digits,
  }).format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
};

const trendClasses = {
  Rising: "bg-emerald-500/20 text-emerald-200",
  Stable: "bg-sky-500/20 text-sky-200",
  Falling: "bg-amber-500/20 text-amber-200",
};

export default function MarketIntelligencePage() {
  const [formState, setFormState] = useState(initialFormState);
  const [fieldErrors, setFieldErrors] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const resultRef = useResultReveal(result);

  const cropOptions = useMemo(
    () =>
      MARKET_OPTIONS.map(({ crop, cropLabel }) => ({ crop, cropLabel })).filter(
        (option, index, values) =>
          values.findIndex((candidate) => candidate.crop === option.crop) === index
      ),
    []
  );

  const availableMarkets = MARKET_OPTIONS.filter(
    (option) => option.crop === formState.crop
  );
  const selectedMarket = MARKET_OPTIONS.find(
    (option) => option.marketKey === formState.marketKey
  );

  const handleChange = (event) => {
    const { name, value } = event.target;

    if (name === "crop") {
      const firstMarket = MARKET_OPTIONS.find((option) => option.crop === value);
      setFormState((current) => ({
        ...current,
        crop: value,
        marketKey: firstMarket?.marketKey || "",
      }));
    } else {
      setFormState((current) => ({ ...current, [name]: value }));
    }

    setFieldErrors((current) => ({ ...current, [name]: "" }));
    setError("");
    setResult(null);
  };

  const validateAndBuildPayload = () => {
    const nextErrors = {};
    const payload = {
      crop: formState.crop,
      marketKey: formState.marketKey,
    };

    if (!selectedMarket || selectedMarket.crop !== formState.crop) {
      nextErrors.marketKey = "Choose a supported market for this crop.";
    }

    NUMERIC_FIELDS.forEach((field) => {
      const rawValue = formState[field.name];
      if (rawValue === "") {
        if (field.required) {
          nextErrors[field.name] = `${field.label} is required.`;
        } else {
          payload[field.name] = 0;
        }
        return;
      }

      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        nextErrors[field.name] = `${field.label} must be a valid number.`;
        return;
      }
      if (numericValue < field.minimum) {
        nextErrors[field.name] =
          field.minimum === 0
            ? `${field.label} cannot be negative.`
            : `${field.label} must be greater than zero.`;
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
    setResult(null);
    setError("");

    try {
      const response = await requestMarketIntelligence(payload);
      setResult(response);
    } catch (requestError) {
      if (requestError.status === 503) {
        setError(
          "Market intelligence data is currently unavailable. No replacement price has been generated."
        );
      } else if (requestError.status === 401) {
        setError("Your session has expired. Please log in again.");
      } else if (requestError.status === 403) {
        setError("Market Intelligence is available to farmer accounts only.");
      } else {
        setError(requestError.message || "We could not complete the market analysis.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Market Intelligence"
        category="Mandi Reports & Historical Analysis"
        method="AGMARKNET · daily reports / market-v1"
        icon="market"
        tone="market"
        description="Explore latest reported Government wholesale mandi prices, with separate historical analysis and a manual return calculator below."
      />

      <LatestMandiPricePanel />

      <div className="border-t border-slate-200 pt-6 dark:border-slate-800">
        <h2 className="font-display text-xl font-semibold text-slate-950 dark:text-slate-50">Historical Market Analysis</h2>
        <p className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-200">Historical dataset through 30 June 2021.</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">The section below uses the unchanged market-v1 archive, not current mandi reports or a future forecast.</p>
      </div>

      <ScrollReveal as="section" className="mx-auto w-full max-w-7xl rounded-3xl border border-violet-200/80 bg-white/90 p-4 shadow-sm dark:border-violet-950 dark:bg-slate-950/80 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700 dark:text-violet-300">Analysis setup</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">Choose a historical market and enter a manual return scenario</h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Units: quintals and ₹/quintal</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <fieldset className="rounded-2xl border border-violet-200 bg-violet-50/60 px-4 pb-3 pt-2.5 dark:border-violet-900/50 dark:bg-violet-950/20">
            <legend className="px-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-800 dark:text-violet-200">Historical market selector</legend>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Crop
              </span>
              <select
                name="crop"
                value={formState.crop}
                onChange={handleChange}
                disabled={isSubmitting}
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {cropOptions.map((option) => (
                  <option key={option.crop} value={option.crop}>
                    {option.cropLabel}
                  </option>
                ))}
              </select>
              </label>

              <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Supported market
              </span>
              <select
                name="marketKey"
                value={formState.marketKey}
                onChange={handleChange}
                disabled={isSubmitting}
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {availableMarkets.map((option) => (
                  <option key={option.marketKey} value={option.marketKey}>
                    {option.marketLabel}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-400">
                Variety: {selectedMarket?.variety || "Unavailable"}
              </span>
              {fieldErrors.marketKey ? (
                <span className="mt-1 block text-xs text-rose-600">
                  {fieldErrors.marketKey}
                </span>
              ) : null}
              </label>
            </div>
          </fieldset>

          <fieldset className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 pb-3 pt-2.5 dark:border-slate-800 dark:bg-slate-900/60">
            <legend className="px-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-200">Manual return calculator</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                  min={field.minimum}
                  step="any"
                  required={field.required}
                  disabled={isSubmitting}
                  className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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

            <p className="rounded-2xl bg-violet-50 px-4 py-2.5 text-xs leading-5 text-violet-800 dark:bg-violet-950/30 dark:text-violet-200">
              Manual scenario: expected sale price and costs come from you. They are not
              fetched, predicted, or generated by Gemini. Zero cost means that cost was not
              included.
            </p>

            {error ? (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mx-auto block w-full max-w-sm rounded-2xl bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400 dark:focus-visible:ring-offset-slate-950"
            >
              {isSubmitting
                ? "Analyzing historical prices..."
                : "Analyze market and calculate return"}
            </button>
          </form>
      </ScrollReveal>

      {result ? (
        <div ref={resultRef} className="scroll-mt-24 space-y-6 border-t border-slate-200 pt-6 dark:border-slate-800">
          <ScrollReveal as="section" className="rounded-3xl border border-slate-800 bg-slate-950 p-5 text-white shadow-xl sm:p-6">
            <div>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Historical data</p>
                  <p className="mt-1 font-semibold text-amber-100">Last observation: {formatDate(result.referencePrice.observedDate)}</p>
                </div>
                <p className="text-sm font-bold text-amber-200">Not a current mandi price</p>
              </div>

              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
                    Historical reference market price
                  </p>
                  <h2 className="mt-3 font-display text-3xl font-bold">
                    {result.selection.commodity} — {result.selection.market}
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">
                    {result.selection.district}, {result.selection.state} · {result.selection.variety}
                  </p>
                </div>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">{result.analysisVersion || "market-v1"}</span>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  ["Minimum", result.referencePrice.minimumPrice],
                  ["Modal", result.referencePrice.modalPrice],
                  ["Maximum", result.referencePrice.maximumPrice],
                ].map(([label, value]) => (
                  <article
                    key={label}
                    className={`rounded-2xl border p-4 ${
                      label === "Modal"
                        ? "border-violet-400/50 bg-violet-500/15 shadow-lg shadow-violet-950/20"
                        : "border-slate-800 bg-white/5"
                    }`}
                  >
                    <p className={`text-xs ${label === "Modal" ? "font-semibold uppercase tracking-[0.16em] text-violet-300" : "text-slate-500"}`}>{label} price</p>
                    <p className={`mt-2 font-display font-semibold ${label === "Modal" ? "text-3xl text-white" : "text-xl"}`}>{formatMoney(value)}</p>
                    <p className="mt-1 text-xs text-slate-500">per quintal{label === "Modal" ? " · primary reference" : ""}</p>
                  </article>
                ))}
              </div>

              <p className="mt-3 text-xs leading-6 text-slate-400">
                Observed {formatDate(result.referencePrice.observedDate)}. Minimum and
                maximum are the recorded range; modal is the most commonly quoted price
                and is the primary reference used by market-v1.
              </p>

              <div className="mt-5 rounded-2xl border border-sky-500/25 bg-sky-500/10 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Historical trend</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-[0.8fr,1.2fr] sm:items-end">
                  <div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${trendClasses[result.trend.direction]}`}>{result.trend.direction}</span>
                    <p className="mt-2 font-display text-3xl font-bold text-sky-100">
                      {result.trend.percentageChange > 0 ? "+" : ""}{formatNumber(result.trend.percentageChange)}%
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-950/30 p-3"><p className="text-xs text-sky-200/60">Previous 5 avg</p><p className="mt-1 font-semibold">{formatMoney(result.trend.previousAverage)}</p></div>
                    <div className="rounded-xl bg-slate-950/30 p-3"><p className="text-xs text-sky-200/60">Recent 5 avg</p><p className="mt-1 font-semibold">{formatMoney(result.trend.recentAverage)}</p></div>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-6 text-sky-200/70">
                  {result.trend.rule}
                </p>
              </div>

              <div className="mt-5 rounded-2xl border border-violet-500/25 bg-violet-500/10 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">
                  Manual return calculator
                </p>
                <div className="mt-4 divide-y divide-violet-300/15 rounded-2xl bg-slate-950/30 px-4">
                  <div className="flex items-center justify-between gap-4 py-3 text-sm"><span className="text-violet-200/70">Gross value</span><strong>{formatMoney(result.profitAnalysis.grossSaleValue)}</strong></div>
                  <div className="flex items-center justify-between gap-4 py-3 text-sm"><span className="text-violet-200/70">Entered costs</span><strong className="text-rose-200">− {formatMoney(result.profitAnalysis.totalEnteredCosts)}</strong></div>
                  <div className="flex items-center justify-between gap-4 py-4"><span className="font-semibold text-violet-100">Estimated Net Return</span><strong className="font-display text-2xl text-violet-200">{formatMoney(result.profitAnalysis.estimatedNetReturn)}</strong></div>
                </div>
                <p className="mt-3 text-xs leading-6 text-violet-100/75">
                  Quantity × your expected sale price − transport − storage − other entered
                  costs. Cultivation costs are not included unless you entered them under
                  other costs.
                </p>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-700 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Forecast: unavailable
                </p>
                <p className="mt-2 text-xs leading-6 text-slate-400">
                  {result.forecast.reason}
                </p>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal as="section" className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
                  Recent historical observations
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
                  Modal price history
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Showing {result.historicalSummary.returnedObservations} of{" "}
                {result.historicalSummary.observationCount} cleaned observations
              </p>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800">
                  <tr>
                    <th className="px-3 py-3">Observed date</th>
                    <th className="px-3 py-3">Minimum</th>
                    <th className="px-3 py-3">Modal</th>
                    <th className="px-3 py-3">Maximum</th>
                    <th className="px-3 py-3">Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[...result.history].reverse().map((observation) => (
                    <tr key={observation.observedDate}>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                        {formatDate(observation.observedDate)}
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                        {formatMoney(observation.minimumPrice)}
                      </td>
                      <td className="px-3 py-3 font-semibold text-emerald-700 dark:text-emerald-300">
                        {formatMoney(observation.modalPrice)}
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                        {formatMoney(observation.maximumPrice)}
                      </td>
                      <td className="px-3 py-3 text-slate-500">per quintal</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollReveal>

          <ScrollReveal as="section" className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800 dark:text-amber-300">
              Data provenance
            </p>
            <div className="mt-4 grid gap-3 text-sm leading-7 text-amber-950 dark:text-amber-100 md:grid-cols-2">
              <p><span className="font-semibold">Source:</span> {result.dataProvenance.source}</p>
              <p><span className="font-semibold">Status:</span> HISTORICAL / STALE</p>
              <p><span className="font-semibold">Observed:</span> {formatDate(result.referencePrice.observedDate)}</p>
              <p><span className="font-semibold">Data age:</span> {formatNumber(result.dataProvenance.dataAgeDays, 0)} days</p>
              <p><span className="font-semibold">Price type:</span> {result.dataProvenance.priceType}</p>
              <p><span className="font-semibold">Unit:</span> ₹ per quintal</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
              <a
                href={result.dataProvenance.officialCatalogUrl}
                target="_blank"
                rel="noreferrer"
                className="text-amber-800 underline underline-offset-4 dark:text-amber-200"
              >
                Official data.gov.in catalog
              </a>
              <a
                href={result.dataProvenance.publicArchiveUrl}
                target="_blank"
                rel="noreferrer"
                className="text-amber-800 underline underline-offset-4 dark:text-amber-200"
              >
                Public archive used
              </a>
            </div>
            <p className="mt-4 text-xs leading-6 text-amber-800 dark:text-amber-200">
              {result.dataProvenance.licenseNote}
            </p>
            <p className="mt-4 text-xs leading-6 text-amber-900 dark:text-amber-100">
              {result.disclaimer}
            </p>
          </ScrollReveal>
        </div>
      ) : null}
    </div>
  );
}
