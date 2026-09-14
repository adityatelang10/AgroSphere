import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Add Crop labels the unchanged organic checkbox as a farmer declaration", () => {
  const source = readSource("../src/pages/farmer/AddCropPage.jsx");
  assert.match(source, /name="isOrganic"/);
  assert.match(source, /checked=\{formState.isOrganic\}/);
  assert.match(source, /I declare this crop as organic/);
  assert.match(source, /AgroSphere does not verify organic certification/);
  assert.doesNotMatch(source, /certified organic/i);
});

test("marketplace organic badge and filter make farmer provenance visible", () => {
  const card = readSource("../src/components/marketplace/MarketplaceCropCard.jsx");
  const page = readSource("../src/pages/marketplace/MarketplacePage.jsx");
  assert.match(card, /crop.isOrganic \?/);
  assert.match(card, /Organic\s*<span[^>]+>Farmer-declared<\/span>/);
  assert.match(page, /Farmer-declared organic only/);
  assert.match(page, /isOrganic: event.target.checked \? "true" : ""/);
  assert.doesNotMatch(card + page, /certified organic/i);
});

test("Crop Advisor retains model confidence and its crop-success caveat", () => {
  const source = readSource("../src/pages/farmer/CropRecommendationPage.jsx");
  assert.match(source, /method="Random Forest"/);
  assert.match(source, /Model confidence/);
  assert.match(source, /Model confidence is not a guaranteed chance of crop success or yield/);
  assert.match(source, /\{result.modelVersion\}/);
  assert.doesNotMatch(source, /held-out.*test accuracy/i);
});

test("public QR page keeps its farmer-provided, non-certification disclaimer", () => {
  const page = readSource("../src/pages/traceability/PublicTraceabilityPage.jsx");
  const service = readSource("../../backend/src/services/traceabilityService.js");
  assert.match(page, /\{record.disclaimer\}/);
  assert.match(service, /farmer-provided listing information/);
  assert.match(service, /not a certification of quality, origin, or farming practices/);
});
