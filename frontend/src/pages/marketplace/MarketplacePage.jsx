import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import MobileFilterSheet from "../../components/marketplace/MobileFilterSheet";
import MarketplaceCropCard from "../../components/marketplace/MarketplaceCropCard";
import ScrollReveal from "../../components/ui/ScrollReveal";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { listCrops } from "../../services/cropService";

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
  const navigate = useNavigate();
  const [filters, setFilters] = useState(initialFilters);
  const [crops, setCrops] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);

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
    setFiltersOpen(false);
    await loadCrops(filters);
  };

  const handleAddToCart = (crop) => {
    if (user?.role !== "CUSTOMER") {
      navigate("/login", { state: { from: { pathname: "/marketplace" } } });
      return;
    }

    addToCart({
      cropId: crop._id,
      name: crop.name,
      price: crop.price,
      unit: crop.unit,
      imageUrl: crop.images?.[0]?.url || "",
      stockQuantity: crop.stockQuantity,
    });
    navigate("/cart");
  };

  // Both presentations use the same controlled fields and existing submit handler.
  const renderFilters = (mobile = false) => (
    <form
      onSubmit={handleSubmit}
      className={`${mobile ? "marketplace-sheet-form" : "marketplace-desktop-filters"} grid gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-900`}
    >
      <input
        name="search"
        value={filters.search}
        onChange={handleChange}
        placeholder="Search crop name or description"
        aria-label="Search crop name or description"
        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="category"
          value={filters.category}
          onChange={handleChange}
          placeholder="Category"
          aria-label="Category"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        <input
          name="season"
          value={filters.season}
          onChange={handleChange}
          placeholder="Season"
          aria-label="Season"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        <input
          name="district"
          value={filters.district}
          onChange={handleChange}
          placeholder="District"
          aria-label="District"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        <input
          name="state"
          value={filters.state}
          onChange={handleChange}
          placeholder="State"
          aria-label="State"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        <input
          name="minPrice"
          value={filters.minPrice}
          onChange={handleChange}
          placeholder="Min price"
          aria-label="Min price"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        <input
          name="maxPrice"
          value={filters.maxPrice}
          onChange={handleChange}
          placeholder="Max price"
          aria-label="Max price"
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
          Farmer-declared organic only
        </label>

        <button
          type="submit"
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          Apply filters
        </button>
      </div>
    </form>
  );

  return (
    <div className="marketplace-page space-y-6">
      {filtersOpen ? <MobileFilterSheet onClose={closeFilters}>{renderFilters(true)}</MobileFilterSheet> : null}
      <ScrollReveal
        as="section"
        className="marketplace-heading overflow-hidden rounded-3xl border border-white/60 bg-white/80 p-5 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-950/70 sm:p-6"
      >
        <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr] lg:items-end">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-400">
              Fresh From Indian Farms
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-slate-50 sm:text-4xl">
              Discover crops, compare farmers, and buy directly with confidence.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
              AgroSphere brings farmer listings, verified order tracking, ratings, and AI
              support into one clean marketplace experience built for Indian agriculture.
            </p>
          </div>

          {renderFilters()}
          <div className="marketplace-mobile-toolbar hidden">
            <form onSubmit={handleSubmit} className="relative min-w-0 flex-1">
              <input name="search" value={filters.search} onChange={handleChange}
                aria-label="Search crops" placeholder="Search crops"
                className="h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white pl-3 pr-11 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              <button type="submit" aria-label="Search marketplace" className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-xl text-emerald-700 focus-visible:outline focus-visible:outline-emerald-500 dark:text-emerald-300">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
              </button>
            </form>
            <button type="button" aria-haspopup="dialog" aria-expanded={filtersOpen} aria-controls="marketplace-filter-sheet" onClick={() => setFiltersOpen(true)}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 focus-visible:outline focus-visible:outline-emerald-500 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M7 12h10M10 17h4" /></svg>
              Filter
            </button>
          </div>
        </div>
      </ScrollReveal>

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
        <section className="marketplace-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {crops.map((crop, index) => (
            <MarketplaceCropCard
              key={crop._id}
              crop={crop}
              index={index}
              userRole={user?.role}
              onAddToCart={handleAddToCart}
            />
          ))}
        </section>
      )}
    </div>
  );
}
