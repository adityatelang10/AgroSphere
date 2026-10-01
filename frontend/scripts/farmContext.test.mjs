import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, basename } from "node:path";
import { transformSync } from "esbuild";
import { supportedCrop, listingQuantity, listingQuintals, mergePrefill, requestDeviceLocation } from "../src/utils/farmContext.js";
import { contextualMandiSelection } from "../src/utils/mandiContext.js";
import { readWeatherLocation, saveWeatherLocation } from "../src/utils/weatherLocation.js";

const tomato = { _id: "listing", name: "Tomato", stockQuantity: 100, unit: "kg", location: { district: "Bidar", state: "Karnataka" } };
const source = () => ({ selectedListing: tomato, profile: { location: tomato.location }, location: { latitude: 17, longitude: 77 }, locationSource: "Saved account coordinates" });
const weather = () => ({ today: { date: "2026-09-30" }, irrigationInputs: { minimumTemperatureC: 22, maximumTemperatureC: 32, latitude: 17, forecastRainfallNext24HoursMm: 4, recentRainfallMm: 99 } });
const elements = (node) => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(elements)];
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

// Executes actual form and prefill-hook code, including effects and asynchronous
// responses, with isolated React state / provider doubles. No live demo writes.
function fixture(entry, options = {}) {
  const root = fileURLToPath(new URL("../src/", import.meta.url));
  const modules = new Map(), slots = [], effects = [], calls = [];
  const storage = new Map();
  let cursor = 0, changed = false, tree, farm = options.farm ?? source();
  const jsx = (type, props) => ({ type, props });
  const react = {
    createContext: () => ({ Provider: "Provider" }),
    useContext: () => farm,
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) {
        const slot = { value: typeof initial === "function" ? initial() : initial };
        slot.set = (value) => {
          const next = typeof value === "function" ? value(slot.value) : value;
          if (!Object.is(next, slot.value)) { slot.value = next; changed = true; }
        };
        slots[i] = slot;
      }
      return [slots[i].value, slots[i].set];
    },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useMemo(factory, deps) {
      const i = cursor++;
      if (!sameDeps(slots[i]?.deps, deps)) slots[i] = { value: factory(), deps };
      return slots[i].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!sameDeps(slots[i]?.deps, deps)) {
        slots[i]?.cleanup?.();
        slots[i] = { deps };
        effects.push(() => { slots[i].cleanup = effect(); });
      }
    },
  };
  const globals = { console, URL, FormData, AbortSignal, AbortController, Date: options.Date || Date, setInterval, clearInterval,
    navigator: options.navigator || {},
    window: { localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) } },
  };
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    const { code } = transformSync(readFileSync(path, "utf8"), { loader: path.endsWith("jsx") ? "jsx" : "js", format: "cjs", jsx: "automatic" });
    const module = { exports: {} };
    vm.runInNewContext(code, { ...globals, module, exports: module.exports, require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react-router-dom") return { Link: "Link", useNavigate: () => () => {} };
      if (name.endsWith("context/FarmContext")) return { useFarmContext: () => farm };
      if (name.endsWith("AuthContext")) return { useAuth: () => ({ user: { id: "farmer", role: "FARMER" } }) };
      if (name.endsWith("useResultReveal")) return { __esModule: true, default: () => ({ current: null }) };
      if (name.includes("/services/")) return new Proxy({}, { get: (_, key) => options.services?.[key] || (async (...args) => { calls.push([key, ...args]); return {}; }) });
      if (name.startsWith("./") && basename(path) === "FarmContext.jsx" && name.includes("AuthContext")) return { useAuth: () => ({ user: { id: "farmer", role: "FARMER" } }) };
      if (name.includes("/components/") || (name.startsWith("./") && basename(path) === "FarmWeatherControls.jsx")) return { __esModule: true, default: basename(name), PrefillSources: "PrefillSources" };
      const candidate = resolve(dirname(path), name);
      const file = [candidate, candidate + ".js", candidate + ".jsx"].find(existsSync);
      if (file) return load(file);
      throw Error("Unexpected import " + name);
    } }, { filename: path });
    modules.set(path, module.exports);
    return module.exports;
  }
  const module = load(resolve(root, entry));
  let Component = module.default;
  let props = options.props || {};
  if (entry === "context/FarmContext.jsx") {
    const child = module.FarmContextProvider({ children: "Application" });
    Component = child.type; props = child.props;
  }
  function render() {
    for (let n = 0; n < 30; n++) {
      cursor = 0; changed = false; tree = Component(props);
      effects.splice(0).forEach((effect) => effect());
      if (!changed) return tree;
    }
    throw Error("Render loop");
  }
  const find = (predicate) => elements(render()).find(predicate);
  const field = (name) => find((node) => ["input", "select", "textarea"].includes(node.type) && node.props.name === name);
  return {
    render, find, field, calls, storage,
    change(name, value) { field(name).props.onChange({ target: { name, value } }); render(); },
    async settle() { await new Promise((done) => setImmediate(done)); return render(); },
    setFarm(value) { farm = value; return render(); },
    setProps(value) { props = value; return render(); },
    submit: () => find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }),
    unmount: () => slots.forEach((slot) => slot.cleanup?.()),
  };
}

