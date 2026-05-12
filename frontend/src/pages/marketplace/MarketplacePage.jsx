import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { listCrops } from "../../services/cropService";
import { formatCurrency } from "../../utils/formatters";

const initialFilters = {
  search: "",
  category: "",
  season: "",
  isOrganic: "",
  minPrice: "",
  maxPrice: "",
  district: "",
  state: "",
};

export default function MarketplacePage() {
  const { user } = useAuth();
  const { addToCart } = useCart();
  const [filters, setFilters] = useState(initialFilters);
  const [crops, setCrops] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCrops = async (nextFilters = filters) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await listCrops(nextFilters);
      setCrops(response.crops || []);
    } catch (requestError) {
      setError(requestError.message || "Failed to load marketplace crops");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCrops(initialFilters);
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFilters((currentFilters) => ({
      ...currentFilters,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await loadCrops(filters);
  };

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-white/60 bg-white/80 p-6 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
        <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr] lg:items-end">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
              Fresh From Indian Farms
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
              Discover crops, compare farmers, and buy directly with confidence.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
              AgroSphere brings farmer listings, verified order tracking, ratings, and AI
              support into one clean marketplace experience built for Indian agriculture.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="grid gap-3 rounded-[1.75rem] bg-slate-50 p-4 dark:bg-slate-900"
          >
            <input
              name="search"
              value={filters.search}
              onChange={handleChange}
              placeholder="Search crop name or description"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="category"
                value={filters.category}
                onChange={handleChange}
                placeholder="Category"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <input
                name="season"
                value={filters.season}
                onChange={handleChange}
                placeholder="Season"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <input
                name="district"
                value={filters.district}
                onChange={handleChange}
                placeholder="District"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <input
                name="state"
                value={filters.state}
                onChange={handleChange}
                placeholder="State"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <input
                name="minPrice"
                value={filters.minPrice}
                onChange={handleChange}
                placeholder="Min price"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <input
                name="maxPrice"
                value={filters.maxPrice}
                onChange={handleChange}
                placeholder="Max price"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  name="isOrganic"
                  checked={filters.isOrganic === "true"}
                  onChange={(event) =>
                    setFilters((currentFilters) => ({
                      ...currentFilters,
                      isOrganic: event.target.checked ? "true" : "",
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                Organic only
              </label>

              <button
                type="submit"
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                Apply filters
              </button>
            </div>
          </form>
        </div>
      </section>

      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-3xl border border-white/60 bg-white/80 px-4 py-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
          Loading crops from AgroSphere marketplace...
        </div>
      ) : (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {crops.map((crop) => (
            <article
              key={crop._id}
              className="overflow-hidden rounded-[1.8rem] border border-white/60 bg-white/85 shadow-lg shadow-emerald-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/75"
            >
              <div className="h-52 bg-gradient-to-br from-emerald-100 via-lime-50 to-amber-100 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800">
                {crop.images?.[0]?.url ? (
                  <img
                    src={crop.images[0].url}
                    alt={crop.name}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>

              <div className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-xl font-semibold text-slate-950 dark:text-slate-50">
                      {crop.name}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {crop.category} | {crop.location?.district}, {crop.location?.state}
                    </p>
                  </div>
                  {crop.isOrganic ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      Organic
                    </span>
                  ) : null}
                </div>

                <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {crop.description}
                </p>

                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Price
                      </p>
                      <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-50">
                        {formatCurrency(crop.price)} / {crop.unit}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                        Stock
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                        {crop.stockQuantity} {crop.unit}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    to={`/crop/${crop._id}`}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-200"
                  >
                    View details
                  </Link>
                  <Link
                    to={`/farmer/${crop.farmer?._id}`}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-amber-400 hover:text-amber-700 dark:border-slate-700 dark:text-slate-200"
                  >
                    Farmer profile
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
                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:disabled:bg-slate-700"
                  >
                    {user?.role === "FARMER" ? "Farmer accounts cannot cart" : "Add to cart"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
