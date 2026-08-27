import { useEffect, useRef } from "react";

export default function useResultReveal(result) {
  const resultRef = useRef(null);

  useEffect(() => {
    if (!result || !resultRef.current) {
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    resultRef.current.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [result]);

  return resultRef;
}
