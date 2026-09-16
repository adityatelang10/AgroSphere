import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/farmer/DiseaseDetectionPage.jsx", import.meta.url), "utf8");
const rejection = source.split('{result?.status === "UNSUPPORTED_IMAGE" ? (')[1]?.split(") : null}")[0];

test("rejected result has a separate accessible panel with no diagnosis/confidence/treatment", () => {
  assert.ok(rejection);
  assert.match(rejection, /role="status"/);
  assert.match(rejection, /Unable to analyze this image/);
  assert.match(rejection, /\{result.message\}/);
  assert.match(rejection, /No diagnosis was saved/);
  assert.doesNotMatch(rejection, /result\.(condition|crop|confidence|guidance|predictedClass|isHealthy)|Model confidence|Cautious next step/);
});
test("only explicit classified status renders the unchanged diagnosis fields", () => {
  const classification = source.split('{result?.status === "CLASSIFIED" ? (')[1];
  assert.ok(classification);
  for (const field of ["crop", "condition", "confidence", "guidance", "modelVersion", "supportedCrops"]) assert.ok(classification.includes(`result.${field}`));
  assert.doesNotMatch(source, /\{result \? \(/);
});
test("pre-upload helper and guard limitations are visible", () => {
  assert.match(source, /Supported: Bell Pepper, Potato and Tomato leaf photos/);
  assert.match(source, /unsupported plants or symptoms can still pass it and be misclassified/);
});
test("upload size/types, unavailable feedback and Node-only route remain intact", () => {
  assert.match(source, /5 \* 1024 \* 1024/);
  assert.match(source, /image\/jpeg.*image\/png.*image\/webp/);
  assert.match(source, /Disease detection service is currently unavailable/);
  const api = readFileSync(new URL("../src/services/diseaseDetectionService.js", import.meta.url), "utf8");
  assert.match(api, /\/api\/ai\/disease-detection/);
  assert.doesNotMatch(api, /8000|\/predict\/disease/);
});
