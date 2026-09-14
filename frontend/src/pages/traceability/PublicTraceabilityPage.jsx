import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import TraceabilityQrPanel from "../../components/traceability/TraceabilityQrPanel";
import { getTraceabilityRecord } from "../../services/traceabilityService";
import { formatCurrency, formatDate } from "../../utils/formatters";

const formatDateOnly = (dateValue) => {
  if (!dateValue) {
    return "Not provided";
  }

  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(dateValue)
  );
};

export default function PublicTraceabilityPage() {
  const { traceabilityId } = useParams();
  const [record, setRecord] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadTraceabilityRecord = async () => {
      setIsLoading(true);
      setError("");

      try {
        const response = await getTraceabilityRecord(traceabilityId);
        setRecord(response.traceability);
      } catch (requestError) {
        setError(
          requestError.status === 404
            ? "This crop traceability record could not be found."
            : "The traceability service is currently unavailable. Please try again later."
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadTraceabilityRecord();
  }, [traceabilityId]);

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-white/60 bg-white/80 px-4 py-12 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
        Loading the crop trace record...
      </div>
    );
  }

  if (error || !record) {
    return (
      <section className="mx-auto max-w-2xl rounded-3xl border border-rose-200 bg-rose-50 px-6 py-10 text-center dark:border-rose-900/50 dark:bg-rose-950/30">
        <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-slate-50">
          Trace record unavailable
        </h1>
        <p className="mt-3 text-sm leading-6 text-rose-700 dark:text-rose-300">{error}</p>
        <Link
          to="/marketplace"
          className="mt-5 inline-flex rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          Browse marketplace
        </Link>
      </section>
    );
  }

  const { crop, farmer } = record;

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-[2rem] border border-emerald-100 bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
              AgroSphere crop passport
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">{crop.name}</h1>
            <p className="mt-2 text-sm text-emerald-100">
              {crop.category} · {crop.location.district}, {crop.location.state}
            </p>
          </div>
          <span className="w-fit rounded-full border border-white/20 bg-white/10 px-3 py-1.5 font-mono text-xs text-emerald-50">
            {record.traceabilityId}
          </span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <main className="space-y-6">
          <section className="overflow-hidden rounded-[2rem] border border-white/60 bg-white/90 shadow-lg dark:border-slate-800 dark:bg-slate-950/80">
            <div className="h-64 bg-gradient-to-br from-emerald-100 via-lime-50 to-amber-100 sm:h-80 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800">
              {crop.imageUrl ? (
                <img src={crop.imageUrl} alt={crop.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-emerald-700/60 dark:text-emerald-300/60">
                  Crop image not provided
                </div>
              )}
            </div>
            <div className="p-6">
              <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">{crop.description}</p>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Season</p>
                  <p className="mt-1 font-semibold text-slate-950 dark:text-slate-50">{crop.season}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Available stock</p>
                  <p className="mt-1 font-semibold text-slate-950 dark:text-slate-50">
                    {crop.availableStock} {crop.unit}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Listed price</p>
                  <p className="mt-1 font-semibold text-slate-950 dark:text-slate-50">
                    {formatCurrency(crop.price)} / {crop.unit}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Harvest date</p>
                  <p className="mt-1 font-semibold text-slate-950 dark:text-slate-50">
                    {formatDateOnly(crop.harvestDate)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900 sm:col-span-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Listing date</p>
                  <p className="mt-1 font-semibold text-slate-950 dark:text-slate-50">
                    {formatDate(crop.listedAt)}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/80">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
              Record timeline
            </p>
            <h2 className="mt-3 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
              Listing provenance
            </h2>
            <ol className="mt-5 space-y-4 border-l-2 border-emerald-200 pl-5 dark:border-emerald-900">
              <li className="relative">
                <span className="absolute -left-[1.65rem] top-1 h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-white dark:ring-slate-950" />
                <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                  Farmer-provided harvest date
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {formatDateOnly(crop.harvestDate)}
                </p>
              </li>
              <li className="relative">
                <span className="absolute -left-[1.65rem] top-1 h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-white dark:ring-slate-950" />
                <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                  Listed on AgroSphere
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {formatDate(crop.listedAt)}
                </p>
              </li>
            </ol>
          </section>

          <section className="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/80">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400">
              Farmer information
            </p>
            <h2 className="mt-3 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
              {farmer.farmName}
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Listed by {farmer.displayName} · {farmer.location.district}, {farmer.location.state}
            </p>
          </section>
        </main>

        <aside className="h-fit rounded-[2rem] border border-emerald-100 bg-emerald-50/70 p-5 shadow-lg dark:border-emerald-950 dark:bg-emerald-950/20 sm:p-6">
          <h2 className="font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
            Scan this crop record
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            This QR opens the same public AgroSphere crop passport shown on this page.
          </p>
          <div className="mt-5">
            <TraceabilityQrPanel
              traceabilityId={record.traceabilityId}
              cropName={crop.name}
              compact
            />
          </div>
        </aside>
      </div>

      <footer className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-200">
        {record.disclaimer}
      </footer>
    </div>
  );
}