test("exact supported crop names only; no substring guesses or fabricated quantity", () => {
  assert.equal(supportedCrop(tomato, ["tomato"]), "tomato");
  assert.equal(supportedCrop({ name: "Tomato seedlings" }, ["tomato"]), "");
  assert.equal(supportedCrop({ name: "Rice" }, ["tomato", "maize"]), "");
  assert.equal(listingQuantity({ stockQuantity: null }), "");
  assert.equal(listingQuantity({ stockQuantity: 0 }), "0");
  assert.equal(listingQuintals(tomato), "1");
  assert.equal(listingQuintals({ ...tomato, stockQuantity: 100000, unit: "gram" }), "1");
  assert.equal(listingQuintals({ ...tomato, unit: "dozen" }), "");
});
test("manual entries including cleared fields beat late auto values; null never becomes zero", () => {
  assert.deepEqual(mergePrefill({ temperature: "", forecast: "" }, { temperature: 30, forecast: null }, { temperature: true }), { temperature: "", forecast: "" });
});
test("account coordinates never silently inherit another account or legacy storage", (t) => {
  const old = globalThis.window, storage = new Map();
  globalThis.window = { localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) } };
  t.after(() => { if (old === undefined) delete globalThis.window; else globalThis.window = old; });
  saveWeatherLocation({ latitude: 17, longitude: 77 });
  assert.equal(readWeatherLocation("farmer-a"), null);
  saveWeatherLocation({ latitude: 0, longitude: 0 }, "farmer-a");
  assert.deepEqual(readWeatherLocation("farmer-a"), { latitude: 0, longitude: 0 });
  assert.equal(readWeatherLocation("farmer-b"), null);
});
test("device geolocation preserves actual zero and permission denial gives manual fallback", async () => {
  assert.deepEqual(await requestDeviceLocation({ getCurrentPosition: (success) => success({ coords: { latitude: 0, longitude: 0 } }) }), { latitude: 0, longitude: 0 });
  await assert.rejects(requestDeviceLocation({ getCurrentPosition: (_, fail) => fail() }), /manually/);
  await assert.rejects(requestDeviceLocation(null), /manually/);
});
test("irrigation reuses crop/latitude/date but never guesses stage, soil, moisture or rain", () => {
  const f = fixture("pages/farmer/SmartIrrigationPage.jsx");
  assert.equal(f.field("crop").props.value, "tomato");
  assert.equal(f.field("latitude").props.value, 17);
  assert.match(f.field("observationDate").props.value, /^\d{4}-\d{2}-\d{2}$/);
  for (const name of ["growthStage", "soilType", "soilMoisture", "recentRainfall", "forecastRainfall", "daysSinceLastIrrigation"]) assert.equal(f.field(name).props.value, "");
  f.find((node) => node.type === "IrrigationWeatherAssist").props.onWeatherLoaded(weather());
  assert.equal(f.field("minimumTemperature").props.value, "22");
  assert.equal(f.field("maximumTemperature").props.value, "32");
  assert.equal(f.field("forecastRainfall").props.value, "4");
  assert.equal(f.field("recentRainfall").props.value, "");
});
test("late weather cannot overwrite edits; historical date or different latitude refuses current weather", () => {
  const f = fixture("pages/farmer/SmartIrrigationPage.jsx");
  f.change("minimumTemperature", "18"); f.change("forecastRainfall", "");
  const apply = () => f.find((node) => node.type === "IrrigationWeatherAssist").props.onWeatherLoaded(weather());
  apply();
  assert.equal(f.field("minimumTemperature").props.value, "18");
  assert.equal(f.field("forecastRainfall").props.value, "");
  f.change("observationDate", "2020-01-01"); apply();
  assert.equal(f.field("observationDate").props.value, "2020-01-01");
  assert.equal(f.field("maximumTemperature").props.value, "");
  f.change("observationDate", weather().today.date); f.change("latitude", "20"); apply();
  assert.equal(f.field("latitude").props.value, "20");
  assert.equal(f.field("maximumTemperature").props.value, "");
});
test("changing selected listing updates untouched suggestions and clears unsupported crop", () => {
  const f = fixture("pages/farmer/SmartIrrigationPage.jsx");
  assert.equal(f.field("crop").props.value, "tomato");
  f.setFarm({ ...source(), selectedListing: { ...tomato, name: "Maize" } });
  assert.equal(f.field("crop").props.value, "maize");
  f.setFarm({ ...source(), selectedListing: { ...tomato, name: "Rice" } });
  assert.equal(f.field("crop").props.value, "");
  f.change("crop", "cotton"); f.setFarm(source());
  assert.equal(f.field("crop").props.value, "cotton");
});

