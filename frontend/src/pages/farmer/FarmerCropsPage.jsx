import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { listCrops } from "../../services/cropService";
import { formatCurrency } from "../../utils/formatters";

export default function FarmerCropsPage() {
  const { user } = useAuth();
  const [crops, setCrops] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadFarmerCrops = async () => {
      setIsLoading(true);
      setError("");

      try {
        const response = await listCrops();
        const farmerCrops = (response.crops || []).filter(
          (crop) => crop.farmer?.user?._id === user?.id
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

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/60 bg-white/85 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/75">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
              Crop Management
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold text-slate-950 dark:text-slate-50">
              Keep your listings fresh and your stock accurate.
            </h1>
          </div>
          <Link
            to="/farmer/crops/new"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-500 hover:shadow-lg"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Crop
          </Link>
        </div>
        <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">
          This page reads from `GET /api/crops` and narrows the data to the signed-in farmer.
          In the next UI phase, the create and edit forms can submit multipart requests directly
          to the crop CRUD endpoints you already built.
        </p>
      </section>

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-3xl border border-white/60 bg-white/80 px-4 py-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
          Loading your crop listings...
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {crops.map((crop) => (
            <article
              key={crop._id}
              className="rounded-[1.8rem] border border-white/60 bg-white/85 p-5 shadow-lg dark:border-slate-800 dark:bg-slate-950/75"
            >
              <h2 className="font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
                {crop.name}
              </h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {crop.category} | {crop.season}
              </p>
              <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  Price: <span className="font-semibold">{formatCurrency(crop.price)}</span> /{" "}
                  {crop.unit}
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  Stock:{" "}
                  <span className="font-semibold">
                    {crop.stockQuantity} {crop.unit}
                  </span>
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  Rating: <span className="font-semibold">{crop.averageRating || 0} / 5</span>
                </p>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {crop.description}
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-200"
                >
                  Edit form next
                </button>
                <button
                  type="button"
                  className="rounded-full border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-300 dark:hover:bg-rose-950/30"
                >
                  Delete flow next
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
