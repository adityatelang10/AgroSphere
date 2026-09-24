export const clampProgress = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export function getLandingMotionPolicy({ reducedMotion, pointerFine, width, paused }) {
  const enabled = !reducedMotion && !paused;
  const desktop = enabled && pointerFine && width >= 1024;
  return { enabled, parallax: desktop, cursor: desktop, magnetic: desktop };
}

export function journeyProgress(top, height, viewportHeight) {
  return clampProgress((viewportHeight * 0.55 - top) / Math.max(1, height - viewportHeight * 0.4));
}

// Directional hysteresis: small trackpad jitter cannot repeatedly toggle the bar.
export const APP_NAVBAR_THRESHOLDS = Object.freeze({ top: 24, minHide: 80, down: 50, up: 20 });

export function nextNavbarState(state, position, locked = false, { top = 80, minHide = 140, down = 16, up = 6 } = {}) {
  const y = Math.max(0, Number.isFinite(position) ? position : 0);
  const delta = y - state.previousY;
  if (locked || y <= top) return { previousY: y, direction: 0, distance: 0, hidden: false };
  if (Math.abs(delta) < 0.5) return { ...state, previousY: y };
  const direction = Math.sign(delta);
  const distance = direction === state.direction ? state.distance + Math.abs(delta) : Math.abs(delta);
  let hidden = state.hidden;
  if (direction > 0 && y > minHide && distance >= down) hidden = true;
  if (direction < 0 && distance >= up) hidden = false;
  return { previousY: y, direction, distance, hidden };
}

export function decisionSequenceTiming(compact = false) {
  const step = compact ? 95 : 160;
  const evidenceDuration = compact ? 360 : 500;
  const connectionDuration = compact ? 450 : 550;
  const coreDuration = compact ? 550 : 700;
  const convergence = step * 5 + evidenceDuration;
  const core = convergence + connectionDuration + 5 * 45;
  const decision = core + coreDuration;
  return { step, evidenceDuration, connectionDuration, coreDuration, convergence, core, decision };
}
