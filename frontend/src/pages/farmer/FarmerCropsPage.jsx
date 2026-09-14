import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import TraceabilityQrPanel from "../../components/traceability/TraceabilityQrPanel";
import { useAuth } from "../../context/AuthContext";
import { ensureCropTraceability, listCrops } from "../../services/cropService";
import { formatCurrency } from "../../utils/formatters";

const getStockStatus = (stockQuantity) => {
  const quantity = Number(stockQuantity);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      key: "out",
      label: "Out of stock",
      className:
        "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
    };
  }

  if (quantity <= 10) {
    return {
      key: "low",
      label: "Low stock",
      className:
        "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    };
  }

  return {
    key: "in",
    label: "In stock",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  };
};

export default function FarmerCropsPage() {
  const { user } = useAuth();
  const [crops, setCrops] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCrop, setSelectedCrop] = useState(null);
  const [traceabilityError, setTraceabilityError] = useState("");
  const [preparingCropId, setPreparingCropId] = useState("");

  useEffect(() => {
    const loadFarmerCrops = async () => {
      setIsLoading(true);
      setError("");

      try {
        const response = await listCrops();
        const farmerCrops = (response.crops || []).filter(
          (crop) => String(crop.farmer?.user?._id || "") === String(user?.id || "")
        );
        setCrops(farmerCrops);
      } catch (requestError) {
        setError(requestError.message || "Failed to load farmer crops");
      } finally {
        setIsLoading(false);
      }
    };

    if (user?.id) {
      loadFarmerCrops();
    }
  }, [user?.id]);

  const handleOpenTraceability = async (crop) => {
    setTraceabilityError("");

    if (crop.traceabilityId) {
      setSelectedCrop(crop);
      return;
    }

    setPreparingCropId(crop._id);

    try {
      const response = await ensureCropTraceability(crop._id);
      const updatedCrop = response.crop;
      setCrops((currentCrops) =>
        currentCrops.map((currentCrop) =>
          currentCrop._id === updatedCrop._id ? updatedCrop : currentCrop
        )
      );
      setSelectedCrop(updatedCrop);
    } catch (requestError) {
      setTraceabilityError(
        requestError.message || "The crop traceability record could not be prepared."
      );
    } finally {
      setPreparingCropId("");
    }
  };

  const stockCounts = crops.reduce(
    (counts, crop) => {
      const status = getStockStatus(crop.stockQuantity);
      counts[status.key] += 1;
      return counts;
    },
    { in: 0, low: 0, out: 0 }
  );

  const summaryItems = [
    { label: "Total listings", value: crops.length, tone: "emerald" },
    { label: "In stock", value: stockCounts.in, tone: "lime" },
    { label: "Low stock", value: stockCounts.low, tone: "amber" },
    { label: "Out of stock", value: stockCounts.out, tone: "rose" },
  ];

  const summaryToneClasses = {
    emerald: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/25",
    lime: "border-lime-200 bg-lime-50/80 dark:border-lime-900/50 dark:bg-lime-950/25",
    amber: "border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/25",
    rose: "border-rose-200 bg-rose-50/80 dark:border-rose-900/50 dark:bg-rose-950/25",
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-3xl border border-white/60 bg-white/85 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/75 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
            Inventory workspace
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold text-slate-950 dark:text-slate-50">
            My Crops
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Manage your crop listings and available stock.
          </p>
        </div>
        <Link
          to="/farmer/crops/new"
          className="inline-flex w-fit shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Crop
        </Link>
      </header>

      {!isLoading && !error ? (
        <section aria-label="Crop inventory summary">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {summaryItems.map((item) => (
              <article
                key={item.label}
                className={`rounded-2xl border p-4 ${summaryToneClasses[item.tone]}`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  {item.label}
                </p>
                <p className="mt-2 font-display text-2xl font-bold text-slate-950 dark:text-slate-50">
                  {item.value}
                </p>
              </article>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Stock labels are interface rules: 0 is out of stock, 1–10 is low stock, and more than 10 is in stock.
          </p>
        </section>
      ) : null}

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {traceabilityError ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          {traceabilityError}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-3xl border border-white/60 bg-white/80 px-4 py-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
          Loading your crop listings...
        </div>
      ) : crops.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-emerald-300 bg-emerald-50/70 px-6 py-12 text-center dark:border-emerald-900 dark:bg-emerald-950/20">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-300">
            <svg viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-current stroke-[1.7]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 21V10M12 14c-4.5 0-7-2.5-7-7 4.5 0 7 2.5 7 7Zm0-2c4.5 0 7-2.5 7-7-4.5 0-7 2.5-7 7Z" />
            </svg>
          </div>
          <h2 className="mt-4 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
            No crops listed yet.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-300">
            Add your first crop to start selling through AgroSphere.
          </p>
          <Link
            to="/farmer/crops/new"
            className="mt-5 inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
          >
            Add Crop
          </Link>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2" aria-label="Your crop listings">
          {crops.map((crop) => {
            const stockStatus = getStockStatus(crop.stockQuantity);

            return (
              <article
                key={crop._id}
                className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 sm:min-h-52 sm:flex-row"
              >
                <div className="h-44 w-full shrink-0 bg-gradient-to-br from-emerald-100 via-lime-50 to-amber-100 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800 sm:h-auto sm:min-h-[180px] sm:w-2/5">
                  {crop.images?.[0]?.url ? (
                    <img src={crop.images[0].url} alt={crop.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-emerald-700/60 dark:text-emerald-300/60">
                      <svg viewBox="0 0 24 24" className="h-9 w-9 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 21V10M12 14c-4.5 0-7-2.5-7-7 4.5 0 7 2.5 7 7Zm0-2c4.5 0 7-2.5 7-7-4.5 0-7 2.5-7 7Z" />
                      </svg>
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-lg font-semibold text-slate-950 dark:text-slate-50">
                        {crop.name}
                      </h2>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {crop.category} · {crop.season}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold ${stockStatus.className}`}>
                      {stockStatus.label}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Price</p>
                      <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                        {formatCurrency(crop.price)} / {crop.unit}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Available stock</p>
                      <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                        {crop.stockQuantity} {crop.unit}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 truncate text-xs text-slate-500 dark:text-slate-400">
                    {crop.location?.district}, {crop.location?.state}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-600 dark:text-slate-300">
                    {crop.description}
                  </p>

                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    <Link
                      to={`/crop/${crop._id}`}
                      className="inline-flex rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-700 dark:text-slate-200 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300"
                    >
                      View details
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleOpenTraceability(crop)}
                      disabled={preparingCropId === crop._id}
                      className="inline-flex rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:bg-slate-400 dark:focus-visible:ring-offset-slate-950"
                    >
                      {preparingCropId === crop._id ? "Preparing..." : "QR / Trace"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {selectedCrop ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedCrop(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="traceability-dialog-title"
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-white/70 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
                  Crop traceability
                </p>
                <h2
                  id="traceability-dialog-title"
                  className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50"
                >
                  {selectedCrop.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCrop(null)}
                aria-label="Close traceability dialog"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                ×
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Share or print this QR so customers can open the listing's public crop passport.
            </p>
            <div className="mt-6 rounded-3xl bg-emerald-50/70 p-4 dark:bg-emerald-950/20 sm:p-5">
              <TraceabilityQrPanel
                traceabilityId={selectedCrop.traceabilityId}
                cropName={selectedCrop.name}
                compact
              />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
