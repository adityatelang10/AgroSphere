import { useEffect } from "react";
import { APP_NAVBAR_THRESHOLDS, nextNavbarState } from "../utils/landingMotion";

// One passive, frame-batched scroll listener; no React state updates per pixel.
export default function useNavbarScroll(ref, pathname, menuOpen) {
  useEffect(() => {
    const header = ref.current;
    if (!header) return undefined;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let state = { previousY: window.scrollY, direction: 0, distance: 0, hidden: false };

    const syncSurface = () => {
      header.classList.toggle("is-scrolled", window.scrollY > APP_NAVBAR_THRESHOLDS.top);
    };

    const update = () => {
      frame = 0;
      const scrollRange = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const shortPage = scrollRange < 160;
      // A click can leave a button focused indefinitely. Only keyboard focus or
      // an expanded control should lock the bar during subsequent scrolling.
      const keyboardFocused = header.contains(document.activeElement) && document.activeElement.matches(":focus-visible");
      const locked = shortPage || reduce.matches || menuOpen || keyboardFocused ||
        Boolean(header.querySelector('[aria-expanded="true"]'));
      state = nextNavbarState(state, Math.min(scrollRange, window.scrollY), locked, APP_NAVBAR_THRESHOLDS);
      header.classList.toggle("is-hidden", state.hidden);
      syncSurface();
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    const reveal = () => {
      state = nextNavbarState(state, window.scrollY, true, APP_NAVBAR_THRESHOLDS);
      header.classList.remove("is-hidden");
      syncSurface();
    };
    reveal();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reduce.addEventListener("change", schedule);
    header.addEventListener("focusin", reveal);
    header.addEventListener("focusout", schedule);
    header.addEventListener("keydown", schedule);
    header.addEventListener("pointerdown", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduce.removeEventListener("change", schedule);
      header.removeEventListener("focusin", reveal);
      header.removeEventListener("focusout", schedule);
      header.removeEventListener("keydown", schedule);
      header.removeEventListener("pointerdown", schedule);
      header.classList.remove("is-hidden", "is-scrolled");
    };
  }, [ref, pathname, menuOpen]);
}
