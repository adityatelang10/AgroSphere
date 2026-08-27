import { Link } from "react-router-dom";

import { formatCurrency } from "../../utils/formatters";
import ScrollReveal from "../ui/ScrollReveal";

const getActionLabel = (crop, userRole) => {
  if (crop.stockQuantity <= 0) {
    return "Out of stock";
  }

  if (userRole === "FARMER") {
    return "Customer only";
  }

  return userRole === "CUSTOMER" ? "Add to cart" : "Sign in to buy";
};

export default function MarketplaceCropCard({ crop, index, userRole, onAddToCart }) {
  const actionDisabled = userRole === "FARMER" || crop.stockQuantity <= 0;

  return (
    <ScrollReveal
      delay={(index % 4) * 60}
      className="h-full"
    >
      <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md focus-within:-translate-y-0.5 focus-within:border-emerald-300 focus-within:shadow-md motion-reduce:transform-none dark:border-slate-800 dark:bg-slate-950/80 dark:hover:border-emerald-900 dark:focus-within:border-emerald-800">
      <Link
        to={`/crop/${crop._id}`}
        aria-label={`View details for ${crop.name}`}
        className="block h-40 overflow-hidden bg-gradient-to-br from-emerald-100 via-lime-50 to-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800"
      >
        {crop.images?.[0]?.url ? (
          <img
            src={crop.images[0].url}
            alt={crop.name}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.015] group-focus-within:scale-[1.015] motion-reduce:transform-none"
          />
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-slate-950 dark:text-slate-50">
              <Link
                to={`/crop/${crop._id}`}
                className="transition hover:text-emerald-700 focus:outline-none focus-visible:underline dark:hover:text-emerald-300"
              >
                {crop.name}
              </Link>
            </h2>
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
              {crop.category} · {crop.location?.district}, {crop.location?.state}
            </p>
          </div>
          {crop.isOrganic ? (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[0.7rem] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              Organic
            </span>
          ) : null}
        </div>

        <p className="line-clamp-2 text-sm leading-5 text-slate-600 dark:text-slate-300">
          {crop.description}
        </p>

        <div className="mt-auto grid grid-cols-[1fr,auto] items-end gap-3 border-y border-slate-100 py-3 dark:border-slate-800">
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Price
            </p>
            <p className="mt-1 font-semibold text-slate-950 dark:text-slate-50">
              {formatCurrency(crop.price)} / {crop.unit}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[0.7rem] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Stock
            </p>
            <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              {crop.stockQuantity} {crop.unit}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Link
            to={`/farmer/${crop.farmer?._id}`}
            className="min-w-0 truncate text-xs font-medium text-slate-500 underline-offset-4 transition hover:text-emerald-700 hover:underline focus:outline-none focus-visible:underline dark:text-slate-400 dark:hover:text-emerald-300"
          >
            {crop.farmer?.farmName || "Farmer profile"}
          </Link>
          <button
            type="button"
            onClick={() => onAddToCart(crop)}
            disabled={actionDisabled}
            className="shrink-0 rounded-full bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-950 dark:disabled:bg-slate-700"
          >
            {getActionLabel(crop, userRole)}
          </button>
        </div>
      </div>
      </article>
    </ScrollReveal>
  );
}
