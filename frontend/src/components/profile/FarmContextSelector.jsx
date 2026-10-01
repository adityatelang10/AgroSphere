import { useFarmContext } from "../../context/FarmContext";

export default function FarmContextSelector({ disabled = false }) {
  const farm = useFarmContext();
  if (!farm) return null;
  return <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/20">
    <label className="block font-medium text-slate-800 dark:text-slate-200">Current listing context
      <select value={farm.selectedListing?._id || ""} onChange={(event) => farm.selectListing(event.target.value)} disabled={farm.loading || disabled}
        className="ml-0 mt-2 w-full rounded-xl border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-950">
        <option value="">No listing selected — enter crop manually</option>
        {farm.crops.map((crop) => <option key={crop._id} value={crop._id}>{crop.name} · {crop.stockQuantity} {crop.unit} · {crop.location?.district}</option>)}
      </select>
    </label>
    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{farm.loading ? "Loading your farm context…" : farm.selectedListing ? "From your selected active listing · suggestions remain editable. This is not proof of a growing field or harvest stage." : "Choose once to reuse a listing across farmer tools. No crop is guessed when several listings exist."}</p>
    {farm.error ? <p role="alert" className="mt-2 text-amber-700 dark:text-amber-300">{farm.error}</p> : null}
    <button type="button" onClick={farm.reload} disabled={farm.loading || disabled} className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Refresh farm context</button>
  </section>;
}

export function PrefillSources({ sources }) {
  const entries = Object.entries(sources).filter(([, source]) => source !== "Manual input");
  return entries.length ? <p className="text-xs leading-5 text-slate-500 dark:text-slate-400" role="status">Prefilled, editable: {entries.map(([field, source]) => `${field.replace(/([A-Z])/g, " $1").toLowerCase()} — ${source}`).join("; ")}.</p> : null;
}
