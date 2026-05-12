import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-2xl rounded-[2rem] border border-white/60 bg-white/85 p-8 text-center shadow-lg dark:border-slate-800 dark:bg-slate-950/75">
      <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700 dark:text-amber-400">
        404
      </p>
      <h1 className="mt-3 font-display text-4xl font-bold text-slate-950 dark:text-slate-50">
        This page is not planted yet.
      </h1>
      <p className="mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300">
        The route you requested does not exist in the AgroSphere frontend scaffold yet.
      </p>
      <Link
        to="/marketplace"
        className="mt-6 inline-flex rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
      >
        Return to marketplace
      </Link>
    </div>
  );
}
