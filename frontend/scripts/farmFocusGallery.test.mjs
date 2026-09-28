import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { getCropImages } from "../src/utils/cropImages.js";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const elements = (node) => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(elements)];
function fixture(count = 5) {
  const props = { name: "Green Farm", images: Array.from({ length: count }, (_, i) => ({ url: `image-${i + 1}.jpg` })) };
  const { code } = transformSync(read("components/marketplace/FarmFocusGallery.jsx"), { loader: "jsx", format: "cjs", jsx: "automatic" });
  let selected = "";
  const jsx = (type, props) => ({ type, props }); const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "react") return { useState: () => [selected, (value) => { selected = typeof value === "function" ? value(selected) : value; }] };
    if (name.endsWith("cropImages")) return { getCropImages };
    if (name.endsWith("CropImage")) return { __esModule: true, default: "CropImage" };
    if (name.endsWith(".css")) return {};
    throw Error(`Unexpected import ${name}`);
  } });
  const render = () => module.exports.default(props);
  const all = () => elements(render());
  const find = (predicate) => all().find(predicate);
  const slides = () => all().filter((node) => node.props.className?.startsWith("ag-farm-focus-slide"));
  return { props, render, all, find, slides,
    click: (label) => find((node) => node.type === "button" && node.props["aria-label"] === label).props.onClick(),
    active: () => find((node) => node.props["aria-pressed"] === true)?.props["aria-label"],
    key: (key) => { let prevented = false; render().props.onKeyDown({ key, preventDefault() { prevented = true; } }); return prevented; },
  };
}

test("farm focus renders one center and exactly two neighboring previews, with stable image keys", () => {
  const f = fixture(); const slides = f.slides();
  assert.equal(slides.filter((node) => !node.props["aria-hidden"]).length, 3);
  assert.equal(slides.filter((node) => node.props.className.endsWith("is-active")).length, 1);
  assert.equal(slides.filter((node) => node.props.className.endsWith("is-previous")).length, 1);
  assert.equal(slides.filter((node) => node.props.className.endsWith("is-next")).length, 1);
  assert.equal(f.active(), "Focus Green Farm image 1");
  const hidden = slides.filter((node) => node.props["aria-hidden"]);
  assert.ok(hidden.every((slide) => elements(slide).some((node) => node.type === "button" && node.props.disabled && node.props.tabIndex === -1)));
});

test("arrows wrap, previous center moves right, and side clicks bring that image into focus", () => {
  const f = fixture();
  f.click("Previous image"); assert.equal(f.active(), "Focus Green Farm image 5");
  assert.ok(f.slides()[0].props.className.endsWith("is-next"));
  f.click("Next image"); assert.equal(f.active(), "Focus Green Farm image 1");
  f.click("Focus Green Farm image 2"); assert.equal(f.active(), "Focus Green Farm image 2");
  assert.ok(f.slides()[0].props.className.endsWith("is-previous"));
  for (let i = 0; i < 4; i++) f.click("Next image");
  assert.equal(f.active(), "Focus Green Farm image 1");
});

test("two photos appear only once each, as center plus one side", () => {
  const f = fixture(2);
  assert.equal(f.slides().length, 2);
  assert.equal(f.slides().filter((node) => node.props.className.endsWith("is-next")).length, 1);
  assert.equal(f.slides().filter((node) => node.props.className.endsWith("is-previous")).length, 0);
  f.click("Next image"); assert.equal(f.active(), "Focus Green Farm image 2");
  f.click("Next image"); assert.equal(f.active(), "Focus Green Farm image 1");
});

test("single photo is centered without arrows or empty side placeholders; empty data renders nothing", () => {
  const f = fixture(1);
  assert.equal(f.slides().length, 1);
  assert.equal(f.all().filter((node) => node.type === "button").length, 0);
  assert.equal(f.key("ArrowRight"), false);
  assert.equal(fixture(0).render(), null);
});

test("keyboard arrows navigate, controls are labeled, and active image status is announced", () => {
  const f = fixture();
  assert.equal(f.key("ArrowLeft"), true); assert.equal(f.active(), "Focus Green Farm image 5");
  assert.equal(f.key("ArrowRight"), true); assert.equal(f.active(), "Focus Green Farm image 1");
  assert.equal(f.key("Tab"), false);
  assert.ok(f.all().filter((node) => node.type === "button").every((node) => node.props.type === "button"));
  assert.ok(f.find((node) => node.props["aria-live"] === "polite"));
});

test("removed selection safely falls back to first remaining photo and duplicate URLs are not rendered", () => {
  const f = fixture(); f.click("Focus Green Farm image 2");
  f.props.images = [{ url: "remaining.jpg" }, { url: "remaining.jpg" }];
  assert.equal(f.slides().length, 1);
  assert.ok(f.find((node) => node.type === "CropImage" && node.props.src === "remaining.jpg"));
});

test("focus styling covers photos, scopes motion and mobile peeks, and honors reduced motion", () => {
  const css = read("styles/farmFocusGallery.css");
  assert.match(css, /object-fit:cover/); assert.doesNotMatch(css, /object-fit:contain/);
  assert.match(css, /scale\(1\.06\)/); assert.match(css, /scale\(1\.08\)/);
  assert.match(css, /blur\(2px\)/); assert.match(css, /360ms/);
  assert.match(css, /width:44px; height:44px/); assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /max-width:640px/); assert.match(css, /width:76%/); assert.match(css, /overflow:hidden/);
  assert.match(css, /:focus-visible/); assert.match(css, /\.dark \.ag-farm-focus-stage/);
  assert.doesNotMatch(css, /ag-image-carousel|marketplace-card|farmer-profile-crops/);
  const page = read("pages/marketplace/FarmerProfilePage.jsx");
  assert.match(page, /<FarmFocusGallery/); assert.doesNotMatch(page, /CropImageGallery/);
  assert.match(read("pages/marketplace/CropDetailsPage.jsx"), /<CropImageGallery/);
});
