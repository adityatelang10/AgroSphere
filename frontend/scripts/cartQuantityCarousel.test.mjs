import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { getCropImages } from "../src/utils/cropImages.js";
import { getCartMetrics } from "../src/utils/cartCalculations.js";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const elements = (node) => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(elements)];
function component(path, props, dependencies = {}) {
  const { code } = transformSync(read(path), { loader: "jsx", format: "cjs", jsx: "automatic" });
  const slots = [], effects = []; let cursor = 0;
  const jsx = (type, props) => ({ type, props }); const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "react") return {
      useId: () => "quantity-feedback",
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
      useEffect(effect, deps) { const i = cursor++; if (!slots[i] || deps.some((value, n) => value !== slots[i][n])) { slots[i] = deps; effects.push(effect); } },
    };
    if (name.endsWith(".css")) return {};
    for (const [key, value] of Object.entries(dependencies)) if (name.endsWith(key)) return value;
    throw Error(`Unexpected import ${name}`);
  } });
  const render = () => { cursor = 0; const result = module.exports.default(props); if (effects.length) { effects.splice(0).forEach((f) => f()); return render(); } return result; };
  return { props, exports: module.exports, render, all: () => elements(render()), find: (fn) => elements(render()).find(fn) };
}
function quantityFixture(overrides = {}) {
  const calls = [], item = { cropId: "mango", name: "Mango", quantity: 1, price: 40, unit: "kg", stockQuantity: 8, ...overrides };
  const f = component("components/marketplace/CartQuantityControl.jsx", { item, onChange(id, quantity) { calls.push({ id, quantity }); item.quantity = quantity; } });
  return { ...f, item, calls, input: () => f.find((n) => n.type === "input"),
    type: (value) => f.find((n) => n.type === "input").props.onChange({ target: { value } }),
    click: (direction) => f.find((n) => n.type === "button" && n.props["aria-label"].startsWith(direction)).props.onClick(),
  };
}
function galleryFixture(count = 3) {
  const crop = { name: "Tomato", images: Array.from({ length: count }, (_, i) => ({ url: `https://example.invalid/${i}.jpg` })) };
  const f = component("components/marketplace/CropImageGallery.jsx", { crop }, { cropImages: { getCropImages }, CropImage: { __esModule: true, default: "CropImage" } });
  return { ...f, crop, click: (label) => f.find((n) => n.type === "button" && n.props["aria-label"] === label).props.onClick(),
    active: () => f.find((n) => n.type === "button" && n.props["aria-pressed"] === true)?.props["aria-label"],
    key: (key) => { let prevented = false; f.render().props.onKeyDown({ key, preventDefault() { prevented = true; } }); return prevented; },
  };
}

