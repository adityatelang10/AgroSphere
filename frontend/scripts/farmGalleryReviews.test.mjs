import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { transformSync } from "esbuild";
import { MAX_FARM_IMAGE_BYTES, selectFarmImages } from "../src/utils/farmGallery.js";

const file = (name, options = {}) => ({ name, size: 100, type: "image/jpeg", lastModified: 1, ...options });
const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const elements = (node) => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(elements)];

function reviewFixture(existing = null, request = async (values) => ({ review: { _id: "saved-review", ...values, verifiedPurchase: true } })) {
  const { code } = transformSync(read("components/marketplace/OrderItemReview.jsx"), { loader: "jsx", format: "cjs", jsx: "automatic" });
  const slots = [], calls = [], saved = [];
  let cursor = 0;
  const props = { orderId: "my-delivered-order", crop: { _id: "tomato", name: "Tomato" }, review: existing,
    onSaved: (review) => { saved.push(review); props.review = review; },
  };
  const module = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name === "react") return {
      useId: () => "review-inputs",
      useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    };
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name.endsWith("reviewService")) return {
      createReview: async (values) => { calls.push({ method: "create", ...values }); return request(values); },
      updateReview: async (id, values) => { calls.push({ method: "edit", id, ...values }); return request({ _id: id, ...values }); },
    };
    if (name.endsWith("RatingSummary")) return { RatingStars: "RatingStars" };
    throw Error(`Unexpected import: ${name}`);
  } });
  const render = () => { cursor = 0; return module.exports.default(props); };
  const find = (predicate) => elements(render()).find(predicate);
  const click = (text) => find((node) => node.type === "button" && node.props.children === text).props.onClick();
  return { render, find, click, calls, saved,
    rate: (rating) => find((node) => node.type === "input" && node.props.value === rating).props.onChange(),
    comment: (value) => find((node) => node.type === "textarea").props.onChange({ target: { value } }),
    submit: () => find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }),
  };
}

test("gallery selection respects eight including stored photos without changing crop helper limits", () => {
  const chosen = [file("first.jpg")];
  assert.equal(selectFarmImages(chosen, [file("second.jpg")], 6).files.length, 2);
  const rejected = selectFarmImages(chosen, [file("second.jpg")], 7);
  assert.match(rejected.error, /at most 8/); assert.strictEqual(rejected.files, chosen);
  assert.match(read("utils/cropImages.js"), /MAX_CROP_IMAGES = 5/);
});
test("gallery rejects unsupported/empty/oversized files, allows five MB and deduplicates", () => {
  for (const invalid of [file("bad.txt", { type: "text/plain" }), file("empty.jpg", { size: 0 }), file("large.jpg", { size: MAX_FARM_IMAGE_BYTES + 1 })]) {
    assert.ok(selectFarmImages([], [invalid], 0).error);
  }
  const valid = file("valid.webp", { type: "image/webp", size: MAX_FARM_IMAGE_BYTES });
  assert.equal(selectFarmImages([valid], [valid], 0).files.length, 1);
});
test("review stars are native keyboard-accessible radios, and comment is bounded plain text", () => {
  const f = reviewFixture(); f.click("Write a Review");
  const radios = elements(f.render()).filter((node) => node.type === "input");
  assert.deepEqual(radios.map((node) => node.props.type), Array(5).fill("radio"));
  assert.deepEqual(radios.map((node) => node.props["aria-label"]), ["1 star", "2 stars", "3 stars", "4 stars", "5 stars"]);
  assert.equal(new Set(radios.map((node) => node.props.name)).size, 1);
  assert.equal(f.find((node) => node.type === "textarea").props.maxLength, 1000);
  assert.match(read("components/marketplace/OrderItemReview.jsx"), /peer-focus-visible:ring/);
});
test("new review submits purchase references once and immediately switches to Edit Review", async () => {
  const f = reviewFixture(); f.click("Write a Review"); f.rate(5); f.comment("  Very fresh  ");
  await f.submit();
  assert.deepEqual(f.calls, [{ method: "create", orderId: "my-delivered-order", cropId: "tomato", rating: 5, comment: "Very fresh" }]);
  assert.equal(f.saved.length, 1);
  assert.ok(f.find((node) => node.type === "button" && node.props.children === "Edit Review"));
  assert.match(f.find((node) => node.props?.role === "status").props.children, /now public/);
});
test("an in-flight save cannot submit twice", async () => {
  let finish;
  const f = reviewFixture(null, (values) => new Promise((resolve) => { finish = () => resolve({ review: { _id: "saved", ...values } }); }));
  f.click("Write a Review"); f.rate(4);
  const first = f.submit(); await f.submit();
  assert.equal(f.calls.length, 1);
  assert.equal(f.find((node) => node.props?.type === "submit").props.disabled, true);
  finish(); await first;
});
test("editing sends only rating/comment for the existing review", async () => {
  const f = reviewFixture({ _id: "my-review", rating: 4, comment: "Good", verifiedPurchase: true });
  f.click("Edit Review");
  assert.equal(f.find((node) => node.type === "textarea").props.value, "Good");
  f.rate(3); f.comment("Updated"); await f.submit();
  assert.deepEqual(f.calls, [{ method: "edit", id: "my-review", rating: 3, comment: "Updated" }]);
  assert.match(f.find((node) => node.props?.role === "status").props.children, /updated/);
});
test("review error retains draft and permits correction; cancel performs no write", async () => {
  const f = reviewFixture(null, async () => { throw Error("Only delivered purchases can be reviewed"); });
  f.click("Write a Review"); f.rate(2); f.comment("Keep this draft"); await f.submit();
  assert.match(f.find((node) => node.props?.role === "alert").props.children, /delivered/);
  assert.equal(f.find((node) => node.type === "textarea").props.value, "Keep this draft");
  f.click("Cancel"); assert.equal(f.calls.length, 1);
  assert.equal(f.find((node) => node.type === "form"), undefined);
});
test("zero stars prevents submission, and orders offer review controls only for Delivered items", async () => {
  const f = reviewFixture(); f.click("Write a Review"); await f.submit();
  assert.equal(f.calls.length, 0);
  assert.match(read("pages/customer/OrdersPage.jsx"), /order.status === "Delivered" && item.crop\?\._id/);
  assert.match(read("pages/customer/OrdersPage.jsx"), /review.orderId === order._id && review.cropId === item.crop._id/);
});
test("farm gallery uses responsive preview grid, revokes local URLs, and remains farmer-only", () => {
  const manager = read("components/profile/FarmGalleryManager.jsx");
  assert.match(manager, /grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4/);
  assert.match(manager, /URL.revokeObjectURL/);
  assert.match(manager, /Remove selection/);
  assert.match(read("pages/profile/ProfilePage.jsx"), /isFarmer && farmerProfile/);
  assert.match(read("pages/marketplace/FarmerProfilePage.jsx"), /getPublicFarmerProfile\(id\)/);
  assert.doesNotMatch(read("pages/marketplace/FarmerProfilePage.jsx"), /FarmGalleryManager|removeFarmGalleryImage/);
});
