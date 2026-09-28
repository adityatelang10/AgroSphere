import { useEffect, useId, useState } from "react";

// Match the existing cart's minimum of 1 and its support for fractional units.
export function validateCartQuantity(text, stockQuantity, unit) {
  if (!/^\d+(?:\.\d+)?$/.test(text)) return "Enter a valid quantity using numbers only.";
  const quantity = Number(text);
  if (!Number.isFinite(quantity) || quantity > Number.MAX_SAFE_INTEGER) return "Enter a valid quantity.";
  if (quantity < 1) return "Quantity must be at least 1.";
  if (Number.isFinite(stockQuantity) && quantity > stockQuantity) return `Only ${stockQuantity} ${unit} available.`;
  return "";
}

export default function CartQuantityControl({ item, onChange }) {
  const [draft, setDraft] = useState(String(item.quantity));
  const [error, setError] = useState("");
  const feedbackId = useId();
  useEffect(() => { setDraft(String(item.quantity)); }, [item.quantity]);

  const change = (text) => {
    // Allow an empty/intermediate decimal draft, but never store letters or a sign.
    if (!/^\d*(?:\.\d*)?$/.test(text)) { setError("Use numbers only; negative quantities are not allowed."); return; }
    setDraft(text);
    const message = validateCartQuantity(text, item.stockQuantity, item.unit);
    setError(text === "" ? "" : message);
    if (!message) onChange(item.cropId, Number(text));
  };
  const apply = () => {
    // A trailing decimal point is a valid intermediate edit, not a new quantity.
    const text = draft.endsWith(".") ? draft.slice(0, -1) : draft;
    const message = validateCartQuantity(text, item.stockQuantity, item.unit);
    if (message) {
      setDraft(String(item.quantity));
      setError(`${message} Quantity remains ${item.quantity}.`);
      return;
    }
    setDraft(String(Number(text))); setError("");
    if (Number(text) !== item.quantity) onChange(item.cropId, Number(text));
  };
  const step = (direction) => {
    const next = Math.max(1, Math.min(item.quantity + direction,
      Number.isFinite(item.stockQuantity) ? item.stockQuantity : Infinity));
    const message = validateCartQuantity(String(next), item.stockQuantity, item.unit);
    if (message) { setError(message); return; }
    setDraft(String(next)); setError(""); onChange(item.cropId, next);
  };
  const buttonClass = "h-10 w-10 shrink-0 rounded-lg text-xl text-slate-600 transition hover:bg-white hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800";
  return <div className="min-w-0 max-w-full">
    <div className="inline-flex max-w-full items-center rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900">
      <button type="button" aria-label={`Decrease ${item.name} quantity`} disabled={item.quantity <= 1} onClick={() => step(-1)} className={buttonClass}>−</button>
      <input type="text" inputMode="numeric" autoComplete="off" spellCheck={false}
        aria-label={`${item.name} quantity`} aria-invalid={Boolean(error)} aria-describedby={error ? feedbackId : undefined}
        value={draft} onChange={(event) => change(event.target.value)} onBlur={apply}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); apply(); } }}
        className="h-10 w-16 min-w-0 rounded-lg border border-transparent bg-transparent px-1 text-center text-base font-bold text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:text-white" />
      <button type="button" aria-label={`Increase ${item.name} quantity`} disabled={Number.isFinite(item.stockQuantity) && item.quantity >= item.stockQuantity} onClick={() => step(1)} className={buttonClass}>+</button>
    </div>
    {error ? <p id={feedbackId} role="alert" className="mt-2 max-w-64 break-words text-xs leading-5 text-rose-700 dark:text-rose-300">{error}</p> : null}
  </div>;
}
