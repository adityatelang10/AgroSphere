import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_NAVBAR_THRESHOLDS, nextNavbarState } from "../src/utils/landingMotion.js";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const nav = read("components/layout/TopNav.jsx");

test("app navigation retains the existing role gates, destinations and logout handler", () => {
  assert.match(nav, /canAccessCart = user\?\.role === "CUSTOMER"/);
  assert.match(nav, /user\?\.role === "FARMER"/);
  assert.match(nav, /user\?\.role === "CUSTOMER"/);
  assert.match(nav, /isAuthenticated \? \(/);
  for (const path of ["/marketplace", "/orders", "/cart", "/profile", "/login", "/register", "/farmer/dashboard", "/farmer/crops", "/farmer/orders", "/farmer/crop-recommendation", "/farmer/disease-detection", "/farmer/irrigation-advisor", "/farmer/market-intelligence", "/farmer/decision-engine", "/farmer/what-if-simulator"]) {
    assert.ok(nav.includes(`"${path}"`), `Missing ${path}`);
  }
  assert.match(nav, /await logout\(\);\s*navigate\("\/login"\)/);
  assert.match(nav, /const \{ uniqueItemCount \} = useCart\(\)/);
  assert.equal((nav.match(/to="\/cart"/g) || []).length, 1);
  assert.equal((nav.match(/<NotificationBell/g) || []).length, 1);
  assert.equal((nav.match(/<nav /g) || []).length, 1);
});

test("landing and application share the same leaf branding without changing link destinations", () => {
  assert.match(nav, /<NavbarBrand to="\/marketplace"/);
  assert.match(read("components/landing/LandingPrimitives.jsx"), /<NavbarBrand className="lp-wordmark"/);
  assert.match(read("components/layout/NavbarBrand.jsx"), /to = "\/"/);
});

test("mobile navigation has one collapsible panel, escape and outside-click handling", () => {
  assert.match(nav, /aria-controls="app-navigation-panel"/);
  assert.match(nav, /aria-expanded=\{isMobileOpen\}/);
  assert.match(nav, /event.key === "Escape" && !isIntelligenceOpen/);
  assert.match(nav, /focus\(\{ preventScroll: true \}\)/);
  assert.match(nav, /removeEventListener\("pointerdown", onPointer\)/);
  assert.match(read("components/ui/NotificationBell.jsx"), /aria-expanded=\{isOpen\}/);
});

test("app scroll behavior protects keyboard focus and open controls without retaining a pointer-focus lock", () => {
  const hook = read("hooks/useNavbarScroll.js");
  for (const token of ["nextNavbarState", "APP_NAVBAR_THRESHOLDS", "shortPage", "reduce.matches", "menuOpen", "header.contains(document.activeElement)", 'matches(":focus-visible")', "aria-expanded", 'addEventListener("focusin", reveal)', "cancelAnimationFrame", 'removeEventListener("scroll", schedule)', '{ passive: true }']) {
    assert.ok(hook.includes(token), `Missing scroll safeguard ${token}`);
  }
  assert.doesNotMatch(hook, /preventDefault|setInterval|pointerInside|pointerenter/);
  assert.match(hook, /scrollRange < 160/);
  assert.match(read("styles/navigation.css"), /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(read("styles/navigation.css"), /:focus-within/);
});

test("app navbar hides at 50px down and returns at 20px up, independent of landing defaults", () => {
  let state = { previousY: 200, direction: 0, distance: 0, hidden: false };
  for (const y of [210, 225, 249]) {
    state = nextNavbarState(state, y, false, APP_NAVBAR_THRESHOLDS);
    assert.equal(state.hidden, false);
  }
  state = nextNavbarState(state, 250, false, APP_NAVBAR_THRESHOLDS);
  assert.equal(state.hidden, true);
  state = nextNavbarState(state, 231, false, APP_NAVBAR_THRESHOLDS);
  assert.equal(state.hidden, true);
  state = nextNavbarState(state, 230, false, APP_NAVBAR_THRESHOLDS);
  assert.equal(state.hidden, false);
});

test("app navbar ignores small direction reversals and resets when locked or at the top", () => {
  let state = { previousY: 250, direction: 1, distance: 50, hidden: true };
  for (const y of [249, 250, 248, 250, 247, 250]) {
    state = nextNavbarState(state, y, false, APP_NAVBAR_THRESHOLDS);
    assert.equal(state.hidden, true);
  }
  assert.equal(nextNavbarState(state, 500, true, APP_NAVBAR_THRESHOLDS).hidden, false);
  assert.equal(nextNavbarState(state, 20, false, APP_NAVBAR_THRESHOLDS).hidden, false);
  state = nextNavbarState(state, 500, true, APP_NAVBAR_THRESHOLDS);
  assert.equal(nextNavbarState(state, 549, false, APP_NAVBAR_THRESHOLDS).hidden, false);
  assert.equal(nextNavbarState(state, 550, false, APP_NAVBAR_THRESHOLDS).hidden, true);
});

test("navbar uses the existing dark class and theme tokens instead of yellow hover surfaces", () => {
  const css = read("styles/navigation.css");
  assert.match(css, /\.dark \.ag-app-nav \{/);
  for (const name of ["surface", "text", "accent", "border", "highlight", "popover"]) {
    assert.ok(css.includes(`var(--nav-${name})`));
  }
  assert.match(css, /\.ag-nav-link:is\([^}]*background:transparent/);
  assert.doesNotMatch(css, /#d1ec7d|rgba\(#/);
});

test("hover spacing is reserved and animated only on text, with center-out lines", () => {
  const css = read("styles/navigation.css");
  assert.match(nav, /className="ag-nav-label" data-label=\{children\}/);
  assert.match(css, /content:attr\(data-label\); visibility:hidden/);
  assert.match(css, /letter-spacing:0; transition:letter-spacing \.32s/);
  assert.match(css, /transform-origin:center; transition:transform \.32s/);
  assert.match(css, /--nav-hover-spacing:3px/);
  assert.match(css, /--nav-hover-spacing:\.6px/);
  assert.doesNotMatch(css, /ag-cart-count[^}]*letter-spacing|ag-brand[^}]*letter-spacing:var/);
});

test("shared navbar is edge-to-edge with a subtle bottom rule, not a floating card", () => {
  const css = read("styles/navigation.css");
  const header = css.match(/\.ag-app-nav \{([\s\S]*?)\}/)[1];
  for (const rule of ["top:0", "margin:0", "width:100%", "border:0", "border-bottom:1px solid var(--nav-border)", "border-radius:0", "box-shadow:none"]) {
    assert.ok(header.includes(rule), `Missing integrated navbar rule: ${rule}`);
  }
  assert.doesNotMatch(css, /\.ag-app-nav \{[^}]*width:calc|\.ag-app-nav \{[^}]*border-radius:(?:20|24)px/);
  assert.match(css, /\.ag-nav-links \{[^}]*justify-content:center/);
});

test("slide and fade are smooth, with a stronger surface only after scrolling or opening the menu", () => {
  const css = read("styles/navigation.css");
  assert.match(css, /transform \.6s cubic-bezier\(\.4,0,\.2,1\),opacity \.6s/);
  assert.match(css, /\.ag-app-nav\.is-hidden \{ transform:translateY\(-110%\); opacity:0; pointer-events:none/);
  assert.match(css, /\.ag-app-nav:has\(:focus-visible\),\.ag-app-nav\.is-open \{[^}]*opacity:1; pointer-events:auto/);
  assert.match(css, /\.ag-app-nav\.is-scrolled,\.ag-app-nav\.is-open \{ background:var\(--nav-scrolled-surface\); backdrop-filter:blur\(14px\)/);
  const hook = read("hooks/useNavbarScroll.js");
  assert.match(hook, /classList.toggle\("is-scrolled", window.scrollY > APP_NAVBAR_THRESHOLDS.top\)/);
  assert.match(hook, /classList.remove\("is-hidden", "is-scrolled"\)/);
  assert.match(css, /prefers-reduced-motion:reduce[\s\S]*opacity:1; pointer-events:auto/);
});

test("footer is product-focused with readable type and no empty college column", () => {
  const footer = read("components/landing/ClosingSections.jsx");
  const css = read("styles/landing.css");
  assert.doesNotMatch(footer, /Government Engineering|Department of|Final.year|Academic Year|lp-college/i);
  assert.doesNotMatch(css, /lp-college/);
  assert.match(css, /\.lp-footer-top \{[^}]*grid-template-columns:1\.2fr 1fr/);
  assert.match(css, /\.lp-footer nav \{[^}]*font-size:16px/);
  assert.match(css, /\.lp-footer-bottom \{[^}]*font-size:15px/);
});
