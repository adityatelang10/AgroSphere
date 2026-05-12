import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { getCropById } from "../../services/cropService";
import { getCropReviews } from "../../services/reviewService";
import { formatCurrency, formatDate } from "../../utils/formatters";

export default function CropDetailsPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { addToCart } = useCart();
  const [crop, setCrop] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadCropDetails = async () => {
      setIsLoading(true);
      setError("");

      try {
        const [cropResponse, reviewResponse] = await Promise.all([
          getCropById(id),
          getCropReviews(id).catch(() => ({ reviews: [] })),
        ]);

        setCrop(cropResponse.crop);
        setReviews(reviewResponse.reviews || []);
      } catch (requestError) {
        setError(requestError.message || "Failed to load crop details");
      } finally {
        setIsLoading(false);
      }
    };

    loadCropDetails();
  }, [id]);

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-white/60 bg-white/80 px-4 py-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
        Loading crop details...
      </div>
    );
  }

  if (error || !crop) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
        {error || "Crop not found"}
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr,0.8fr]">
      <section className="space-y-6 rounded-[2rem] border border-white/60 bg-white/85 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/75">
        <div className="grid gap-4 md:grid-cols-2">
          {(crop.images?.length ? crop.images : [{ url: "", publicId: "placeholder" }]).map(
            (image, index) => (
              <div
                key={image.publicId || index}
                className="h-64 overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-emerald-100 via-lime-50 to-amber-100 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800"
              >
                {image.url ? (
                  <img
                    src={image.url}
                    alt={`${crop.name} ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
            )
          )}
        </div>

        <div>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
            {crop.category}
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold text-slate-950 dark:text-slate-50">
            {crop.name}
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {crop.location?.district}, {crop.location?.state} | {crop.season}
          </p>
          <p className="mt-5 text-sm leading-7 text-slate-600 dark:text-slate-300">
            {crop.description}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              Price
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">
              {formatCurrency(crop.price)} / {crop.unit}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              Stock
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">
              {crop.stockQuantity} {crop.unit}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              Rating
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">
              {crop.averageRating || 0} / 5
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            to={`/farmer/${crop.farmer?._id}`}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-amber-400 hover:text-amber-700 dark:border-slate-700 dark:text-slate-200"
          >
            View farmer profile
          </Link>
          <button
            type="button"
            onClick={() =>
              addToCart({
                cropId: crop._id,
                name: crop.name,
                price: crop.price,
                unit: crop.unit,
                imageUrl: crop.images?.[0]?.url || "",
              })
            }
            disabled={user?.role === "FARMER"}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {user?.role === "FARMER" ? "Farmer accounts cannot cart" : "Add to cart"}
          </button>
        </div>
      </section>

      <aside className="space-y-6">
        <section className="rounded-[2rem] border border-white/60 bg-white/85 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/75">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700 dark:text-amber-400">
            Farmer
          </p>
          <h2 className="mt-3 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
            {crop.farmer?.farmName || "Farm profile"}
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
            {crop.farmer?.bio || "Farmer bio will appear here once the profile flow is completed."}
          </p>
        </section>

        <section className="rounded-[2rem] border border-white/60 bg-white/85 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/75">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
                Reviews
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950 dark:text-slate-50">
                Customer feedback
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {reviews.length}
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {reviews.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No reviews yet. Delivered orders can add ratings here.
              </p>
            ) : (
              reviews.map((review) => (
                <article
                  key={review._id}
                  className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {review.customer?.name || "Customer"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(review.createdAt)}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                    Rating:{" "}
                    <span className="text-slate-500 dark:text-slate-400">{review.rating}/5</span>
                  </p>
                  {review.comment ? (
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {review.comment}
                    </p>
                  ) : null}
                  {review.farmerReply ? (
                    <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Farmer reply: {review.farmerReply}
                    </p>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
