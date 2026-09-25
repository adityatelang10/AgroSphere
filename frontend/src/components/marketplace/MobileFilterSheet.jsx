import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function MobileFilterSheet({ children, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const desktop = window.matchMedia("(min-width: 640px)");
    if (desktop.matches) {
      onClose();
      return undefined;
    }
    const previouslyFocused = document.activeElement;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    // Native modal focus containment/inert background, independent of reveal transforms.
    dialog.showModal();
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const onResize = () => { if (desktop.matches) onClose(); };
    desktop.addEventListener("change", onResize);
    return () => {
      desktop.removeEventListener("change", onResize);
      dialog.close();
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [onClose]);

  return createPortal(
    <dialog
      ref={dialogRef}
      id="marketplace-filter-sheet"
      aria-labelledby="marketplace-filter-title"
      className="marketplace-filter-sheet bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
        <h2 id="marketplace-filter-title" className="text-lg font-semibold">Marketplace filters</h2>
        <button type="button" aria-label="Close filters" onClick={onClose}
          className="grid h-11 w-11 place-items-center rounded-xl text-slate-500 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline focus-visible:outline-emerald-500 dark:text-slate-300 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-200">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </button>
      </div>
      <div className="marketplace-filter-content">{children}</div>
    </dialog>,
    document.body
  );
}
