import { useEffect, useRef, useState } from "react";

import { getLatestMandiPrices } from "../../services/mandiPriceService";
import {
  NO_REPORT_MESSAGE, formatMandiDate, formatMandiPrice, getCommodities, getDistricts,
  getMandiFreshness, getMarkets, getSelectedRecords, initialMandiSelection, mandiRecordKey, quintalToKg,
} from "../../utils/mandiPriceHelpers";

const inputClass = "mt-1.5 h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const freshnessClass = {
  TODAY: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  RECENT: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  OLDER: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  STALE: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
};

export default function LatestMandiPricePanel() {
  const [state, setState] = useState("Karnataka");
  const [data, setData] = useState(null);
  const [selection, setSelection] = useState(initialMandiSelection([]));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const requestRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => { clearInterval(timer); requestRef.current?.abort(); };
  }, []);

  const loadReports = async (event) => {
    event.preventDefault();
    if (loading) return;
    if (!state.trim()) { setError("Enter a state using its Government reporting name."); return; }
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    setData(null);
    setSelection(initialMandiSelection([]));
    try {
      const response = await getLatestMandiPrices({ state: state.trim() }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!Array.isArray(response.records) || !response.source) throw new Error("The mandi price service returned an invalid response.");
      setData(response);
      setSelection(initialMandiSelection(response.records));
      setNow(new Date());
    } catch (requestError) {
      if (controller.signal.aborted) return;
      if (requestError.status === 401) setError("Your session has expired. Please log in again.");
      else if (requestError.status === 403) setError("Mandi reports are available to farmer accounts only.");
      else setError(requestError.status ? requestError.message : "Mandi price service is temporarily unavailable. Please try again later.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const records = data?.records || [];
  const selectedRecords = getSelectedRecords(records, selection);
  const filters = [
    { name: "district", label: "District", options: getDistricts(records) },
    { name: "market", label: "Market", options: getMarkets(records, selection.district) },
    { name: "commodity", label: "Commodity", options: getCommodities(records, selection.district, selection.market) },
  ];
  const changeSelection = (name, value) => {
    if (name === "district") setSelection(initialMandiSelection(records, value));
    else if (name === "market") setSelection(initialMandiSelection(records, selection.district, value));
    else setSelection((current) => ({ ...current, commodity: value }));
  };

  return (
    <section aria-labelledby="latest-mandi-heading" aria-busy={loading} className="min-w-0 rounded-3xl border border-violet-200 bg-white/95 p-4 shadow-sm dark:border-violet-900 dark:bg-slate-950/90 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">Government daily wholesale mandi reporting</p>
          <h2 id="latest-mandi-heading" className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">Latest Reported Mandi Price</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Daily reported observations, not second-by-second trading prices or forecasts.</p>
        </div>
        <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200">data.gov.in / AGMARKNET</span>
      </div>

      <form onSubmit={loadReports} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-0 sm:w-72">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">State</span>
          <input value={state} maxLength={120} required disabled={loading} className={inputClass}
            onChange={(event) => { setState(event.target.value); setData(null); setError(""); setSelection(initialMandiSelection([])); }} />
        </label>
        <button type="submit" disabled={loading} className="h-10 rounded-xl bg-violet-700 px-5 text-sm font-semibold text-white hover:bg-violet-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 disabled:cursor-wait disabled:bg-slate-400">
          {loading ? "Loading current reports..." : "Load Current Reports"}
        </button>
      </form>
      {error ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error}</p> : null}
      {loading ? <p role="status" className="mt-4 text-sm text-slate-500">Loading the Government reporting snapshot...</p> : null}

      {data ? (
        <div className="mt-5 space-y-4">
          <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
            {data.validRecordCount} valid reports loaded for {data.query.state}. Only markets reported in the current Government snapshot are shown.
            {" "}Fetched {new Date(data.source.fetchedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST{data.source.cached ? " · 30-minute server cache" : ""}.
          </p>
          {data.truncated ? <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Partial snapshot: the provider pagination or safety limit was reached. These options may not cover all current reports.</p> : null}
          {data.invalidRecordCount > 0 ? <p className="text-xs text-amber-800 dark:text-amber-300">{data.invalidRecordCount} invalid, future-dated or mismatched reports were excluded. Missing prices are not treated as zero.</p> : null}
          {data.duplicateRecordCount > 0 ? <p className="text-xs text-slate-500">{data.duplicateRecordCount} exact duplicate reports removed; different varieties and grades remain separate.</p> : null}

          {records.length ? (
            <div className="grid min-w-0 gap-3 md:grid-cols-3">
              {filters.map(({ name, label, options }) => (
                <label key={name} className="block min-w-0">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
                  <select className={inputClass} value={selection[name]} onChange={(event) => changeSelection(name, event.target.value)}>
                    {options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
              ))}
            </div>
          ) : <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200">{data.status === "NO_VALID_REPORTS" ? "Provider reports were returned, but none passed validation. No replacement price has been generated." : NO_REPORT_MESSAGE}</p>}

          {selectedRecords.length > 1 ? <p className="text-xs text-slate-500 dark:text-slate-400">{selectedRecords.length} reported rows for this commodity. Each variety, grade and reporting date is shown separately.</p> : null}
          {selectedRecords.map((record) => {
            const freshness = getMandiFreshness(record.reportedDate, now);
            if (["FUTURE", "UNAVAILABLE"].includes(freshness.status)) return <p key={mandiRecordKey(record)} className="text-sm text-amber-700">{freshness.label}. Reload reports.</p>;
            return (
              <article key={mandiRecordKey(record)} className="min-w-0 rounded-2xl border border-violet-100 bg-violet-50/40 p-4 dark:border-violet-950 dark:bg-violet-950/15">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 break-words">
                    <h3 className="text-lg font-semibold text-slate-950 dark:text-slate-50">{record.commodity}</h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{record.market} · {record.district}, {record.state}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Variety: {record.variety || "Not reported"} · Grade: {record.grade || "Not reported"}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Reported date: {formatMandiDate(record.reportedDate)}</p>
                  </div>
                  <span className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${freshnessClass[freshness.status]}`}>{freshness.label} · {freshness.status}</span>
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[["Minimum", record.minPrice], ["Modal", record.modalPrice], ["Maximum", record.maxPrice]].map(([label, value]) => (
                    <div key={label} className={`min-w-0 rounded-xl p-3 ${label === "Modal" ? "bg-violet-100 dark:bg-violet-900/40" : "bg-white dark:bg-slate-900"}`}>
                      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
                      <dd className="mt-1 break-words font-display text-xl font-semibold text-slate-950 dark:text-slate-100">{formatMandiPrice(value)} <span className="text-xs font-normal">/ quintal</span></dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Calculated equivalent (modal): ≈ {formatMandiPrice(quintalToKg(record.modalPrice), true)} / kg. 1 quintal = 100 kg; this conversion is not a provider-returned quote.</p>
              </article>
            );
          })}
        </div>
      ) : !loading ? <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Load reports to see the available districts, markets and commodities. No sample prices are preloaded.</p> : null}

      <footer className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <p>Source: AGMARKNET / Directorate of Marketing and Inspection, Ministry of Agriculture and Farmers Welfare, via <a href="https://www.data.gov.in/catalog/current-daily-price-various-commodities-various-markets-mandi" target="_blank" rel="noreferrer" className="underline underline-offset-2">data.gov.in</a>.</p>
        <p className="font-medium text-slate-700 dark:text-slate-300">Wholesale mandi reference price; actual farmer realization may differ.</p>
        <p>Freshness is an AgroSphere display policy: today, recent (1–2 days), older (3–7 days), stale (over 7 days). No new trend or forecast is calculated. These prices do not change your manual sale-price inputs or Farm Decision score.</p>
      </footer>
    </section>
  );
}
