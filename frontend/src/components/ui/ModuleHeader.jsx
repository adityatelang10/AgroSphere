import ScrollReveal from "./ScrollReveal";

const TONE_STYLES = {
  planning: {
    eyebrow: "text-emerald-700 dark:text-emerald-300",
    icon: "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
    glow: "bg-emerald-300/20 dark:bg-emerald-700/10",
  },
  diagnostic: {
    eyebrow: "text-cyan-700 dark:text-cyan-300",
    icon: "border-cyan-200 bg-cyan-100 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-300",
    badge: "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/60 dark:text-cyan-200",
    glow: "bg-cyan-300/20 dark:bg-cyan-700/10",
  },
  water: {
    eyebrow: "text-sky-700 dark:text-sky-300",
    icon: "border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
    badge: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-200",
    glow: "bg-sky-300/20 dark:bg-sky-700/10",
  },
  market: {
    eyebrow: "text-violet-700 dark:text-violet-300",
    icon: "border-violet-200 bg-violet-100 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300",
    badge: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-200",
    glow: "bg-violet-300/20 dark:bg-violet-700/10",
  },
  decision: {
    eyebrow: "text-amber-700 dark:text-amber-300",
    icon: "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
    badge: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
    glow: "bg-amber-300/20 dark:bg-amber-700/10",
  },
  scenario: {
    eyebrow: "text-fuchsia-700 dark:text-fuchsia-300",
    icon: "border-fuchsia-200 bg-fuchsia-100 text-fuchsia-700 dark:border-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-300",
    badge: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-900 dark:bg-fuchsia-950/60 dark:text-fuchsia-200",
    glow: "bg-fuchsia-300/20 dark:bg-fuchsia-700/10",
  },
};

function ModuleIcon({ name }) {
  if (name === "leaf") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M20 4.5C13 4.5 7.5 7.4 7.5 13c0 3.2 2.2 5.5 5.4 5.5C18.5 18.5 20 11 20 4.5Z" />
        <path d="M5 20c2.5-4.5 6-7.3 11-9" />
        <path d="M6 5v3M4.5 6.5h3" />
      </svg>
    );
  }

  if (name === "water") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M12 3S6.5 9.4 6.5 14a5.5 5.5 0 0 0 11 0C17.5 9.4 12 3 12 3Z" />
        <path d="M9.5 15.5c.5 1.2 1.4 1.8 2.8 1.8" />
      </svg>
    );
  }

  if (name === "market") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M4 19.5h16" />
        <path d="M6 17v-4M11 17V9M16 17V5" />
        <path d="m5 9 5-4 4 2 5-4" />
      </svg>
    );
  }

  if (name === "decision") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="m15 9 4-4M18 5h1v1" />
      </svg>
    );
  }

  if (name === "scenario") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M5 5h4c3 0 3 4 6 4h4" />
        <path d="m17 6 3 3-3 3" />
        <path d="M5 19h4c3 0 3-4 6-4h4" />
        <path d="m17 12 3 3-3 3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 20V9" />
      <path d="M12 13c-4 0-7-2.2-7-6 4 0 7 2.2 7 6Z" />
      <path d="M12 16c4 0 7-2.2 7-6-4 0-7 2.2-7 6Z" />
      <path d="M7 20h10" />
    </svg>
  );
}

export default function ModuleHeader({
  title,
  description,
  category,
  method,
  icon,
  tone = "planning",
  children,
}) {
  const styles = TONE_STYLES[tone] || TONE_STYLES.planning;

  return (
    <ScrollReveal
      as="section"
      className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/90 p-4 shadow-lg dark:border-slate-800 dark:bg-slate-950/80 sm:p-5"
    >
      <div className={`pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full blur-3xl ${styles.glow}`} />
      <div className="relative flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border p-2.5 ${styles.icon}`}>
            <ModuleIcon name={icon} />
          </div>
          <div>
            <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${styles.eyebrow}`}>
              {category}
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50 sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-5 text-slate-600 dark:text-slate-300">
              {description}
            </p>
          </div>
        </div>
        <span className={`w-fit shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${styles.badge}`}>
          {method}
        </span>
      </div>
      {children ? (
        <div className="relative mt-3 border-t border-slate-200/80 pt-3 dark:border-slate-800">
          {children}
        </div>
      ) : null}
    </ScrollReveal>
  );
}