test("typing 5 updates quantity and total immediately; plus/minus continue from typed value", () => {
  const f = quantityFixture(); f.type("5");
  assert.equal(f.item.quantity, 5); assert.equal(getCartMetrics([f.item]).subtotal, 200);
  f.click("Increase"); assert.equal(f.item.quantity, 6); assert.equal(f.input().props.value, "6");
  f.click("Decrease"); assert.equal(f.item.quantity, 5); assert.equal(f.input().props.value, "5");
});
test("zero, negative, letters, exponent and nonfinite quantities never update cart", () => {
  for (const value of ["0", "-2", "mango", "1e3", "Infinity", "9".repeat(400)]) {
    const f = quantityFixture({ quantity: 5 }); f.type(value);
    assert.equal(f.item.quantity, 5); assert.equal(f.calls.length, 0);
    assert.ok(f.find((n) => n.props.role === "alert"));
    if (value === "mango" || value === "-2") assert.equal(f.input().props.value, "5");
  }
});
test("exceeding stock gives the available amount, and blur restores last valid quantity", () => {
  const f = quantityFixture({ quantity: 5 }); f.type("9");
  assert.equal(f.item.quantity, 5); assert.match(f.find((n) => n.props.role === "alert").props.children, /Only 8 kg available/);
  f.input().props.onBlur(); assert.equal(f.input().props.value, "5");
  assert.match(f.find((n) => n.props.role === "alert").props.children, /Quantity remains 5/);
});
test("empty editing is allowed, Enter validates without form submission", () => {
  const f = quantityFixture({ quantity: 5 }); f.type(""); assert.equal(f.item.quantity, 5);
  let prevented = false;
  f.input().props.onKeyDown({ key: "Enter", preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(f.input().props.value, "5");
  f.type("05"); f.input().props.onBlur(); assert.equal(f.input().props.value, "5");
});
test("existing fractional units and one-unit minimum are preserved, including stock clamping", () => {
  const f = quantityFixture({ stockQuantity: 8.5 }); f.type("1.5"); assert.equal(f.item.quantity, 1.5);
  f.type("0.5"); assert.equal(f.item.quantity, 1.5);
  f.type("8"); f.click("Increase"); assert.equal(f.item.quantity, 8.5);
  assert.equal(f.find((n) => n.type === "button" && n.props["aria-label"].startsWith("Increase")).props.disabled, true);
  f.type("1."); f.input().props.onBlur(); assert.equal(f.item.quantity, 1);
  assert.equal(f.find((n) => n.type === "button" && n.props["aria-label"].startsWith("Decrease")).props.disabled, true);
});
test("quantity is labeled, numeric-keyboard enabled, and buttons cannot submit checkout", () => {
  const f = quantityFixture(); assert.equal(f.input().props.inputMode, "numeric"); assert.equal(f.input().props["aria-label"], "Mango quantity");
  assert.ok(f.all().filter((n) => n.type === "button").every((n) => n.props.type === "button"));
  f.type("0"); assert.equal(f.input().props["aria-describedby"], "quantity-feedback"); assert.equal(f.input().props["aria-invalid"], true);
});
test("out-of-stock is rejected; missing stock metadata keeps existing no-local-cap behavior", () => {
  const zero = quantityFixture({ stockQuantity: 0 }); zero.type("1"); assert.equal(zero.calls.length, 0);
  assert.match(zero.find((n) => n.props.role === "alert").props.children, /Only 0 kg/);
  const unknown = quantityFixture({ stockQuantity: undefined }); unknown.type("10"); assert.equal(unknown.item.quantity, 10);
});
test("carousel arrows wrap in both directions and keep thumbnails synchronized", () => {
  const f = galleryFixture(); assert.equal(f.active(), "Show Tomato image 1");
  f.click("Previous image"); assert.equal(f.active(), "Show Tomato image 3");
  f.click("Next image"); assert.equal(f.active(), "Show Tomato image 1");
  f.click("Next image"); assert.equal(f.active(), "Show Tomato image 2");
  f.click("Show Tomato image 3"); f.click("Previous image"); assert.equal(f.active(), "Show Tomato image 2");
});
test("left/right keyboard changes images, other keys keep default behavior", () => {
  const f = galleryFixture(); assert.equal(f.key("ArrowLeft"), true); assert.equal(f.active(), "Show Tomato image 3");
  assert.equal(f.key("ArrowRight"), true); assert.equal(f.active(), "Show Tomato image 1");
  assert.equal(f.key("Tab"), false);
  assert.equal(f.find((n) => n.props.className?.includes("ag-carousel-frame")).props.tabIndex, 0);
});
test("zero/one image hides arrows; legacy single image and removed active image remain usable", () => {
  for (const count of [0, 1]) {
    const f = galleryFixture(count); assert.equal(f.all().filter((n) => n.type === "button").length, 0);
    assert.equal(f.key("ArrowRight"), false);
  }
  const f = galleryFixture(); f.click("Show Tomato image 3"); f.crop.images = [f.crop.images[0]];
  assert.ok(f.all().some((n) => n.type === "CropImage" && n.props.alt === "Tomato image 1"));
});
test("carousel motion is scoped, touch arrows are always visible, reduced motion suppresses effects", () => {
  const css = read("styles/imageCarousel.css");
  assert.match(css, /scale\(1\.03\)/); assert.match(css, /300ms/); assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /width:44px; height:44px/); assert.match(css, /top:50%/); assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css, /marketplace-card|farmer-profile-crops/);
  const gallery = read("components/marketplace/CropImageGallery.jsx");
  assert.match(gallery, /h-64/); assert.match(gallery, /sm:h-80/); assert.match(gallery, /object-contain/);
  assert.match(gallery, /aria-hidden="true" className="ag-carousel-previous/);
});
