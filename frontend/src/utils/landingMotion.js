export const clampProgress = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export function getLandingMotionPolicy({ reducedMotion, pointerFine, width, paused }) {
  const enabled = !reducedMotion && !paused;
  const desktop = enabled && pointerFine && width >= 1024;
  return { enabled, parallax: desktop, cursor: desktop, magnetic: desktop };
}

export function journeyProgress(top, height, viewportHeight) {
  return clampProgress((viewportHeight * 0.55 - top) / Math.max(1, height - viewportHeight * 0.4));
}
