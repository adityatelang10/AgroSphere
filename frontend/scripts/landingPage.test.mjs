import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { clampProgress, decisionSequenceTiming, getLandingMotionPolicy, journeyProgress, nextNavbarState } from "../src/utils/landingMotion.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const desktop = { reducedMotion: false, pointerFine: true, width: 1440, paused: false };
const components = readdirSync(new URL("../src/components/landing/", import.meta.url));
const source = components.map((name) => read(`src/components/landing/${name}`)).join("\n");

test("desktop effects require a fine pointer and a wide viewport", () => {
  assert.deepEqual(getLandingMotionPolicy(desktop), { enabled: true, parallax: true, cursor: true, magnetic: true });
  for (const width of [375, 390, 768, 1023]) {
    assert.deepEqual(getLandingMotionPolicy({ ...desktop, width }), { enabled: true, parallax: false, cursor: false, magnetic: false });
  }
  assert.equal(getLandingMotionPolicy({ ...desktop, width: 1024 }).cursor, true);
  assert.equal(getLandingMotionPolicy({ ...desktop, pointerFine: false }).parallax, false);
});

test("system reduced motion and the pause control override all complex effects", () => {
  for (const settings of [{ reducedMotion: true }, { paused: true }, { reducedMotion: true, paused: true }]) {
    assert.deepEqual(getLandingMotionPolicy({ ...desktop, ...settings }), { enabled: false, parallax: false, cursor: false, magnetic: false });
  }
  assert.match(read("src/styles/landing.css"), /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(read("src/index.css"), /prefers-reduced-motion[\s\S]*scroll-behavior:\s*auto/);
});

test("scroll progress is finite and clamped, including zero-height edge cases", () => {
  for (const [input, expected] of [[-1, 0], [0, 0], [0.5, 0.5], [1, 1], [3, 1], [NaN, 0], [Infinity, 0]]) {
    assert.equal(clampProgress(input), expected);
  }
  assert.equal(journeyProgress(900, 1800, 900), 0);
  assert.equal(journeyProgress(-2000, 1800, 900), 1);
  assert.ok(journeyProgress(0, 1800, 900) > 0 && journeyProgress(0, 1800, 900) < 1);
  assert.equal(journeyProgress(0, 0, 900), 1);
});

test("landing is public and all established application paths remain present", () => {
  const app = read("src/App.jsx");
  assert.match(app, /<Route\s+path="\/"\s+element=\{\s*<Suspense/);
  assert.ok(app.indexOf('path="/"') < app.indexOf('<Route element={<AppShell'));
  for (const path of ["/login", "/register", "/marketplace", "/crop/:id", "/farmer/:id", "/trace/:traceabilityId", "/profile", "/orders", "/cart", "/farmer/dashboard", "/farmer/crops", "/farmer/crops/new", "/farmer/crop-recommendation", "/farmer/disease-detection", "/farmer/irrigation-advisor", "/farmer/market-intelligence", "/farmer/decision-engine", "/farmer/what-if-simulator", "/farmer/orders"]) {
    assert.ok(app.includes(`path="${path}"`), `Missing existing route ${path}`);
  }
  assert.match(app, /ProtectedRoute allowedRoles=\{\["CUSTOMER"\]\}/);
  assert.match(app, /ProtectedRoute allowedRoles=\{\["FARMER"\]\}/);
});

test("landing presentation has no API or ML-service calls", () => {
  const presentation = source + read("src/pages/LandingPage.jsx") + read("src/hooks/useLandingMotion.js");
  assert.doesNotMatch(presentation, /\bfetch\s*\(|\baxios\b|\/api\/|localhost:8000|127\.0\.0\.1:8000/);
});

test("examples and technology boundaries are explicitly labelled", () => {
  for (const phrase of ["Illustrative planning result", "Model confidence", "Confidence is not disease severity", "not a live model check", "not a machine-learning model", "not probability or confidence", "Maize recommendation does not replace an existing Tomato crop", "Daily wholesale reporting", "No live price feed", "not a scannable QR", "not blockchain or external certification"]) {
    assert.ok(source.toLowerCase().includes(phrase.toLowerCase()), `Missing explanation: ${phrase}`);
  }
});

test("technical architecture is removed without leaving a dead About link", () => {
  assert.doesNotMatch(source + read("src/pages/LandingPage.jsx"), /ArchitectureSection|Purposeful parts\.|lp-architecture|lp-arch-/);
  assert.doesNotMatch(read("src/styles/landing.css"), /\.lp-(?:architecture|arch-|integrations)/);
  assert.match(source, /<footer id="about"/);
  assert.match(source, /\["About", "#about"\]/);
});

test("navbar hides after deliberate downward movement and returns after a small upward scroll", () => {
  let state = { previousY: 150, direction: 0, distance: 0, hidden: false };
  state = nextNavbarState(state, 160);
  assert.equal(state.hidden, false);
  state = nextNavbarState(state, 166);
  assert.equal(state.hidden, true);
  state = nextNavbarState(state, 163);
  assert.equal(state.hidden, true);
  state = nextNavbarState(state, 160);
  assert.equal(state.hidden, false);
});

test("navbar ignores tiny directional jitter and stays visible at the top or while locked", () => {
  let state = { previousY: 200, direction: 0, distance: 0, hidden: true };
  for (const position of [199, 200, 199, 200, 199, 200]) {
    state = nextNavbarState(state, position);
    assert.equal(state.hidden, true);
  }
  assert.equal(nextNavbarState(state, 75).hidden, false);
  assert.equal(nextNavbarState(state, -20).previousY, 0);
  assert.equal(nextNavbarState(state, 400, true).hidden, false);
});

test("decision timing separates all evidence, convergence, core and result", () => {
  for (const compact of [false, true]) {
    const timing = decisionSequenceTiming(compact);
    assert.ok(timing.convergence >= timing.step * 5 + timing.evidenceDuration);
    assert.ok(timing.core >= timing.convergence + timing.connectionDuration + 5 * 45);
    assert.ok(timing.decision >= timing.core + timing.coreDuration);
  }
  assert.ok(decisionSequenceTiming(true).decision < decisionSequenceTiming(false).decision);
});

test("decision and passport sequences have dedicated triggers, with finite scan animation", () => {
  assert.equal((source.match(/data-evidence>/g) || []).length, 6);
  assert.match(source, /data-decision-map/);
  assert.match(source, /data-trace-passport/);
  assert.match(source, /lp-passport-scan/);
  assert.match(source, /lp-passport-connection/);
  const motion = read("src/hooks/useLandingMotion.js");
  assert.match(motion, /is-sequenced/);
  assert.doesNotMatch(motion, /setInterval|iterations:\s*Infinity|preventDefault/);
  assert.match(motion, /observer\?\.disconnect\(\)/);
  assert.match(motion, /animations\.forEach\(\(animation\) => animation\.cancel\(\)\)/);
});

test("interactive gallery and menu expose keyboard-accessible controls", () => {
  const navbar = read("src/components/landing/LandingNavbar.jsx");
  assert.match(navbar, /<dialog/);
  assert.match(navbar, /onCancel=/);
  assert.match(navbar, /aria-expanded=\{open\}/);
  assert.match(navbar, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(navbar, /focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /aria-pressed=\{angle === index\}/);
  assert.match(read("src/pages/LandingPage.jsx"), /Skip to content/);
});

test("optimized local photographs have source credits and stay within the image budget", () => {
  const names = ["terraces", "terraces-small", "fields", "leaf", "tomatoes", "mangoes", "strawberries", "tomatoes-market", "tomatoes-harvest"];
  const credits = read("public/credits/ASSET_CREDITS.md");
  let total = 0;
  for (const name of names) {
    const path = fileURLToPath(new URL(`../public/images/landing/${name}.webp`, import.meta.url));
    const bytes = readFileSync(path);
    assert.equal(bytes.subarray(0, 4).toString(), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString(), "WEBP");
    assert.ok(credits.includes(name), `Missing asset credit: ${name}`);
    total += statSync(path).size;
  }
  assert.ok(total < 1_500_000, `Photographs total ${total} bytes`);
  assert.match(credits, /https:\/\/www\.pexels\.com\/license\//);
  assert.match(read("src/components/landing/LandingPrimitives.jsx"), /loading=\{eager \? "eager" : "lazy"\}/);
});
