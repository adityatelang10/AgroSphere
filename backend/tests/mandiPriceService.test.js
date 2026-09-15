const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const {
  CACHE_TTL_MS, MAX_CACHE_ENTRIES, MAX_RECORDS, PAGE_SIZE,
  createMandiPriceService, getFreshness, normalizeQuery, normalizeRecord, parseReportedDate,
} = require("../src/services/mandiPriceService");

// Synthetic provider fixtures, not live evidence. No real credentials or database writes.
const TEST_KEY = "synthetic-mandi-test-credential";
const NOW = new Date("2026-09-14T10:00:00Z");
const row = (overrides = {}) => ({
  state: "Karnataka", district: "Bengaluru South", market: "Ramanagara APMC",
  commodity: "Tomato", variety: "Tomato", grade: "Local", arrival_date: "14/09/2026",
  min_price: 1000, modal_price: 1600, max_price: 2000, ...overrides,
});
const payload = (records = [row()], overrides = {}) => ({
  status: "ok", records, total: records.length, count: records.length, limit: PAGE_SIZE, offset: 0, ...overrides,
});
const response = (body, status = 200) => ({
  ok: status === 200, status, headers: new Headers({ "content-type": "application/json" }), json: async () => body,
});
const service = (options = {}) => createMandiPriceService({
  getApiKey: () => TEST_KEY, now: () => NOW,
  fetchImplementation: async () => response(payload()), ...options,
});
const lookup = (instance, query = { state: "Karnataka" }) => instance.getLatestMandiPrices(query);

test("missing key returns safe 503 before any provider call", async () => {
  let calls = 0;
  await assert.rejects(lookup(service({ getApiKey: () => " ", fetchImplementation: () => { calls++; } })),
    { code: "MANDI_NOT_CONFIGURED", statusCode: 503, message: "Current mandi price service is not configured." });
  assert.equal(calls, 0);
});

test("valid provider record normalizes exact prices, optional identity and provenance", async () => {
  const result = await lookup(service());
  assert.deepEqual(result.records[0], {
    state: "Karnataka", district: "Bengaluru South", market: "Ramanagara APMC", commodity: "Tomato",
    variety: "Tomato", grade: "Local", reportedDate: "2026-09-14", reportedDateRaw: "14/09/2026",
    minPrice: 1000, modalPrice: 1600, maxPrice: 2000, priceUnit: "INR_PER_QUINTAL",
    freshness: { ageDays: 0, status: "TODAY" },
  });
  assert.equal(result.status, "OK");
  assert.equal(result.source.provider, "data.gov.in");
  assert.equal(result.source.cached, false);
  assert.equal(JSON.stringify(result).includes(TEST_KEY), false);
});

test("strict DD/MM/YYYY parsing validates real dates and leap years", () => {
  assert.equal(parseReportedDate("14/09/2026"), "2026-09-14");
  assert.equal(parseReportedDate("03/04/2026"), "2026-04-03");
  assert.equal(parseReportedDate("29/02/2024"), "2024-02-29");
  for (const date of ["29/02/2026", "31/04/2026", "00/09/2026", "01/13/2026", "1/09/2026", "2026-09-14", "14/09/2026 ", null]) {
    assert.equal(parseReportedDate(date), null);
  }
});

test("freshness uses Indian calendar midnight, not UTC midnight", () => {
  assert.deepEqual(getFreshness("2026-09-14", new Date("2026-09-14T18:29:59Z")), { ageDays: 0, status: "TODAY" });
  assert.deepEqual(getFreshness("2026-09-14", new Date("2026-09-14T18:30:00Z")), { ageDays: 1, status: "RECENT" });
});

test("freshness display thresholds include recent, older, stale and future", () => {
  for (const [date, ageDays, status] of [
    ["2026-09-14", 0, "TODAY"], ["2026-09-12", 2, "RECENT"], ["2026-09-11", 3, "OLDER"],
    ["2026-09-07", 7, "OLDER"], ["2026-09-06", 8, "STALE"], ["2026-09-15", -1, "FUTURE"],
  ]) assert.deepEqual(getFreshness(date, NOW), { ageDays, status });
});

test("future and invalid dated records are excluded", () => {
  for (const date of ["15/09/2026", "30/02/2026", "", null]) assert.equal(normalizeRecord(row({ arrival_date: date }), NOW), null);
});

