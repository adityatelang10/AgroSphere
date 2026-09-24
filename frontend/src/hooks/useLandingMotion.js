import { useEffect } from "react";
import { clampProgress, decisionSequenceTiming, getLandingMotionPolicy, journeyProgress, nextNavbarState } from "../utils/landingMotion";

// No scroll interception or React state updates per frame. Everything is scoped
// to the landing root and cleaned up on unmount or reduced-motion changes.
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
    const decision = root.querySelector("#decision-engine");
    const decisionMap = root.querySelector("[data-decision-map]");
    const passport = root.querySelector("[data-trace-passport]");
    const cursor = root.querySelector(".lp-cursor");
    const reveals = [...root.querySelectorAll("[data-reveal]")];
    const media = [...root.querySelectorAll(".lp-crop-visual,.lp-leaf-composition,.lp-produce-photo,.lp-gallery-frame,.lp-journey-photo")];
    const animations = new Set();
    const stageAnimations = new Set();
    const countFrames = new Set();
    const counted = new Set();
    let scrollFrame = 0;
    let pointerFrame = 0;
    let pointer = null;
    let magneticTarget = null;
    let observer;
    let stopped = false;
    let policy;
    let activeStage = -1;
    let navState = { previousY: Math.max(0, window.scrollY), direction: 0, distance: 0, hidden: false };

    const animate = (node, frames, options = {}) => {
      if (!node || !policy.enabled || !node.animate) return null;
      const animation = node.animate(frames, { duration: 850, easing: "cubic-bezier(.2,.75,.2,1)", fill: "both", ...options });
      animations.add(animation);
      animation.finished.catch(() => {}).finally(() => {
        animations.delete(animation);
        stageAnimations.delete(animation);
        animation.cancel();
      });
      return animation;
    };
    const enter = (node, { delay = 0, duration = 850, y = 32, x = 0, mask = false, scale = 1 } = {}) => animate(node, [
      { opacity: 0, translate: x + "px " + y + "px", scale: String(scale), ...(mask ? { clipPath: "inset(0 0 100% 0)" } : {}) },
      { opacity: 1, translate: "0 0", scale: "1", ...(mask ? { clipPath: "inset(0 0 -8% 0)" } : {}) },
    ], { delay, duration });

    const countUp = (node, delay = 0) => {
      if (counted.has(node) || !policy.enabled) return;
      counted.add(node);
      const finalValue = Number(node.dataset.count);
      const decimals = Number(node.dataset.decimals || 0);
      const start = performance.now() + delay;
      node.textContent = (0).toFixed(decimals);
      const frame = (time) => {
        if (stopped || !policy.enabled) return;
        const progress = clampProgress((time - start) / 850);
        node.textContent = (finalValue * (1 - (1 - progress) ** 3)).toFixed(decimals);
        if (progress < 1) {
          const id = requestAnimationFrame((next) => { countFrames.delete(id); frame(next); });
          countFrames.add(id);
        } else node.textContent = finalValue.toFixed(decimals);
      };
      const id = requestAnimationFrame((time) => { countFrames.delete(id); frame(time); });
      countFrames.add(id);
    };

    const revealMedia = (frame) => {
      if (frame.classList.contains("is-media-visible")) return;
      frame.classList.add("is-media-visible");
      const cardDelay = Number.parseInt(frame.closest(".lp-produce")?.style.getPropertyValue("--reveal-delay") || "0", 10);
      const delay = policy.parallax ? 300 + cardDelay : 100;
      animate(frame, [
        { clipPath: policy.parallax ? "inset(12% 0 88% 0)" : "inset(0 0 25% 0)", opacity: 0 },
        { clipPath: "inset(0)", opacity: 1 },
      ], { duration: policy.parallax ? 1150 : 650, delay });
      animate(frame.querySelector("img"), [{ scale: policy.parallax ? "1.08" : "1.035" }, { scale: "1" }], { duration: 1250, delay });
    };
    const reveal = (element) => {
      if (element.classList.contains("is-visible")) return;
      element.classList.add("is-visible");
      const delay = Number.parseInt(element.style.getPropertyValue("--reveal-delay") || "0", 10);
      const isMedia = media.includes(element);
      if (isMedia) revealMedia(element);
      const copies = [...element.querySelectorAll(".lp-eyebrow,h2,h3,p,.lp-model-line,.lp-equation,.lp-button")]
        .filter((node) => !node.closest(".lp-media-frame") && node.closest("[data-reveal]") === element);
      if (element.matches("h2,h3")) copies.unshift(element);
      if ((!copies.length && !isMedia) || element.matches(".lp-produce")) {
        enter(element, { delay, y: policy.parallax ? 46 : 22, duration: 950 });
      }
      copies.forEach((node, index) => {
        const heading = node.matches("h2,h3");
        const label = node.matches(".lp-eyebrow");
        const offset = label ? 0 : heading ? 120 : 260 + index * 30;
        enter(node, { delay: delay + offset, duration: heading ? 1050 : 750, y: heading ? (policy.parallax ? 60 : 26) : 24, mask: heading });
      });
      element.querySelectorAll("[data-count]").forEach((node) => countUp(node, delay));
      if (element.matches("[data-count]")) countUp(element, delay);
    };

    const revealDecision = () => {
      if (decision.classList.contains("is-sequenced")) return;
      decision.classList.add("is-sequenced");
      const timing = decisionSequenceTiming(!policy.parallax);
      decision.querySelectorAll("[data-evidence]").forEach((node, index) => {
        enter(node, { delay: index * timing.step, duration: timing.evidenceDuration, x: policy.parallax ? (index < 3 ? -32 : 32) : 0, y: 22 });
      });
      decision.querySelectorAll(".lp-evidence-lines path").forEach((line, index) => {
        animate(line, [{ strokeDashoffset: 1, opacity: 0 }, { strokeDashoffset: 0, opacity: 1 }], {
          delay: index < 6 ? timing.convergence + index * 45 : timing.core + 180, duration: timing.connectionDuration,
        });
      });
      enter(decision.querySelector(".lp-engine-core"), { delay: timing.core, duration: timing.coreDuration, scale: .86, y: 0 });
      animate(decision.querySelector(".lp-engine-orbit"), [
        { opacity: 0, scale: ".88" }, { opacity: 1, scale: "1.1", offset: .65 }, { opacity: 1, scale: "1" },
      ], { delay: timing.core, duration: 1000 });
      enter(decision.querySelector(".lp-next-action"), { delay: timing.decision, duration: 850, mask: true });
      decision.querySelectorAll("[data-count]").forEach((node) => countUp(node, timing.decision + 150));
    };

    const revealPassport = () => {
      if (passport.classList.contains("is-sequenced")) return;
      passport.classList.add("is-sequenced");
      const pace = policy.parallax ? 1 : .7;
      enter(passport, { duration: 650, y: 38 });
      enter(passport.querySelector(".lp-scan-symbol"), { delay: 150 * pace, duration: 500 * pace, y: 0, scale: .8 });
      animate(passport.querySelector(".lp-passport-scan"), [
        { opacity: 0, translate: "0 -25px" }, { opacity: 1, translate: "0 -25px", offset: .12 },
        { opacity: 1, translate: "0 25px", offset: .85 }, { opacity: 0, translate: "0 25px" },
      ], { delay: 550 * pace, duration: 950 * pace, easing: "ease-in-out" });
      animate(passport.querySelector(".lp-passport-connection"), [
        { opacity: 0, scale: "0 1" }, { opacity: 1, scale: "1 1" },
      ], { delay: 1400 * pace, duration: 500 * pace });
      enter(passport.querySelector(".lp-passport-info"), { delay: 1850 * pace, duration: 700 * pace, y: 20 });
      enter(passport.querySelector(".lp-passport-photo"), { delay: 1750 * pace, duration: 900 * pace, y: 0, mask: true });
    };

    const updateScroll = () => {
      scrollFrame = 0;
      if (stopped) return;
      const y = Math.max(0, window.scrollY);
      const keyboardNav = nav.contains(document.activeElement) && document.activeElement.matches(":focus-visible");
      navState = nextNavbarState(navState, y, !policy.enabled || keyboardNav || Boolean(root.querySelector("dialog[open]")));
      nav.classList.toggle("is-hidden", navState.hidden);
      nav.classList.toggle("is-scrolled", y > 35);
      root.style.setProperty("--page-progress", String(clampProgress(y / Math.max(1, root.scrollHeight - innerHeight))));
      const heroDepth = policy.parallax ? clampProgress(y / Math.max(1, hero.offsetHeight)) : 0;
      root.style.setProperty("--hero-shift", heroDepth * 70 + "px");
      root.style.setProperty("--hero-scale", String(1.025 + heroDepth * .045));
      root.style.setProperty("--hero-text-shift", heroDepth * -45 + "px");
      const box = journey.getBoundingClientRect();
      const progress = journeyProgress(box.top, box.height, innerHeight);
      journey.style.setProperty("--journey-progress", String(progress));
      journey.style.setProperty("--journey-title-shift", policy.parallax ? progress * -16 + "px" : "0px");
      const stageBoxes = stages.map((stage) => stage.getBoundingClientRect());
      let active = 0;
      stageBoxes.forEach((stageBox, index) => { if (stageBox.top < innerHeight * .55) active = index; });
      stages.forEach((stage, index) => {
        stage.classList.toggle("is-current", index === active);
        stage.classList.toggle("is-past", index < active);
        stage.classList.toggle("is-upcoming", index > active);
        if (index === active) stage.setAttribute("aria-current", "step");
        else stage.removeAttribute("aria-current");
      });
      if (active !== activeStage && stageBoxes[active].top < innerHeight && stageBoxes[active].bottom > 0) {
        activeStage = active;
        stageAnimations.forEach((animation) => animation.cancel());
        stages[active].querySelectorAll(".lp-eyebrow,h3,p:not(.lp-eyebrow),small").forEach((node, index) => {
          const animation = enter(node, { duration: 650, delay: index * 85, y: policy.parallax ? 24 : 12 });
          if (animation) stageAnimations.add(animation);
        });
      }
      if (policy.parallax) media.forEach((frame) => {
        const bounds = frame.getBoundingClientRect();
        if (bounds.bottom <= 0 || bounds.top >= innerHeight) return;
        const position = clampProgress((innerHeight - bounds.top) / (innerHeight + bounds.height));
        frame.style.setProperty("--image-shift", (position - .5) * 20 + "px");
      });
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
      navState = { previousY: Math.max(0, window.scrollY), direction: 0, distance: 0, hidden: false };
      nav.classList.remove("is-hidden");
      let section = event.target.closest("[data-reveal]");
      while (section) {
        section.classList.add("is-visible");
        observer?.unobserve(section);
        section = section.parentElement?.closest("[data-reveal]");
      }
      animations.forEach((animation) => {
        const target = animation.effect?.target;
        if (target === event.target || target?.contains(event.target)) animation.cancel();
      });
    };

    const configure = () => {
      const canAnimate = "IntersectionObserver" in window && typeof root.animate === "function";
      policy = getLandingMotionPolicy({ reducedMotion: reduce.matches || !canAnimate, pointerFine: fine.matches, width: innerWidth, paused });
      root.classList.toggle("lp-motion", policy.enabled);
      root.classList.toggle("lp-motion-off", !policy.enabled);
      root.classList.toggle("lp-pointer-enabled", policy.cursor);
      root.classList.toggle("lp-parallax-enabled", policy.parallax);
      root.classList.toggle("lp-reveals-ready", policy.enabled);
      media.forEach((frame) => frame.classList.add("lp-media-frame"));
      observer?.disconnect();
      if (!policy.enabled) {
        animations.forEach((animation) => animation.cancel());
        countFrames.forEach(cancelAnimationFrame);
        countFrames.clear();
        reveals.forEach((element) => element.classList.add("is-visible"));
        media.forEach((frame) => frame.classList.add("is-media-visible"));
        decision.classList.add("is-sequenced");
        passport.classList.add("is-sequenced");
        root.querySelectorAll("[data-count]").forEach((node) => { node.textContent = Number(node.dataset.count).toFixed(Number(node.dataset.decimals || 0)); });
      }
      if (!policy.cursor) {
        hideCursor();
        root.style.setProperty("--pointer-x", "0px");
        root.style.setProperty("--pointer-y", "0px");
      }
      if (!policy.parallax) media.forEach((frame) => frame.style.removeProperty("--image-shift"));
      if (policy.enabled) {
        observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const element = entry.target;
          if (element === decisionMap) revealDecision();
          else if (element === passport) revealPassport();
          else {
            if (element.matches("[data-reveal]")) reveal(element);
            if (media.includes(element)) revealMedia(element);
          }
          observer.unobserve(element);
        }), { threshold: .12, rootMargin: "0px 0px -35px 0px" });
        new Set([...reveals, ...media, decisionMap, passport]).forEach((element) => observer.observe(element));
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
      root.classList.remove("lp-motion", "lp-motion-off", "lp-pointer-enabled", "lp-parallax-enabled", "lp-reveals-ready");
    };
  }, [rootRef, paused]);
}
