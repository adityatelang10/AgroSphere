import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getFarmerIntelligenceDashboard } from "../../services/intelligenceDashboardService";
import { formatCurrency, formatDate } from "../../utils/formatters";

const FALLBACK_QUICK_ACTIONS = [
  { id: "crop-advisor", label: "Crop Advisor", path: "/farmer/crop-recommendation" },
  { id: "leaf-scanner", label: "Leaf Scanner", path: "/farmer/disease-detection" },
  { id: "irrigation", label: "Irrigation Advisor", path: "/farmer/irrigation-advisor" },
  { id: "market", label: "Market Intelligence", path: "/farmer/market-intelligence" },
  { id: "decision", label: "Farm Decision", path: "/farmer/decision-engine" },
  { id: "what-if", label: "What-If Simulator", path: "/farmer/what-if-simulator" },
  { id: "crops", label: "My Crops", path: "/farmer/crops" },
  { id: "orders", label: "Orders", path: "/farmer/orders" },
];

const ALERT_STYLES = {
  URGENT:
    "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100",
  ATTENTION:
    "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100",
  INFO:
    "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100",
  MISSING:
    "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200",
};

const FRESHNESS_STYLES = {
  FRESH: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  OLDER: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  STALE: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  HISTORICAL_STALE:
    "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  MISSING: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  NEW_EVIDENCE_AVAILABLE:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  LATEST_STORED_DECISION:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
};

const humanize = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatDateOnly = (dateValue) => {
  if (!dateValue) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
    new Date(dateValue)
  );
};