for (const [name, value] of [
  ["blank", ""], ["whitespace", " "], ["null", null], ["missing", undefined], ["zero", 0], ["string zero", "0"],
  ["non-numeric", "bad"], ["NaN", NaN], ["Infinity", Infinity], ["negative", -1], ["boolean", true],
  ["array", [5]], ["object", {}], ["hex string", "0x100"],
]) {
  test(`prices reject ${name} without converting missing to zero`, () => {
    for (const field of ["min_price", "modal_price", "max_price"]) assert.equal(normalizeRecord(row({ [field]: value }), NOW), null);
  });
}

test("min above modal or modal above max rejected; inclusive equality retained", () => {
  assert.equal(normalizeRecord(row({ min_price: 1700 }), NOW), null);
  assert.equal(normalizeRecord(row({ modal_price: 2500 }), NOW), null);
  assert.ok(normalizeRecord(row({ min_price: "1600", modal_price: "1600", max_price: "1600" }), NOW));
});

test("missing variety and grade remain null without fabricated defaults", () => {
  const result = normalizeRecord(row({ variety: undefined, grade: " " }), NOW);
  assert.equal(result.variety, null);
  assert.equal(result.grade, null);
});

test("required identity strings must be usable", () => {
  for (const field of ["state", "district", "market", "commodity"]) {
    for (const value of [null, "", " ", [], 123]) assert.equal(normalizeRecord(row({ [field]: value }), NOW), null);
  }
});

test("one malformed record does not remove valid records and is counted", async () => {
  const result = await lookup(service({ fetchImplementation: async () => response(payload([null, row(), row({ min_price: null })])) }));
  assert.equal(result.validRecordCount, 1);
  assert.equal(result.invalidRecordCount, 2);
});

test("exact duplicates removed, distinct varieties and grades retained", async () => {
  const records = [row(), row(), row({ variety: "Other" }), row({ grade: "FAQ" })];
  const result = await lookup(service({ fetchImplementation: async () => response(payload(records)) }));
  assert.equal(result.validRecordCount, 3);
  assert.equal(result.duplicateRecordCount, 1);
});

test("zero provider records returns successful NO_REPORT", async () => {
  const result = await lookup(service({ fetchImplementation: async () => response(payload([])) }));
  assert.equal(result.success, true);
  assert.equal(result.status, "NO_REPORT");
  assert.deepEqual(result.records, []);
});

test("all invalid provider rows are distinct from no matching provider reports", async () => {
  const result = await lookup(service({ fetchImplementation: async () => response(payload([row({ min_price: 0 })])) }));
  assert.equal(result.status, "NO_VALID_REPORTS");
  assert.equal(result.invalidRecordCount, 1);
});

test("requires state and rejects arrays, objects and wildcard queries", () => {
  for (const state of [undefined, null, "", " ", [], {}, "*", "a?", "x".repeat(121), "x\ny"]) {
    assert.throws(() => normalizeQuery({ state }), { statusCode: 400 });
  }
  assert.throws(() => normalizeQuery({ state: "Karnataka", district: ["Bidar"] }), { statusCode: 400 });
  assert.deepEqual(normalizeQuery({ state: " Karnataka ", commodity: "Soyabean" }), { state: "Karnataka", commodity: "Soyabean" });
});

test("safe URL construction preserves all filter values and encodes punctuation", async () => {
  const query = { state: "Karnataka", district: "Bengaluru South", market: "Test & Market", commodity: "Bengal Gram(Gram)(Whole)" };
  await lookup(service({ fetchImplementation: async (url, options) => {
    assert.equal(url.origin, "https://api.data.gov.in");
    assert.equal(url.searchParams.get("api-key"), TEST_KEY);
    for (const [field, value] of Object.entries(query)) assert.equal(url.searchParams.get(`filters[${field}]`), value);
    assert.equal(options.redirect, "error");
    return response(payload([row(query)]));
  } }), query);
});

test("wrong state or optional-filter rows do not escape the requested selection", async () => {
  const result = await lookup(service({ fetchImplementation: async () => response(payload([row(), row({ state: "Other State" })])) }),
    { state: "Karnataka", commodity: "Maize" });
  assert.equal(result.validRecordCount, 0);
  assert.equal(result.invalidRecordCount, 2);
});

