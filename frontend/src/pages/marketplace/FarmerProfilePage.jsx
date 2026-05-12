import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { listCrops } from "../../services/cropService";
import { formatCurrency } from "../../utils/formatters";

export default function FarmerProfilePage() {
  const { id } = useParams();
  const [farmer, setFarmer] = useState(null);
  const [crops, setCrops] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadFarmerProfile = async () => {
      setIsLoading(true);
      setError("");

      try {
        const response = await listCrops();
        const farmerCrops = (response.crops || []).filter(
          (crop) => crop.farmer?._id === id
        );

        setCrops(farmerCrops);
        setFarmer(farmerCrops[0]?.farmer || null);
      } catch (requestError) {
        setError(requestError.message || "Failed to load farmer profile");
      } finally {
        setIsLoading(false);
      }
    };

    loadFarmerProfile();
  }, [id]);

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-white/60 bg-white/80 px-4 py-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
        Loading farmer profile...
      </div>
    );
  }

  if (error || !farmer) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
        {error || "Farmer profile not found"}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-white/60 bg-white/85 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/75">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
          Farmer Profile
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold text-slate-950 dark:text-slate-50">
          {farmer.farmName}
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {farmer.location?.district}, {farmer.location?.state}
        </p>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
          {farmer.bio || "This farmer has not added a detailed profile bio yet."}
        </p>

        <div className="mt-6 flex flex-wrap gap-4">
          <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              Average Rating
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">
              {farmer.averageRating || 0} / 5
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              Reviews
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">
              {farmer.totalReviews || 0}
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700 dark:text-amber-400">
              Available Listings
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950 dark:text-slate-50">
              Crops from this farm
            </h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {crops.length} listings
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {crops.map((crop) => (
            <article
              key={crop._id}
              className="rounded-[1.8rem] border border-white/60 bg-white/85 p-5 shadow-lg dark:border-slate-800 dark:bg-slate-950/75"
            >
              <h3 className="font-display text-xl font-semibold text-slate-950 dark:text-slate-50">
                {crop.name}
              </h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {crop.category} | {crop.season}
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {crop.description}
              </p>
              <div className="mt-5 flex items-center justify-between">
                <p className="text-lg font-semibold text-slate-950 dark:text-slate-50">
                  {formatCurrency(crop.price)} / {crop.unit}
                </p>
                <Link
                  to={`/crop/${crop._id}`}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-200"
                >
                  View crop
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