test("weather location changes clear old suggestions, block pending submission and preserve manual values", async () => {
  const f = fixture("pages/farmer/SmartIrrigationPage.jsx");
  f.find((node) => node.type === "IrrigationWeatherAssist").props.onWeatherLoaded(weather());
  f.change("minimumTemperature", "18");
  f.setFarm({ ...source(), location: { latitude: 20, longitude: 80 }, weather: null, weatherLoading: true });
  assert.equal(f.field("latitude").props.value, 20);
  assert.equal(f.field("minimumTemperature").props.value, "18");
  assert.equal(f.field("maximumTemperature").props.value, "");
  assert.equal(f.field("forecastRainfall").props.value, "");
  assert.equal(f.find((node) => node.type === "button" && node.props.type === "submit").props.disabled, true);
  await f.submit(); assert.equal(f.calls.length, 0);
  f.setFarm({ ...source(), location: { latitude: 20, longitude: 80 }, weather: null, weatherLoading: false, weatherError: "unavailable" });
  assert.equal(f.field("maximumTemperature").props.value, "");
  assert.equal(f.field("minimumTemperature").props.value, "18");
  f.find((node) => node.type === "IrrigationWeatherAssist").props.onWeatherLoaded({ ...weather(), irrigationInputs: { ...weather().irrigationInputs, latitude: 20, maximumTemperatureC: 34 } });
  assert.equal(f.field("maximumTemperature").props.value, "34");
  assert.equal(f.field("minimumTemperature").props.value, "18");
});

test("longitude-only changes also invalidate previously filled weather", () => {
  const f = fixture("pages/farmer/SmartIrrigationPage.jsx");
  f.find((node) => node.type === "IrrigationWeatherAssist").props.onWeatherLoaded(weather());
  f.setFarm({ ...source(), location: { latitude: 17, longitude: 80 }, weather: null });
  assert.equal(f.field("minimumTemperature").props.value, "");
  assert.equal(f.field("maximumTemperature").props.value, "");
  assert.equal(f.field("forecastRainfall").props.value, "");
});

