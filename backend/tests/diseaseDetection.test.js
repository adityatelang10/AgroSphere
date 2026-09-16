const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { beforeEach, describe, test } = require("node:test");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const DiseaseScan = require("../src/models/DiseaseScan");
const User = require("../src/models/User");
const aiRoutes = require("../src/routes/aiRoutes");

const classified = () => ({
  status: "CLASSIFIED", modelVersion: "disease-v1", guardVersion: "disease-ood-v1.1",
  predictedClass: "Tomato___Early_blight", crop: "Tomato", condition: "Early Blight",
  isHealthy: false, confidence: 0.594619, supportedClass: true, supportedClassCount: 15,
  supportedCrops: ["Bell Pepper", "Potato", "Tomato"], guidance: "Consult local agricultural expertise.", message: null,
});
const rejected = () => ({
  ...classified(), status: "UNSUPPORTED_IMAGE", predictedClass: null, crop: null, condition: null,
  isHealthy: null, confidence: null, supportedClass: false, guidance: null,
  message: "This image does not appear sufficiently similar to the supported leaf images.",
});
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

describe("Disease rejection contract, authorization and persistence", { concurrency: false }, () => {
  let baseUrl, upstream, upstreamStatus, upstreamCalls, writes, request;
  beforeEach(async (t) => {
    upstream = classified(); upstreamStatus = 200; upstreamCalls = 0; writes = [];
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
    t.after(() => {
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    });
    t.mock.method(User, "findById", async (role) => ({ _id: "64b000000000000000000021", role }));
    // In-memory only: never connect to MongoDB or persist test diagnoses.
    t.mock.method(DiseaseScan, "create", async (record) => { writes.push(record); return { _id: "test-scan" }; });
    const originalFetch = global.fetch;
    t.mock.method(global, "fetch", async (url, options) => {
      if (String(url).endsWith("/predict/disease")) {
        upstreamCalls++;
        if (upstream instanceof Error) throw upstream;
        return new Response(JSON.stringify(upstream), { status: upstreamStatus, headers: { "Content-Type": "application/json" } });
      }
      return originalFetch(url, options);
    });
    const app = express();
    app.use(cookieParser());
    app.use("/api/ai", aiRoutes);
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    request = async ({ role = "FARMER", bytes = pngSignature, mime = "image/png", noFile = false } = {}) => {
      const headers = {};
      if (role) headers.cookie = `token=${jwt.sign({ userId: role }, process.env.JWT_SECRET, { expiresIn: "5m" })}`;
      const body = new FormData();
      if (!noFile) body.append("image", new Blob([bytes], { type: mime }), "sample.png");
      const response = await originalFetch(`${baseUrl}/api/ai/disease-detection`, { method: "POST", headers, body });
      return { status: response.status, body: await response.json() };
    };
  });

  test("moderate-confidence supported classification retains contract and one scan write", async () => {
    const result = await request();
    assert.equal(result.status, 200);
    assert.equal(result.body.status, "CLASSIFIED");
    assert.equal(result.body.confidence, .594619);
    assert.equal(result.body.scanId, "test-scan");
    assert.equal(writes.length, 1);
    assert.equal(writes[0].predictedClass, "Tomato___Early_blight");
  });
  test("unsupported image returns no diagnosis, scan ID or Decision Engine evidence write", async () => {
    upstream = rejected();
    const result = await request();
    assert.equal(result.status, 200);
    assert.equal(result.body.status, "UNSUPPORTED_IMAGE");
    for (const key of ["predictedClass", "crop", "condition", "isHealthy", "confidence", "guidance"]) assert.equal(result.body[key], null);
    assert.equal(result.body.scanId, undefined);
    assert.deepEqual(writes, []);
  });
  test("unexpected upstream treatment fields are not forwarded", async () => {
    upstream = { ...rejected(), treatment: "must not appear", disease: "must not appear" };
    const result = await request();
    assert.equal(result.status, 200);
    assert.equal(result.body.treatment, undefined);
    assert.equal(result.body.disease, undefined);
  });
  for (const [name, change] of [
    ["rejection with disease label", { ...rejected(), predictedClass: "Tomato___Early_blight" }],
    ["rejection with treatment", { ...rejected(), guidance: "treat disease" }],
    ["old unguarded service response", { ...classified(), status: "ok", guardVersion: undefined }],
    ["missing guard version", { ...classified(), guardVersion: undefined }],
    ["old guard version", { ...classified(), guardVersion: "disease-ood-v1" }],
    ["unknown analysis status", { ...classified(), status: "UNKNOWN" }],
    ["null classified confidence", { ...classified(), confidence: null }],
    ["out of range confidence", { ...classified(), confidence: 1.1 }],
    ["invalid supported scope", { ...classified(), supportedCrops: [] }],
  ]) {
    test(`${name} fails closed without persistence`, async () => {
      upstream = change;
      const result = await request();
      assert.equal(result.status, 502);
      assert.deepEqual(writes, []);
    });
  }
  test("anonymous upload is 401 before inference", async () => {
    assert.equal((await request({ role: null })).status, 401);
    assert.equal(upstreamCalls, 0);
  });
  test("customer upload is 403 before inference", async () => {
    assert.equal((await request({ role: "CUSTOMER" })).status, 403);
    assert.equal(upstreamCalls, 0);
  });
  test("missing image remains 400", async () => {
    assert.equal((await request({ noFile: true })).status, 400);
    assert.equal(upstreamCalls, 0);
  });
  test("unsupported MIME remains 400", async () => {
    assert.equal((await request({ mime: "text/plain" })).status, 400);
    assert.equal(upstreamCalls, 0);
  });
  test("fake image signature remains 400", async () => {
    assert.equal((await request({ bytes: Buffer.from("not an image at all") })).status, 400);
    assert.equal(upstreamCalls, 0);
  });
  test("declared MIME mismatch remains 400", async () => {
    assert.equal((await request({ mime: "image/jpeg" })).status, 400);
    assert.equal(upstreamCalls, 0);
  });
  test("5 MB limit remains enforced before inference", async () => {
    assert.equal((await request({ bytes: Buffer.alloc(5 * 1024 * 1024 + 1) })).status, 413);
    assert.equal(upstreamCalls, 0);
  });
  test("corrupt decode upstream error is safe 400 without persistence", async () => {
    upstream = { detail: "The uploaded file is corrupted or is not a decodable image." }; upstreamStatus = 400;
    assert.equal((await request()).status, 400);
    assert.deepEqual(writes, []);
  });
  test("missing/corrupt guard upstream is friendly 503 without persistence", async () => {
    upstream = { detail: "Disease detection model is unavailable" }; upstreamStatus = 503;
    const result = await request();
    assert.equal(result.status, 503);
    assert.equal(result.body.message, "Disease detection service is currently unavailable");
    assert.deepEqual(writes, []);
  });
  test("offline FastAPI is friendly 503 without persistence", async () => {
    upstream = new Error("connection refused");
    assert.equal((await request()).status, 503);
    assert.deepEqual(writes, []);
  });
});
