import assert from "node:assert/strict";
import test from "node:test";
import { getCropImages, selectCropImages, MAX_CROP_IMAGE_BYTES } from "../src/utils/cropImages.js";

const file = (name, options = {}) => ({ name, type: "image/jpeg", size: 128, lastModified: 1, ...options });

test("select three images, append more and preserve primary-image order", () => {
  const initial = [file("one.jpg"), file("two.jpg"), file("three.jpg")];
  const first = selectCropImages([], initial);
  assert.equal(first.error, "");
  assert.deepEqual(first.files, initial);
  const next = selectCropImages(first.files, [file("four.png", { type: "image/png" })]);
  assert.equal(next.files.length, 4);
  assert.equal(next.files[0].name, "one.jpg");
  assert.equal(first.files.length, 3); // No mutation of React state.
});

test("same file is not accidentally queued twice", () => {
  const first = file("one.jpg");
  assert.equal(selectCropImages([first], [first]).files.length, 1);
});

test("more than five files rejects the selection without losing previous images", () => {
  const current = [file("original.jpg")];
  const next = selectCropImages(current, Array.from({ length: 5 }, (_, i) => file(`${i}.jpg`)));
  assert.match(next.error, /at most 5/);
  assert.strictEqual(next.files, current);
});

test("unsupported, empty and oversized files are rejected", () => {
  for (const invalid of [file("note.txt", { type: "text/plain" }), file("empty.jpg", { size: 0 }), file("large.jpg", { size: MAX_CROP_IMAGE_BYTES + 1 })]) {
    const current = [file("keep.jpg")];
    const result = selectCropImages(current, [invalid]);
    assert.ok(result.error);
    assert.strictEqual(result.files, current);
  }
  assert.equal(selectCropImages([], [file("limit.png", { type: "image/png", size: MAX_CROP_IMAGE_BYTES })]).error, "");
});

test("removing an accidental selection allows it to be reselected", () => {
  const a = file("one.jpg"), b = file("two.jpg"), c = file("three.jpg");
  const selected = selectCropImages([], [a, b, c]).files;
  const afterRemoval = selected.filter((_, index) => index !== 1);
  assert.deepEqual(afterRemoval, [a, c]);
  assert.deepEqual(selectCropImages(afterRemoval, [b]).files, [a, c, b]);
});

test("old strings and structured single images normalize without private metadata", () => {
  for (const crop of [
    { imageUrl: "https://example.com/one.jpg" },
    { image: "https://example.com/one.jpg" },
    { image: { url: "https://example.com/one.jpg", publicId: "private" } },
    { images: ["https://example.com/one.jpg"] },
  ]) {
    assert.deepEqual(getCropImages(crop), [{ url: "https://example.com/one.jpg" }]);
  }
});

test("all current images stay in order and duplicate legacy URLs are omitted", () => {
  assert.deepEqual(getCropImages({
    images: [{ url: "one", publicId: "secret" }, { url: "two" }, { url: "three" }],
    imageUrl: "one",
  }), [{ url: "one" }, { url: "two" }, { url: "three" }]);
});

test("missing or malformed image entries leave the gallery fallback usable", () => {
  for (const crop of [null, {}, { images: [] }, { images: [null, {}, { url: 12 }, " "] }]) {
    assert.deepEqual(getCropImages(crop), []);
  }
});