for (const status of [400, 401, 403, 429, 500, 503]) {
  test(`HTTP ${status} failure is safe and not cached`, async () => {
    let calls = 0;
    const instance = service({ fetchImplementation: async () => { calls++; return response({ error: TEST_KEY }, status); } });
    for (let i = 0; i < 2; i++) await assert.rejects(lookup(instance), (error) => {
      assert.equal(error.statusCode, 503);
      assert.equal(error.message.includes(TEST_KEY), false);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(calls, 2);
  });
}

test("provider exceptions never leak a key-bearing URL or cause", async () => {
  await assert.rejects(lookup(service({ fetchImplementation: async (url) => { throw new Error(String(url)); } })), (error) => {
    assert.equal(String(error.stack).includes(TEST_KEY), false);
    assert.equal(JSON.stringify(error).includes("api-key"), false);
    assert.equal(error.cause, undefined);
    return true;
  });
});

test("provider authorization error carried in HTTP 200 stays an error", async () => {
  await assert.rejects(lookup(service({ fetchImplementation: async () => response({ error: `Invalid API key ${TEST_KEY}` }) })),
    { code: "MANDI_PROVIDER_AUTH" });
});

test("timeout bounds both network wait and body decoding and is not cached", async () => {
  for (const fetchImplementation of [
    async () => new Promise(() => {}),
    async () => ({ ...response({}), json: () => new Promise(() => {}) }),
  ]) {
    const cache = new Map();
    await assert.rejects(lookup(service({ fetchImplementation, timeoutMs: 10, cache })), { code: "MANDI_TIMEOUT", statusCode: 504 });
    assert.equal(cache.size, 0);
  }
});

test("malformed JSON, content type and pagination schema are safe and uncached", async () => {
  for (const malformed of [
    { ...response({}), json: async () => { throw new Error(TEST_KEY); } },
    { ...response(payload()), headers: new Headers({ "content-type": "text/html" }) },
    response({}), response(payload([], { records: null })), response(payload([], { total: "bad" })),
    response(payload([row()], { count: 2 })), response(payload([row()], { offset: 1 })),
    response(payload([], { total: 2 })), response(payload([row()], { limit: 0 })),
  ]) {
    const cache = new Map();
    await assert.rejects(lookup(service({ cache, fetchImplementation: async () => malformed })), { code: "MANDI_INVALID_RESPONSE", statusCode: 502 });
    assert.equal(cache.size, 0);
  }
});

test("pagination accepts numeric strings and collects all pages using actual counts", async () => {
  const offsets = [];
  const result = await lookup(service({ fetchImplementation: async (url) => {
    const offset = Number(url.searchParams.get("offset")); offsets.push(offset);
    return response(payload([row({ variety: `Variety ${offset}` })], { total: "3", count: "1", offset: String(offset), limit: "100" }));
  } }));
  assert.deepEqual(offsets, [0, 1, 2]);
  assert.equal(result.validRecordCount, 3);
  assert.equal(result.truncated, false);
});

test("defensive record/page cap prevents unbounded collection", async () => {
  let calls = 0;
  const result = await lookup(service({ fetchImplementation: async (url) => {
    calls++;
    const offset = Number(url.searchParams.get("offset"));
    return response(payload(Array.from({ length: PAGE_SIZE }, (_, index) => row({ variety: `Variety ${offset + index}` })), { total: 2500, offset }));
  } }));
  assert.equal(calls, 20);
  assert.equal(result.validRecordCount, MAX_RECORDS);
  assert.equal(result.truncated, true);
});

test("repeated pages flag truncation instead of claiming a complete result", async () => {
  const result = await lookup(service({ fetchImplementation: async (url) => response(payload([row()],
    { offset: Number(url.searchParams.get("offset")), total: 3 })) }));
  assert.equal(result.validRecordCount, 1);
  assert.equal(result.truncated, true);
});

test("changing snapshot totals fail safely without caching partial data", async () => {
  const cache = new Map();
  await assert.rejects(lookup(service({ cache, fetchImplementation: async (url) => {
    const offset = Number(url.searchParams.get("offset"));
    return response(payload([row()], { offset, total: offset === 0 ? 2 : 3 }));
  } })), { code: "MANDI_INVALID_RESPONSE" });
  assert.equal(cache.size, 0);
});

test("cache hit avoids fetch, expires at 30 minutes and protects cached data from caller mutation", async () => {
  let time = NOW.getTime(); let calls = 0;
  const instance = service({ now: () => new Date(time), fetchImplementation: async () => { calls++; return response(payload()); } });
  const first = await lookup(instance); first.records.length = 0;
  const second = await lookup(instance, { state: " Karnataka " });
  assert.equal(second.records.length, 1);
  assert.equal(second.source.cached, true);
  assert.equal(calls, 1);
  time += CACHE_TTL_MS;
  assert.equal((await lookup(instance)).source.cached, false);
  assert.equal(calls, 2);
});

test("cache key isolates states and optional filter selections", async () => {
  let calls = 0;
  const instance = service({ fetchImplementation: async () => { calls++; return response(payload([])); } });
  for (const query of [{ state: "Karnataka" }, { state: "Maharashtra" }, { state: "Karnataka", district: "Bidar" },
    { state: "Karnataka", market: "Test" }, { state: "Karnataka", commodity: "Tomato" }]) await lookup(instance, query);
  assert.equal(calls, 5);
});

test("cache is bounded and no-report snapshots can be cached", async () => {
  const cache = new Map();
  const instance = service({ cache, fetchImplementation: async () => response(payload([])) });
  for (let i = 0; i < MAX_CACHE_ENTRIES + 3; i++) await lookup(instance, { state: `State ${i}` });
  assert.equal(cache.size, MAX_CACHE_ENTRIES);
  assert.equal((await lookup(instance, { state: `State ${MAX_CACHE_ENTRIES + 2}` })).source.cached, true);
});

test("cached freshness is recalculated across Indian midnight", async () => {
  let time = new Date("2026-09-14T18:29:00Z");
  const instance = service({ now: () => time });
  assert.equal((await lookup(instance)).records[0].freshness.status, "TODAY");
  time = new Date("2026-09-14T18:31:00Z");
  const result = await lookup(instance);
  assert.equal(result.source.cached, true);
  assert.deepEqual(result.records[0].freshness, { ageDays: 1, status: "RECENT" });
});

test("concurrent identical lookups share one provider request", async () => {
  let calls = 0;
  const instance = service({ fetchImplementation: async () => { calls++; return response(payload()); } });
  await Promise.all([lookup(instance), lookup(instance), lookup(instance)]);
  assert.equal(calls, 1);
});

test("actual Express route enforces cookie auth: anonymous 401, CUSTOMER 403, FARMER 200", async (t) => {
  const express = require("express");
  const cookieParser = require("cookie-parser");
  const jwt = require("jsonwebtoken");
  const User = require("../src/models/User");
  const originalFetch = global.fetch;
  const previousKey = process.env.DATA_GOV_API_KEY;
  const previousJwt = process.env.JWT_SECRET;
  process.env.DATA_GOV_API_KEY = TEST_KEY;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
  t.after(() => {
    if (previousKey === undefined) delete process.env.DATA_GOV_API_KEY; else process.env.DATA_GOV_API_KEY = previousKey;
    if (previousJwt === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousJwt;
  });
  let calls = 0;
  t.mock.method(global, "fetch", async () => { calls++; return response(payload()); });
  t.mock.method(User, "findById", async (id) => ({ _id: id, role: id === "farmer-test" ? "FARMER" : "CUSTOMER" }));
  const app = express();
  app.use(cookieParser());
  app.use("/api/market", require("../src/routes/mandiPriceRoutes"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/market/mandi/latest?state=Karnataka`;
  for (const [userId, status] of [[null, 401], ["customer-test", 403], ["farmer-test", 200]]) {
    const headers = userId ? { cookie: `token=${jwt.sign({ userId }, process.env.JWT_SECRET)}` } : {};
    const result = await originalFetch(endpoint, { headers });
    assert.equal(result.status, status);
    const body = await result.json();
    assert.equal(JSON.stringify(body).includes(TEST_KEY), false);
    if (status === 200) assert.equal(body.records.length, 1);
  }
  assert.equal(calls, 1);
  delete process.env.DATA_GOV_API_KEY;
  const result = await originalFetch(endpoint, { headers: { cookie: `token=${jwt.sign({ userId: "farmer-test" }, process.env.JWT_SECRET)}` } });
  assert.equal(result.status, 503);
  assert.equal((await result.json()).code, "MANDI_NOT_CONFIGURED");
});