test("weather received while disabled applies once when enabled, without replay after ordinary submits", () => {
  const calls = [], value = weather();
  const props = { disabled: true, onWeatherLoaded: (value) => calls.push(value) };
  const f = fixture("components/weather/FarmWeatherControls.jsx", { farm: { ...source(), weather: null }, props });
  f.setFarm({ ...source(), weather: value }); assert.equal(calls.length, 0);
  f.setProps({ ...props, disabled: false }); assert.equal(calls.length, 1);
  f.setProps(props); f.setProps({ ...props, disabled: false }); assert.equal(calls.length, 1);
  f.setFarm({ ...source(), weather: null });
  f.setFarm({ ...source(), weather: value }); assert.equal(calls.length, 2);
});
test("Decision uses selected stock/unit and requests saved evidence, not weather sale-price guesses", async () => {
  const f = fixture("pages/farmer/DecisionEnginePage.jsx");
  assert.equal(f.field("selectedCrop").props.value, "tomato");
  assert.equal(f.field("availableQuantity").props.value, "100");
  assert.equal(f.field("quantityUnit").props.value, "kg");
  for (const name of ["farmState", "storageAvailable", "waterAvailability", "currentSalePrice", "transportCost", "storageCost", "otherCost"]) assert.equal(f.field(name).props.value, "");
  await f.settle();
  assert.deepEqual(f.calls.filter(([key]) => key === "getDecisionEvidence"), [["getDecisionEvidence", "tomato"]]);
  await f.submit();
  assert.equal(f.calls.some(([key]) => key === "requestFarmDecision"), false);
  f.change("selectedCrop", "maize");
  assert.equal(f.field("availableQuantity").props.value, "");
});
test("market prefill converts only mass stock and preserves true historical archive semantics", async () => {
  const f = fixture("pages/farmer/MarketIntelligencePage.jsx");
  assert.equal(f.field("crop").props.value, "tomato");
  assert.equal(f.field("marketKey").props.value, "tomato-pune-local");
  assert.equal(f.field("quantityQuintals").props.value, "1");
  for (const name of ["expectedSalePrice", "transportCost", "storageCost", "otherCost"]) assert.equal(f.field(name).props.value, "");
  await f.submit();
  assert.equal(f.calls.length, 0);
  f.change("crop", "maize");
  assert.equal(f.field("quantityQuintals").props.value, "");
});
test("mandi suggestions match actual reports and do not guess among several markets", () => {
  const rows = [{ state: "Karnataka", district: "Bidar", market: "A", commodity: "Tomato" }, { state: "Karnataka", district: "Bidar", market: "B", commodity: "Tomato" }];
  assert.deepEqual(contextualMandiSelection(rows, tomato.location, "Tomato"), { district: "Bidar", market: "", commodity: "Tomato" });
  assert.deepEqual(contextualMandiSelection(rows.slice(0, 1), tomato.location, "Tomato"), { district: "Bidar", market: "A", commodity: "Tomato" });
  assert.deepEqual(contextualMandiSelection(rows, { district: "Unknown", state: "Karnataka" }, "Tomato"), { district: "", market: "", commodity: "" });
  assert.equal(contextualMandiSelection(rows, tomato.location, "Potato").commodity, "");
});
test("Add Crop receives saved location/name but never previous batch quantity, price or harvest date", () => {
  const f = fixture("pages/farmer/AddCropPage.jsx");
  assert.equal(f.field("district").props.value, "Bidar");
  assert.equal(f.field("state").props.value, "Karnataka");
  assert.equal(f.field("name").props.value, "Tomato");
  for (const name of ["stockQuantity", "price", "harvestDate"]) assert.equal(f.field(name).props.value, "");
  f.change("district", "My field");
  f.setFarm({ ...source(), selectedListing: null, profile: { location: { district: "Another", state: "Maharashtra" } } });
  assert.equal(f.field("district").props.value, "My field");
  assert.equal(f.field("state").props.value, "Maharashtra");
});
test("weather assist does not refill after submission or ask location permission without a click", async () => {
  let applied = 0, prompted = 0;
  const farm = { ...source(), location: null, weather: weather(), useDeviceLocation: () => prompted++ };
  const f = fixture("components/weather/FarmWeatherControls.jsx", { farm, props: { onWeatherLoaded: () => applied++ },
    navigator: { permissions: { query: async () => ({ state: "prompt" }) } } });
  f.render(); await f.settle();
  assert.equal(applied, 1); assert.equal(prompted, 0);
  f.setProps({ disabled: true, onWeatherLoaded: () => applied++ });
  f.setProps({ disabled: false, onWeatherLoaded: () => applied++ });
  assert.equal(applied, 1);
  f.find((node) => node.type === "button" && node.props.children === "Use My Location").props.onClick();
  assert.equal(prompted, 1);
});
test("shared provider deduplicates weather, reuses cache and propagates failures without synthetic data", async () => {
  const pending = deferred(); let requests = 0;
  const f = fixture("context/FarmContext.jsx", { services: {
    apiRequest: async () => ({ profile: { farmName: "Farm" }, crops: [tomato] }),
    getWeather: async () => { requests++; return pending.promise; },
  } });
  let context = f.render().props.value; await f.settle(); context = f.render().props.value;
  assert.equal(context.selectedListing.name, "Tomato");
  const first = context.loadWeather({ latitude: 17, longitude: 77 });
  const second = context.loadWeather({ latitude: 17, longitude: 77 });
  assert.equal(requests, 1);
  pending.resolve(weather()); await Promise.all([first, second]);
  await f.render().props.value.loadWeather({ latitude: 17, longitude: 77 });
  assert.equal(requests, 1);
  assert.equal(f.render().props.value.weather.irrigationInputs.minimumTemperatureC, 22);
  f.unmount();
  const failed = fixture("context/FarmContext.jsx", { services: {
    apiRequest: async () => { throw Error("Context offline"); },
    getWeather: async () => { throw Error("Weather unavailable"); },
  } });
  failed.render(); await failed.settle();
  assert.equal(failed.render().props.value.profile, null);
  await failed.render().props.value.loadWeather({ latitude: 17, longitude: 77 });
  assert.equal(failed.render().props.value.weather, null);
  assert.match(failed.render().props.value.weatherError, /Could not retrieve weather automatically/);
  assert.equal(failed.render().props.value.weatherLoading, false);
  failed.unmount();
});
test("shared provider will not choose arbitrarily between several listings", async () => {
  const f = fixture("context/FarmContext.jsx", { services: { apiRequest: async () => ({ crops: [tomato, { ...tomato, _id: "second", name: "Maize" }] }) } });
  f.render(); await f.settle();
  assert.equal(f.render().props.value.selectedListing, null);
  f.render().props.value.selectListing("second");
  assert.equal(f.render().props.value.selectedListing.name, "Maize");
  f.unmount();
});

