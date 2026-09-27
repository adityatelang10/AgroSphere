import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import UserAvatar from "../../components/profile/UserAvatar";
import { getPublicFarmerProfile } from "../../services/farmerProfileService";
import CropImageGallery from "../../components/marketplace/CropImageGallery";
import CropImage from "../../components/marketplace/CropImage";
import RatingSummary from "../../components/marketplace/RatingSummary";
import { getCropImages } from "../../utils/cropImages";
import { formatCurrency } from "../../utils/formatters";

export default function FarmerProfilePage() {
  const { id } = useParams();
  const [farmer, setFarmer] = useState(null);
  const [crops, setCrops] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadFarmerProfile = async () => {
      setIsLoading(true);
      setError("");

      try {
        const response = await getPublicFarmerProfile(id);
        if (active) {
          setCrops(response.crops || []);
          setFarmer(response.profile || null);
        }
      } catch (requestError) {
        if (active) setError(requestError.message || "Failed to load farmer profile");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadFarmerProfile();
    return () => { active = false; };
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <UserAvatar
            name={farmer.user?.name}
            imageUrl={farmer.user?.profileImage?.url}
            className="h-20 w-20 text-xl ring-4 ring-emerald-100 dark:ring-emerald-950"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
              Farmer Profile
            </p>
            <h1 className="mt-2 break-words font-display text-3xl font-bold text-slate-950 dark:text-slate-50 sm:text-4xl">
              {farmer.farmName}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {farmer.user?.name ? `${farmer.user.name} · ` : ""}{[farmer.location?.district, farmer.location?.state].filter(Boolean).join(", ")}
            </p>
          </div>
        </div>
        <p className="mt-5 max-w-3xl whitespace-pre-wrap break-words text-sm leading-7 text-slate-600 dark:text-slate-300">
          {farmer.bio || "This farmer has not added a detailed profile bio yet."}
        </p>

        <div className="mt-6 flex flex-wrap gap-4">
          <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              Average Rating
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">
              <RatingSummary averageRating={farmer.averageRating} totalReviews={farmer.totalReviews} />
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

      <section className="min-w-0 space-y-4 rounded-3xl border border-white/60 bg-white/85 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/75 sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">A look around the farm</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">Farm gallery</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Photos shared by the farmer.</p>
        </div>
        {farmer.gallery?.length ? <CropImageGallery key={farmer._id} crop={{ name: farmer.farmName, images: farmer.gallery }} />
          : <p className="text-sm text-slate-500 dark:text-slate-400">This farmer has not shared farm photos yet.</p>}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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

        <div className="farmer-profile-crops grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {crops.map((crop) => (
            <article
              key={crop._id}
              className="flex min-w-0 flex-col rounded-2xl border border-white/60 bg-white/85 p-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-950/75 sm:p-3"
            >
              <Link to={`/crop/${crop._id}`} aria-label={`View ${crop.name}`} className="mb-2 block h-[170px] shrink-0 overflow-hidden rounded-xl">
                <CropImage src={getCropImages(crop)[0]?.url} alt={crop.name} className="h-full w-full object-cover" />
              </Link>
              <h3 title={crop.name} className="line-clamp-2 break-words font-display text-base font-semibold leading-5 text-slate-950 dark:text-slate-50">
                {crop.name}
              </h3>
              <div className="mt-1 min-w-0"><RatingSummary averageRating={crop.averageRating} totalReviews={crop.totalReviews} /></div>
              <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" title={`${crop.category} | ${crop.season}`}>
                {crop.category} | {crop.season}
              </p>
              <p className="mt-2 line-clamp-2 break-words text-xs leading-5 text-slate-600 dark:text-slate-300">
                {crop.description}
              </p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
                <p className="min-w-0 break-words text-sm font-semibold text-slate-950 dark:text-slate-50">
                  {formatCurrency(crop.price)} / {crop.unit}
                </p>
                <Link
                  to={`/crop/${crop._id}`}
                  className="inline-flex min-h-8 items-center justify-center rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 dark:border-slate-700 dark:text-slate-200"
                >
                  View crop
                </Link>
              </div>
            </article>
          ))}
        </div>
        {!crops.length ? <p className="text-sm text-slate-500 dark:text-slate-400">No active crop listings at the moment.</p> : null}
      </section>
    </div>
  );
}
