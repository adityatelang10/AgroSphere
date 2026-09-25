import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { transformSync } from "esbuild";
import postcss from "postcss";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const css = postcss.parse(read("styles/mobile.css"));

test("all style overrides are restricted to phones; tablet/desktop utilities are untouched", () => {
  const rules = css.nodes.filter((node) => node.type !== "comment");
  assert.equal(rules.length, 1);
  assert.equal(rules[0].name, "media");
  assert.equal(rules[0].params, "(max-width: 639.98px)");
  const grid = rules[0].nodes.find((node) => node.selector === ".marketplace-grid");
  assert.equal(grid.nodes.find((node) => node.prop === "grid-template-columns").value, "repeat(3, minmax(0, 1fr))");
  assert.equal(grid.nodes.find((node) => node.prop === "gap").value, "6px");
  const main = read("main.jsx");
  assert.ok(main.indexOf('import "./styles/mobile.css"') > main.indexOf('import "./index.css"'));
  assert.match(read("pages/marketplace/MarketplacePage.jsx"), /sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4/);
});

function elements(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(elements)];
}

function fixture() {
  const { code } = transformSync(read("pages/marketplace/MarketplacePage.jsx"), { loader: "jsx", format: "cjs", jsx: "automatic" });
  const calls = [];
  const state = [];
  let cursor = 0;
  const module = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(code, { module, exports: module.exports, require: (name) => {
    if (name === "react") return {
      useEffect() {},
      useCallback: (fn) => fn,
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      },
    };
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "react-router-dom") return { useNavigate: () => () => {} };
    if (name.endsWith("AuthContext")) return { useAuth: () => ({ user: null }) };
    if (name.endsWith("CartContext")) return { useCart: () => ({ addToCart: () => { throw Error("Unexpected cart mutation"); } }) };
    if (name.endsWith("cropService")) return { listCrops: async (filters) => { calls.push({ ...filters }); return { crops: [] }; } };
    return { __esModule: true, default: name.split("/").pop() };
  } });
  const render = () => { cursor = 0; return module.exports.default(); };
  const find = (predicate, root = render()) => elements(root).find(predicate);
  const open = () => find((node) => node.props?.["aria-controls"] === "marketplace-filter-sheet").props.onClick();
  const sheet = () => find((node) => node.type === "MobileFilterSheet");
  return { render, find, open, sheet, calls };
}

test("mobile filters start closed; opening/closing alone never requests crops or mutates cart", () => {
  const f = fixture();
  assert.equal(f.sheet(), undefined);
  f.open();
  assert.ok(f.sheet());
  f.sheet().props.onClose();
  assert.equal(f.sheet(), undefined);
  assert.equal(f.calls.length, 0);
});

test("every mobile filter passes the same existing values to one request and Apply closes the sheet", async () => {
  const f = fixture();
  f.open();
  const values = { search: "Tomato", category: "Vegetable", season: "Summer", district: "Bidar", state: "Karnataka", minPrice: "20", maxPrice: "100" };
  for (const [name, value] of Object.entries(values)) {
    f.find((node) => node.type === "input" && node.props.name === name, f.sheet()).props.onChange({ target: { name, value } });
  }
  f.find((node) => node.props?.name === "isOrganic", f.sheet()).props.onChange({ target: { checked: true } });
  await f.find((node) => node.type === "form", f.sheet()).props.onSubmit({ preventDefault() {} });
  assert.deepEqual(f.calls, [{ ...values, isOrganic: "true" }]);
  assert.equal(f.sheet(), undefined);
  f.open();
  assert.equal(f.find((node) => node.props?.name === "district", f.sheet()).props.value, "Bidar");
});

test("mobile search uses the unchanged filter handler", async () => {
  const f = fixture();
  f.find((node) => node.props?.["aria-label"] === "Search crops").props.onChange({ target: { name: "search", value: "Mango" } });
  const search = f.find((node) => node.type === "form" && node.props.className.includes("relative"));
  await search.props.onSubmit({ preventDefault() {} });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].search, "Mango");
});

test("sheet locks background scroll, uses native modal focus, and cleans up on close or desktop resize", () => {
  const source = read("components/marketplace/MobileFilterSheet.jsx");
  for (const text of ["dialog.showModal()", "dialog.close()", 'document.body.style.overflow = "hidden"', "document.body.style.overflow = bodyOverflow", "document.documentElement.style.overflow = rootOverflow", 'removeEventListener("change", onResize)', "previouslyFocused.focus({ preventScroll: true })", "onCancel=", "getBoundingClientRect()", 'aria-label="Close filters"']) assert.ok(source.includes(text), text);
  assert.match(source, /min-width: 640px/);
  assert.match(source, /createPortal/);
});
