import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { transformSync } from "esbuild";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const elements = (node) => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(elements)];

function fixture(savedBio = "Existing farm bio", request = async (bio) => ({ bio })) {
  const { code } = transformSync(read("components/profile/FarmerBioEditor.jsx"), { loader: "jsx", format: "cjs", jsx: "automatic" });
  const slots = [], calls = [], saved = [];
  let cursor = 0;
  const props = { savedBio, onSaved: (bio) => { saved.push(bio); props.savedBio = bio; } };
  const module = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name === "react") return {
      useId: () => "farm-bio",
      useEffect() {},
      useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    };
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name.endsWith("farmerProfileService")) return { updateFarmerBio: async (bio) => { calls.push(bio); return request(bio); } };
    throw Error(`Unexpected import: ${name}`);
  } });
  const render = () => { cursor = 0; return module.exports.default(props); };
  const find = (predicate) => elements(render()).find(predicate);
  return { calls, saved, find, render,
    change: (value) => find((node) => node.type === "textarea").props.onChange({ target: { value } }),
    submit: () => find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }),
  };
}

test("bio prefills stored text, labels textarea, counts remaining characters and limits input", () => {
  const f = fixture("Existing bio");
  const input = f.find((node) => node.type === "textarea");
  assert.equal(input.props.value, "Existing bio"); assert.equal(input.props.maxLength, 500);
  assert.equal(input.props.id, f.find((node) => node.type === "label").props.htmlFor);
  assert.equal(f.find((node) => node.props?.id === "farm-bio-count").props.children, "488 characters remaining");
  assert.equal(f.find((node) => node.type === "button").props.disabled, true);
  f.change("New bio");
  assert.equal(f.find((node) => node.props?.id === "farm-bio-count").props.children, "493 characters remaining");
  assert.equal(f.find((node) => node.type === "button").props.disabled, false);
});
test("saving trims text, updates parent state and shows feedback without a reload", async () => {
  const f = fixture(); f.change("  Growing seasonal vegetables.  "); await f.submit();
  assert.deepEqual(f.calls, ["Growing seasonal vegetables."]); assert.deepEqual(f.saved, f.calls);
  assert.equal(f.find((node) => node.type === "textarea").props.value, f.saved[0]);
  assert.match(f.find((node) => node.props?.role === "status").props.children, /Bio saved/);
  assert.equal(f.find((node) => node.type === "button").props.disabled, true);
});
test("clearing a saved bio submits empty text for the public fallback", async () => {
  const f = fixture(); f.change(" \n "); await f.submit();
  assert.deepEqual(f.calls, [""]);
  assert.match(read("pages/marketplace/FarmerProfilePage.jsx"), /farmer.bio \|\| "This farmer has not added a detailed profile bio yet\."/);
});
test("overlong or legacy bio is not silently truncated and cannot be saved until shortened", async () => {
  const f = fixture("x".repeat(501));
  assert.equal(f.find((node) => node.type === "textarea").props.value.length, 501);
  assert.equal(f.find((node) => node.type === "button").props.disabled, true);
  assert.match(f.find((node) => node.props?.id === "farm-bio-count").props.children, /Shorten by 1/);
  await f.submit(); assert.equal(f.calls.length, 0);
  f.change("x".repeat(500)); await f.submit(); assert.equal(f.calls[0].length, 500);
});
test("same-tick double submit saves once and disables controls while pending", async () => {
  let finish;
  const f = fixture("", (bio) => new Promise((resolve) => { finish = () => resolve({ bio }); }));
  f.change("My farm"); const first = f.submit(); await f.submit();
  assert.equal(f.calls.length, 1);
  assert.equal(f.find((node) => node.type === "textarea").props.disabled, true);
  assert.equal(f.find((node) => node.type === "button").props.disabled, true);
  finish(); await first;
});
test("failed save retains draft for correction or a later deliberate retry", async () => {
  const f = fixture("", async () => { throw Error("Service unavailable"); });
  f.change("Keep my draft"); await f.submit();
  assert.equal(f.find((node) => node.type === "textarea").props.value, "Keep my draft");
  assert.equal(f.find((node) => node.props?.role === "alert").props.children, "Service unavailable");
  assert.equal(f.find((node) => node.type === "button").props.disabled, false);
  assert.equal(f.saved.length, 0);
});
test("profile integrates editor without replacing gallery or overwriting other profile fields", () => {
  const page = read("pages/profile/ProfilePage.jsx");
  assert.match(page, /savedBio=\{farmerProfile.bio \|\| ""\}/);
  assert.match(page, /setFarmerProfile\(\(profile\) => \(\{ \.\.\.profile, bio \}\)\)/);
  assert.match(page, /<FarmGalleryManager profile=\{farmerProfile\}/);
  assert.match(read("services/farmerProfileService.js"), /"\/api\/farmer\/profile", \{ method: "PATCH", body: \{ bio \} \}/);
});
test("compact profile crop grid is page-specific, with shorter images, bounded text and more columns", () => {
  const page = read("pages/marketplace/FarmerProfilePage.jsx");
  assert.match(page, /farmer-profile-crops grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5/);
  assert.match(page, /h-\[170px\] shrink-0 overflow-hidden rounded-xl/);
  assert.match(page, /p-2\.5 shadow-sm.*sm:p-3/);
  assert.match(page, /line-clamp-2 break-words font-display text-base/);
  assert.match(page, /<RatingSummary averageRating=\{crop.averageRating\}/);
  assert.match(page, /min-h-8/);
  assert.match(read("components/marketplace/MarketplaceCropCard.jsx"), /marketplace-card-image block h-40/);
});