function FreshnessBadge({ value }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
        FRESHNESS_STYLES[value] || FRESHNESS_STYLES.MISSING
      }`}
    >
      {value === "HISTORICAL_STALE"
        ? "Historical / stale"
        : humanize(value || "Missing")}
    </span>
  );
}

function ModuleCard({ eyebrow, title, freshness, actionPath, actionLabel, children }) {
  return (
    <article className="flex h-full flex-col rounded-[1.8rem] border border-white/60 bg-white/90 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/80">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
            {eyebrow}
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
            {title}
          </h2>
        </div>
        <FreshnessBadge value={freshness} />
      </div>
      <div className="mt-5 flex-1">{children}</div>
      <Link
        to={actionPath}
        className="mt-6 inline-flex w-fit rounded-full border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
      >
        {actionLabel}
      </Link>
    </article>
  );
}

function EmptyModule({ message, detail }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
      <p className="font-semibold text-slate-800 dark:text-slate-100">{message}</p>
      {detail ? (
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function EvidenceStatus({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 px-4 py-3 dark:border-slate-800">
      <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <FreshnessBadge value={value} />
    </div>
  );
}

function DashboardLoading() {
  return (
    <section className="rounded-[2rem] border border-white/60 bg-white/90 p-10 text-center shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600 dark:border-slate-800 dark:border-t-emerald-400" />
      <h1 className="mt-5 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
        Loading farm intelligence...
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Reading your latest stored farm records.
      </p>
    </section>
  );
}

export default function FarmerDashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      try {
        const response = await getFarmerIntelligenceDashboard();
        if (isMounted) {
          setDashboard(response);
        }
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message || "Unable to load farm intelligence.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadDashboard();
    return () => {
      isMounted = false;
    };
  }, []);

  if (isLoading) {
    return <DashboardLoading />;
  }

  if (!dashboard) {
    return (
      <div className="space-y-6">
        <section className="rounded-[2rem] border border-rose-200 bg-rose-50 p-8 dark:border-rose-900/50 dark:bg-rose-950/30">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300">
            Farmer Intelligence Dashboard
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold text-rose-950 dark:text-rose-100">
            Unable to load farm intelligence.
          </h1>
          <p className="mt-3 text-sm leading-6 text-rose-800 dark:text-rose-200">
            {error} Individual farmer tools are still available below.
          </p>
        </section>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FALLBACK_QUICK_ACTIONS.map((action) => (
            <Link
              key={action.id}
              to={action.path}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-4 font-semibold text-slate-800 transition hover:border-emerald-400 hover:text-emerald-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
            >
              {action.label} <span aria-hidden="true">→</span>
            </Link>
          ))}
        </section>
      </div>
    );
  }

  const {
    farmer,
    primaryCrop,
    nextBestAction,
    decisionNeedsRefresh,
    cropRecommendation,
    disease,
    irrigation,
    market,
    inventory,
    orders,
    alerts,
    freshness,
    quickActions,
  } = dashboard;

  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-[2rem] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-lime-50 p-6 shadow-xl dark:border-emerald-950 dark:from-emerald-950/50 dark:via-slate-950 dark:to-lime-950/30 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">
              Farmer Intelligence Dashboard
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold text-slate-950 dark:text-white">
              Welcome, {farmer.name}
            </h1>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              {[farmer.farmName, farmer.location?.label].filter(Boolean).join(" · ") ||
                "Your latest persisted AgroSphere intelligence"}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-white/75 px-5 py-4 dark:border-emerald-900 dark:bg-slate-950/60">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Primary crop
            </p>
            <p className="mt-1 font-display text-2xl font-semibold text-emerald-800 dark:text-emerald-200">
              {primaryCrop.label}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {primaryCrop.sourceLabel}
            </p>
          </div>
        </div>
      </section>

      {nextBestAction.available ? (
        <section className="rounded-[2rem] border border-slate-800 bg-slate-950 p-7 text-white shadow-2xl sm:p-9">
          <div className="grid gap-7 lg:grid-cols-[1.05fr,0.95fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-lime-300">
                Next Best Action
              </p>
              <h2 className="mt-4 font-display text-4xl font-bold sm:text-5xl">
                {nextBestAction.title}
              </h2>
              <div className="mt-5 inline-flex rounded-full bg-emerald-500/20 px-4 py-2 text-base font-semibold text-emerald-200">
                Priority Score: {nextBestAction.priorityScore} / 100
              </div>
              <p className="mt-4 text-sm text-slate-400">
                {nextBestAction.decisionVersion} · generated {formatDate(nextBestAction.generatedAt)}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/farmer/decision-engine"
                  className="rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                >
                  Open Full Decision
                </Link>
                <Link
                  to="/farmer/what-if-simulator"
                  className="rounded-full border border-slate-600 px-5 py-3 text-sm font-semibold text-white transition hover:border-lime-300 hover:text-lime-300"
                >
                  Run What-If Scenario
                </Link>
              </div>
            </div>
            <div className="rounded-3xl bg-white/5 p-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                Why this action?
              </h3>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
                {nextBestAction.reasons.length ? (
                  nextBestAction.reasons.map((reason) => (
                    <li key={reason} className="flex gap-3">
                      <span className="text-lime-300">✓</span>
                      <span>{reason}</span>
                    </li>
                  ))
                ) : (
                  <li>Open the full decision to inspect its stored factors.</li>
                )}
              </ul>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-[2rem] border border-dashed border-emerald-300 bg-white/90 p-7 shadow-lg dark:border-emerald-800 dark:bg-slate-950/80">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
            Next Best Action
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-slate-950 dark:text-slate-50">
            No farm decision has been generated yet.
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            AgroSphere will not invent a decision. Enter the current crop context in Farm Decision when you are ready.
          </p>
          <Link
            to="/farmer/decision-engine"
            className="mt-5 inline-flex rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Generate Next Best Action
          </Link>
        </section>
      )}

      {decisionNeedsRefresh ? (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-amber-300 bg-amber-50 px-6 py-5 dark:border-amber-900/60 dark:bg-amber-950/30">
          <div>
            <p className="font-semibold text-amber-950 dark:text-amber-100">
              New farm evidence is available since the last decision.
            </p>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
              The stored decision may be outdated. It has not been regenerated automatically.
            </p>
          </div>
          <Link
            to="/farmer/decision-engine"
            className="rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
          >
            Regenerate Decision
          </Link>
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300">
              Operational alerts
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
              What needs your attention
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Deterministic rules from stored records — no Gemini summary
          </p>
        </div>
        {alerts.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {alerts.map((alert) => (
              <article
                key={alert.code}
                className={`rounded-2xl border p-4 ${ALERT_STYLES[alert.category]}`}
              >
                <div className="flex items-start gap-3">
                  <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-bold dark:bg-slate-950/40">
                    {alert.category}
                  </span>
                  <div>
                    <p className="font-semibold">{alert.title}</p>
                    <p className="mt-1 text-sm leading-6 opacity-80">{alert.message}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
            No configured urgent, attention, informational, or missing-data alert is active.
          </p>
        )}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <ModuleCard
          eyebrow="Crop health"
          title="Latest Leaf Scan"
          freshness={disease.freshness}
          actionPath="/farmer/disease-detection"
          actionLabel={disease.available ? "Open Leaf Scanner" : "Scan a Leaf"}
        >
          {disease.available ? (
            <div className="space-y-4">
              <div>
                <p className="font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
                  {humanize(disease.crop)} — {disease.condition}
                </p>
                <p className="mt-2 text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                  Model confidence: {(disease.confidence * 100).toFixed(1)}%
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Confidence is for this classification; it is not disease severity.
                </p>
              </div>
              <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                <p>Leaf status: <strong>{disease.isHealthy ? "Healthy" : "Concern detected"}</strong></p>
                <p>Model: <strong>{disease.modelVersion}</strong></p>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Generated {formatDate(disease.generatedAt)}
              </p>
            </div>
          ) : (
            <EmptyModule
              message="No recent leaf scan available."
              detail="No healthy or disease status is assumed when a scan is missing."
            />
          )}
        </ModuleCard>

        <ModuleCard
          eyebrow="Irrigation"
          title="Latest Water Advice"
          freshness={irrigation.freshness}
          actionPath="/farmer/irrigation-advisor"
          actionLabel="Open Irrigation Advisor"
        >
          {irrigation.available ? (
            <div className="space-y-4">
              <p className="font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
                {irrigation.recommendedTiming}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Water stress", irrigation.waterStress, null],
                  ["Soil moisture", irrigation.soilMoistureStatus, null],
                  [
                    "Crop water requirement",
                    irrigation.cropWaterRequirement,
                    irrigation.units.cropWaterRequirement,
                  ],
                  [
                    "Estimated irrigation need",
                    irrigation.estimatedIrrigationNeed,
                    irrigation.units.estimatedIrrigationNeed,
                  ],
                ].map(([label, value, unit]) => (
                  <div key={label} className="rounded-2xl bg-sky-50 p-3 dark:bg-sky-950/30">
                    <p className="text-xs text-sky-700 dark:text-sky-300">{label}</p>
                    <p className="mt-1 font-semibold text-sky-950 dark:text-sky-100">
                      {typeof value === "number"
                        ? `${value} ${unit}`
                        : value || "Not available"}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Engine: {irrigation.engineVersion} · generated {formatDate(irrigation.generatedAt)}
              </p>
            </div>
          ) : (
            <EmptyModule
              message="No irrigation advice available."
              detail="The dashboard does not infer irrigation needs from missing records."
            />
          )}
        </ModuleCard>

        <ModuleCard
          eyebrow="Crop planning / previous recommendation"
          title="Latest Crop Recommendation"
          freshness={cropRecommendation.freshness}
          actionPath="/farmer/crop-recommendation"
          actionLabel="Open Crop Advisor"
        >
          {cropRecommendation.available ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Top planning recommendation</p>
                <p className="mt-1 font-display text-3xl font-semibold text-emerald-800 dark:text-emerald-200">
                  {humanize(cropRecommendation.topRecommendation)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Ranked crops
                </p>
                <ol className="mt-2 grid gap-2 sm:grid-cols-3">
                  {cropRecommendation.recommendations.map((item, index) => (
                    <li key={`${item.crop}-${index}`} className="rounded-2xl bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                      {index + 1}. {humanize(item.crop)}
                    </li>
                  ))}
                </ol>
              </div>
              <p className="rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                Planning information only. This does not mean you should replace the current {primaryCrop.available ? primaryCrop.label : "crop"}.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Model: {cropRecommendation.modelVersion} · generated {formatDate(cropRecommendation.generatedAt)}
              </p>
            </div>
          ) : (
            <EmptyModule
              message="No crop recommendation yet."
              detail="Use Crop Advisor when you want planning support for a future crop choice."
            />
          )}
        </ModuleCard>

        <ModuleCard
          eyebrow="Market reference"
          title="Historical Market Intelligence"
          freshness={market.freshness}
          actionPath="/farmer/market-intelligence"
          actionLabel="Open Market Intelligence"
        >
          {market.available ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-900/50 dark:bg-orange-950/30">
                <p className="font-semibold text-orange-950 dark:text-orange-100">
                  Not a current market price. Not a future forecast.
                </p>
                <p className="mt-1 text-xs leading-5 text-orange-800 dark:text-orange-200">
                  This card displays the stored 2021 historical reference used by market-v1.
                </p>
              </div>
              <div>
                <p className="font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
                  {market.selection?.commodity || humanize(market.crop)} — {market.selection?.market || "Stored market"}
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Historical observation: {formatDateOnly(market.referencePrice?.observedDate)}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-violet-50 p-3 dark:bg-violet-950/30">
                  <p className="text-xs text-violet-700 dark:text-violet-300">Historical modal price</p>
                  <p className="mt-1 font-semibold text-violet-950 dark:text-violet-100">
                    {formatCurrency(market.referencePrice?.modalPrice)} / quintal
                  </p>
                </div>
                <div className="rounded-2xl bg-violet-50 p-3 dark:bg-violet-950/30">
                  <p className="text-xs text-violet-700 dark:text-violet-300">Historical trend</p>
                  <p className="mt-1 font-semibold text-violet-950 dark:text-violet-100">
                    {market.trend} ({market.percentageChange}%)
                  </p>
                </div>
              </div>
              {market.manualScenario ? (
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Last manual scenario
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">
                    Estimated net return: {formatCurrency(market.manualScenario.estimatedNetReturn)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Based on farmer-entered scenario values; this is not realized profit.
                  </p>
                </div>
              ) : null}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Analysis: {market.analysisVersion} · stored {formatDate(market.generatedAt)}
              </p>
            </div>
          ) : (
            <EmptyModule
              message="No market analysis yet."
              detail="No current price or future forecast is assumed."
            />
          )}
        </ModuleCard>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.1fr,0.9fr]">
        <article className="rounded-[1.8rem] border border-white/60 bg-white/90 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/80">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">
            Marketplace operations
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
            Inventory and orders
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-amber-50 p-4 dark:bg-amber-950/30">
              <p className="text-xs text-amber-700 dark:text-amber-300">Crop records</p>
              <p className="mt-2 font-display text-3xl font-semibold text-amber-950 dark:text-amber-100">
                {inventory.listingCount}
              </p>
            </div>
            <div className="rounded-2xl bg-sky-50 p-4 dark:bg-sky-950/30">
              <p className="text-xs text-sky-700 dark:text-sky-300">Open orders</p>
              <p className="mt-2 font-display text-3xl font-semibold text-sky-950 dark:text-sky-100">
                {orders.openOrders}
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/30">
              <p className="text-xs text-emerald-700 dark:text-emerald-300">Delivered orders</p>
              <p className="mt-2 font-display text-3xl font-semibold text-emerald-950 dark:text-emerald-100">
                {orders.deliveredOrders}
              </p>
            </div>
            <div className="rounded-2xl bg-violet-50 p-4 dark:bg-violet-950/30">
              <p className="text-xs text-violet-700 dark:text-violet-300">Delivered order value</p>
              <p className="mt-2 font-display text-xl font-semibold text-violet-950 dark:text-violet-100">
                {formatCurrency(orders.deliveredOrderValue)}
              </p>
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Listed stock by unit</p>
            {inventory.stockByUnit.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {inventory.stockByUnit.map((stock) => (
                  <span key={stock.unit} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {stock.stockQuantity} {stock.unit} across {stock.listingCount} record{stock.listingCount === 1 ? "" : "s"}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No crop inventory records are stored.</p>
            )}
            <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {inventory.terminologyNote}
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/farmer/crops" className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400">
              Manage Crops
            </Link>
            <Link to="/farmer/orders" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-400 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-200">
              Open Orders
            </Link>
          </div>
        </article>

        <article className="rounded-[1.8rem] border border-white/60 bg-white/90 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/80">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-300">
            Evidence status
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
            Freshness and provenance
          </h2>
          <div className="mt-5 space-y-3">
            <EvidenceStatus label="Farm decision" value={freshness.decision} />
            <EvidenceStatus label="Disease scan" value={freshness.disease} />
            <EvidenceStatus label="Irrigation advice" value={freshness.irrigation} />
            <EvidenceStatus label="Market reference" value={freshness.market} />
            <EvidenceStatus label="Crop plan" value={freshness.cropRecommendation} />
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Disease, irrigation, and crop-plan freshness reuse the Task 7 thresholds. Market evidence remains historical/stale regardless of when its analysis record was saved.
          </p>
        </article>
      </section>

      <section className="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
          Quick actions
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
          Continue in a detailed farmer tool
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Link
              key={action.id}
              to={action.path}
              className="group rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-semibold text-slate-800 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-200"
            >
              <span className="flex items-center justify-between gap-3">
                {action.label}
                <span className="transition group-hover:translate-x-1" aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <details className="rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/70">
        <summary className="cursor-pointer font-semibold text-slate-900 dark:text-slate-100">
          How this dashboard is generated
        </summary>
        <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-600 dark:text-slate-300 md:grid-cols-2">
          <p><strong>Crop recommendation:</strong> latest persisted Random Forest result.</p>
          <p><strong>Disease detection:</strong> latest crop-matched MobileNetV2 result.</p>
          <p><strong>Irrigation:</strong> latest crop-matched agronomic decision-engine record.</p>
          <p><strong>Market:</strong> latest stored historical statistical analysis.</p>
          <p><strong>Farm decision:</strong> latest deterministic multi-factor DecisionSnapshot.</p>
          <p><strong>Dashboard:</strong> read-only Node aggregation; no model or Gemini is called.</p>
        </div>
      </details>
    </div>
  );
}
