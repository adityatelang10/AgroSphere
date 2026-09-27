export function RatingStars({ rating }) {
  const value = Number.isFinite(Number(rating)) ? Math.max(0, Math.min(5, Number(rating))) : 0;
  return <span role="img" aria-label={`${value} out of 5 stars`} className="relative inline-block shrink-0 text-base tracking-wide text-emerald-700 dark:text-emerald-300">
    <span aria-hidden="true">☆☆☆☆☆</span>
    <span aria-hidden="true" className="absolute left-0 top-0 overflow-hidden whitespace-nowrap" style={{ width: `${value * 20}%` }}>★★★★★</span>
  </span>;
}

export default function RatingSummary({ averageRating = 0, totalReviews = 0 }) {
  if (!totalReviews) return <span className="text-sm text-slate-500 dark:text-slate-400">No reviews yet</span>;
  return <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700 dark:text-slate-200">
    <RatingStars rating={averageRating} />
    <span><strong>{Number(averageRating).toFixed(1)}</strong> ({totalReviews} {totalReviews === 1 ? "review" : "reviews"})</span>
  </span>;
}
