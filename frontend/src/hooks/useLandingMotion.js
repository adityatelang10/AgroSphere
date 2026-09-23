import { useEffect } from "react";
import { clampProgress, getLandingMotionPolicy, journeyProgress } from "../utils/landingMotion";

// Native scroll is never intercepted. All effects and DOM writes stay inside
// this landing root; observers, frames and listeners are released on exit.
export default function useLandingMotion(rootRef, paused) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(pointer: fine)");
    const nav = root.querySelector("[data-landing-nav]");
    const hero = root.querySelector(".lp-hero");
    const journey = root.querySelector("[data-journey]");
    const stages = [...root.querySelectorAll("[data-journey-step]")];
    const evidence = root.querySelector(".lp-evidence-map");
    const cursor = root.querySelector(".lp-cursor");
    const animations = new Set();
    const countFrames = new Set();
    const counted = new Set();
    let scrollFrame = 0;
    let pointerFrame = 0;
    let pointer = null;
    let magneticTarget = null;
    let observer;
    let stopped = false;
    let policy;

    const countUp = (node) => {
      if (counted.has(node) || !policy.enabled) return;
      counted.add(node);
      const finalValue = Number(node.dataset.count);
      const decimals = Number(node.dataset.decimals || 0);
      const start = performance.now();
      const frame = (time) => {
        if (stopped) return;
        const progress = clampProgress((time - start) / 850);
        node.textContent = (finalValue * (1 - (1 - progress) ** 3)).toFixed(decimals);
        if (progress < 1 && policy.enabled) {
          const id = requestAnimationFrame((next) => { countFrames.delete(id); frame(next); });
          countFrames.add(id);
        } else node.textContent = finalValue.toFixed(decimals);
      };
      const id = requestAnimationFrame((time) => { countFrames.delete(id); frame(time); });
      countFrames.add(id);
    };

    const reveal = (element) => {
      if (element.classList.contains("is-visible")) return;
      element.classList.add("is-visible");
      if (policy.enabled && element.animate) {
        const animation = element.animate(
          [{ opacity: 0, translate: policy.parallax ? "0 25px" : "0 8px" }, { opacity: 1, translate: "0 0" }],
          { duration: policy.parallax ? 850 : 450, delay: Number.parseInt(element.style.getPropertyValue("--reveal-delay") || "0", 10), easing: "cubic-bezier(.2,.7,.2,1)" }
        );
        animations.add(animation);
        animation.finished.catch(() => {}).finally(() => animations.delete(animation));
      }
      element.querySelectorAll("[data-count]").forEach(countUp);
      if (element.matches("[data-count]")) countUp(element);
    };

    const updateScroll = () => {
      scrollFrame = 0;
      if (stopped) return;
      const y = Math.max(0, window.scrollY);
      nav?.classList.toggle("is-scrolled", y > 35);
      root.style.setProperty("--page-progress", String(clampProgress(y / Math.max(1, root.scrollHeight - window.innerHeight))));
      const heroDepth = policy.parallax ? clampProgress(y / Math.max(1, hero.offsetHeight)) : 0;
      root.style.setProperty("--hero-shift", `${heroDepth * 70}px`);
      root.style.setProperty("--hero-scale", String(1.025 + heroDepth * 0.045));
      root.style.setProperty("--hero-text-shift", `${heroDepth * -45}px`);
      const box = journey.getBoundingClientRect();
      journey.style.setProperty("--journey-progress", String(journeyProgress(box.top, box.height, innerHeight)));
      let active = 0;
      stages.forEach((stage, index) => { if (stage.getBoundingClientRect().top < innerHeight * 0.58) active = index; });
      stages.forEach((stage, index) => stage.classList.toggle("is-current", index === active));
      const evidenceBox = evidence.getBoundingClientRect();
      evidence.style.setProperty("--evidence-progress", policy.enabled ? String(clampProgress((innerHeight * 0.95 - evidenceBox.top) / Math.max(1, evidenceBox.height))) : "1");
    };
    const scheduleScroll = () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll); };
    const resetMagnetic = () => {
      magneticTarget?.style.removeProperty("--magnetic-x");
      magneticTarget?.style.removeProperty("--magnetic-y");
      magneticTarget = null;
    };
    const hideCursor = () => { cursor?.classList.remove("is-active", "is-hover", "has-label"); resetMagnetic(); };
    const updatePointer = () => {
      pointerFrame = 0;
      if (!policy.cursor || !pointer || stopped) return;
      const { x, y, target } = pointer;
      cursor.style.setProperty("--cursor-x", `${x}px`);
      cursor.style.setProperty("--cursor-y", `${y}px`);
      cursor.classList.add("is-active");
      cursor.classList.toggle("is-hover", Boolean(target.closest("a,button")));
      const label = target.closest("[data-cursor]")?.dataset.cursor || "";
      cursor.querySelector("span").textContent = label;
      cursor.classList.toggle("has-label", Boolean(label));
      if (hero.getBoundingClientRect().bottom > 0) {
        root.style.setProperty("--pointer-x", `${(x / innerWidth - 0.5) * 8}px`);
        root.style.setProperty("--pointer-y", `${(y / innerHeight - 0.5) * 8}px`);
      }
      const targetButton = target.closest("[data-magnetic]");
      if (targetButton !== magneticTarget) resetMagnetic();
      if (targetButton && policy.magnetic) {
        magneticTarget = targetButton;
        const box = targetButton.getBoundingClientRect();
        targetButton.style.setProperty("--magnetic-x", `${Math.max(-3, Math.min(3, (x - box.left - box.width / 2) * 0.035))}px`);
        targetButton.style.setProperty("--magnetic-y", `${Math.max(-3, Math.min(3, (y - box.top - box.height / 2) * 0.07))}px`);
      }
    };
    const onPointerMove = (event) => {
      if (!policy.cursor || event.pointerType !== "mouse") return;
      pointer = { x: event.clientX, y: event.clientY, target: event.target };
      if (!pointerFrame) pointerFrame = requestAnimationFrame(updatePointer);
    };
    const onFocus = (event) => {
      hideCursor();
      const section = event.target.closest("[data-reveal]");
      if (section) { section.classList.add("is-visible"); observer?.unobserve(section); }
    };

    const configure = () => {
      policy = getLandingMotionPolicy({ reducedMotion: reduce.matches, pointerFine: fine.matches, width: innerWidth, paused });
      root.classList.toggle("lp-motion", policy.enabled);
      root.classList.toggle("lp-motion-off", !policy.enabled);
      root.classList.toggle("lp-pointer-enabled", policy.cursor);
      observer?.disconnect();
      if (!policy.enabled) {
        animations.forEach((animation) => animation.cancel());
        countFrames.forEach(cancelAnimationFrame);
        countFrames.clear();
        root.querySelectorAll("[data-count]").forEach((node) => { node.textContent = Number(node.dataset.count).toFixed(Number(node.dataset.decimals || 0)); });
      }
      if (!policy.cursor) {
        hideCursor();
        root.style.setProperty("--pointer-x", "0px");
        root.style.setProperty("--pointer-y", "0px");
      }
      if ("IntersectionObserver" in window) {
        observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
          if (entry.isIntersecting) { reveal(entry.target); observer.unobserve(entry.target); }
        }), { threshold: 0.08, rootMargin: "0px 0px -25px 0px" });
        root.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element));
      }
      scheduleScroll();
    };

    configure();
    window.addEventListener("scroll", scheduleScroll, { passive: true });
    window.addEventListener("resize", configure, { passive: true });
    window.addEventListener("blur", hideCursor);
    root.addEventListener("pointermove", onPointerMove, { passive: true });
    root.addEventListener("pointerleave", hideCursor);
    root.addEventListener("focusin", onFocus);
    reduce.addEventListener("change", configure);
    fine.addEventListener("change", configure);
    return () => {
      stopped = true;
      observer?.disconnect();
      cancelAnimationFrame(scrollFrame);
      cancelAnimationFrame(pointerFrame);
      countFrames.forEach(cancelAnimationFrame);
      animations.forEach((animation) => animation.cancel());
      window.removeEventListener("scroll", scheduleScroll);
      window.removeEventListener("resize", configure);
      window.removeEventListener("blur", hideCursor);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerleave", hideCursor);
      root.removeEventListener("focusin", onFocus);
      reduce.removeEventListener("change", configure);
      fine.removeEventListener("change", configure);
      resetMagnetic();
      root.classList.remove("lp-motion", "lp-pointer-enabled");
    };
  }, [rootRef, paused]);
}
