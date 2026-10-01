const assert = require("node:assert/strict");
const { test } = require("node:test");
const { assertDemoTarget, assertConnectedDemo, demoPassword } = require("../scripts/seedDemoData");

test("demo seed refuses original, remote and incorrectly named databases", () => {
  for (const uri of [undefined, "mongodb://127.0.0.1:27017/agrosphere", "mongodb://remote.example/agrosphere_demo",
    "mongodb://127.0.0.1:27018/agrosphere_demo", "mongodb://127.0.0.1/agrosphere_demo_extra", "mongodb+srv://example/agrosphere_demo"]) {
    assert.throws(() => assertDemoTarget(uri));
  }
  assert.doesNotThrow(() => assertDemoTarget("mongodb://127.0.0.1:27017/agrosphere_demo"));
  assert.doesNotThrow(() => assertDemoTarget("mongodb://localhost:27017/agrosphere_demo"));
});

test("actual connected database is checked independently before any clearing", () => {
  assert.throws(() => assertConnectedDemo({ name: "agrosphere", db: { databaseName: "agrosphere" } }));
  assert.throws(() => assertConnectedDemo({ name: "agrosphere_demo", db: { databaseName: "agrosphere" } }));
  assert.doesNotThrow(() => assertConnectedDemo({ name: "agrosphere_demo", db: { databaseName: "agrosphere_demo" } }));
});

test("generated passwords meet registration rules without embedded default credentials", () => {
  const first = demoPassword(), second = demoPassword();
  assert.notEqual(first, second);
  assert.ok(Buffer.byteLength(first) <= 72 && /[A-Z]/.test(first) && /[0-9]/.test(first));
  assert.throws(() => demoPassword("short"));
  assert.throws(() => demoPassword("A1" + "é".repeat(36)));
});