test("late weather for old coordinates cannot replace a newer request", async () => {
  const first = deferred(), second = deferred();
  const f = fixture("context/FarmContext.jsx", { services: {
    apiRequest: async () => ({ crops: [] }),
    getWeather: (coords) => coords.latitude === 17 ? first.promise : second.promise,
  } });
  const context = f.render().props.value;
  const old = context.loadWeather({ latitude: 17, longitude: 77 });
  const recent = context.loadWeather({ latitude: 18, longitude: 78 });
  second.resolve({ marker: "new" }); await recent;
  first.resolve({ marker: "old" }); await old;
  assert.equal(f.render().props.value.weather.marker, "new");
  assert.equal(f.render().props.value.location.latitude, 18);
  f.unmount();
});
test("permission denial releases loading; late device result cannot undo manual coordinates", async () => {
  let deviceSuccess;
  const f = fixture("context/FarmContext.jsx", {
    services: { apiRequest: async () => ({ crops: [] }), getWeather: async () => weather() },
    navigator: { geolocation: { getCurrentPosition: (success) => { deviceSuccess = success; } } },
  });
  const device = f.render().props.value.useDeviceLocation();
  await f.render().props.value.loadWeather({ latitude: 18, longitude: 78 }, "Manual");
  deviceSuccess({ coords: { latitude: 17, longitude: 77 } }); await device;
  assert.equal(f.render().props.value.location.latitude, 18); f.unmount();
  const denied = fixture("context/FarmContext.jsx", {
    navigator: { geolocation: { getCurrentPosition: (_, fail) => fail() } },
    services: { apiRequest: async () => ({ crops: [] }) },
  });
  await denied.render().props.value.useDeviceLocation();
  assert.equal(denied.render().props.value.weatherLoading, false);
  assert.equal(denied.render().props.value.weather, null);
  assert.match(denied.render().props.value.weatherError, /denied/);
  denied.unmount();
});
test("cached reads do not extend weather freshness indefinitely", async () => {
  let now = 1000000, requests = 0;
  class Clock extends Date { static now() { return now; } }
  const f = fixture("context/FarmContext.jsx", { Date: Clock, services: {
    apiRequest: async () => ({ crops: [] }),
    getWeather: async () => { requests++; return weather(); },
  } });
  const coords = { latitude: 17, longitude: 77 };
  await f.render().props.value.loadWeather(coords);
  now += 599999; await f.render().props.value.loadWeather(coords); assert.equal(requests, 1);
  now += 2; await f.render().props.value.loadWeather(coords); assert.equal(requests, 2);
  f.unmount();
});
test("latest mandi panel prefills state, applies reported district/commodity, protects manual state", async (t) => {
  const records = [{ state: "Karnataka", district: "Bidar", market: "A", commodity: "Tomato",
    reportedDate: "2026-09-30", minPrice: 100, modalPrice: 110, maxPrice: 120 }];
  const f = fixture("components/market/LatestMandiPricePanel.jsx", { services: {
    getLatestMandiPrices: async () => ({ records, query: { state: "Karnataka" }, source: { fetchedAt: new Date().toISOString() } }),
  } });
  t.after(f.unmount);
  const stateInput = () => f.find((node) => node.type === "input");
  assert.equal(stateInput().props.value, "Karnataka");
  await f.submit(); await f.settle();
  const selects = elements(f.render()).filter((node) => node.type === "select");
  assert.deepEqual(selects.map((node) => node.props.value), ["Bidar", "A", "Tomato"]);
  stateInput().props.onChange({ target: { value: "Maharashtra" } });
  f.setFarm({ ...source(), profile: { location: { state: "Gujarat" } }, selectedListing: null });
  assert.equal(stateInput().props.value, "Maharashtra"); f.unmount();
});
test("What-If chooses contextual crop and loads a saved baseline without manufacturing one", async () => {
  const f = fixture("pages/farmer/WhatIfSimulatorPage.jsx", { services: {
    getWhatIfContext: async () => ({ hasBaseScenario: false, selectedCropLabel: "Tomato" }),
  } });
  f.render(); await f.settle();
  assert.equal(f.find((node) => node.type === "select").props.value, "tomato");
  assert.equal(f.find((node) => node.type === "form"), undefined);
  f.unmount();
});
