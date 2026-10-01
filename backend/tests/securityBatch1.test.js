const assert = require("node:assert/strict");
const { test } = require("node:test");
const express = require("express");
const { validationResult } = require("express-validator");
const User = require("../src/models/User");
const gemini = require("../src/services/geminiService");
const auth = require("../src/controllers/authController");
const { createRequestLimiter, getRequestLimits } = require("../src/middleware/requestRateLimiter");

async function harness(t) {
  for (const [key, value] of Object.entries({ NODE_ENV: "production", JWT_SECRET: "isolated-security-test-secret" })) {
    const previous = process.env[key]; process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  let providerCalls = 0, databaseCalls = 0;
  t.mock.method(User, "findOne", ({ email }) => {
    databaseCalls += 1;
    return { select: async () => email === "known@example.invalid"
      ? { _id: "64b000000000000000000031", role: "CUSTOMER", name: "Fixture", email, comparePassword: async () => true }
      : null };
  });
  t.mock.method(User, "create", async () => { throw Error("Unexpected database write"); });
  t.mock.method(gemini, "generateGeminiReply", async () => {
    providerCalls += 1; return { text: "Isolated reply", model: "fixture" };
  });
  const names = ["../src/routes/authRoutes", "../src/routes/chatRoutes", "../src/controllers/chatController"];
  const cached = names.map((name) => [require.resolve(name), require.cache[require.resolve(name)]]);
  for (const [name] of cached) delete require.cache[name];
  t.after(() => { for (const [name, original] of cached) { delete require.cache[name]; if (original) require.cache[name] = original; } });
  const app = express(); app.use(express.json());
  app.use("/api/auth", require("../src/routes/authRoutes"));
  app.use("/api/chat", require("../src/routes/chatRoutes"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return {
    get providerCalls() { return providerCalls; }, get databaseCalls() { return databaseCalls; },
    async post(path, body) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      return { status: response.status, headers: response.headers, body: await response.json() };
    },
  };
}

test("security policies are relaxed only for explicit development/test", () => {
  const production = getRequestLimits({ NODE_ENV: "production" });
  assert.equal(production.loginIp.limit, 30); assert.equal(production.loginEmail.limit, 10);
  assert.equal(production.registerIp.limit, 5); assert.equal(production.geminiIp.limit, 10);
  assert.equal(production.geminiGlobal.limit, 200);
  for (const environment of [{}, { NODE_ENV: "staging" }, { CLIENT_URL: "http://localhost:5173" }]) {
    assert.deepEqual(getRequestLimits(environment), production);
  }
  for (const NODE_ENV of ["development", "test"]) {
    assert.equal(getRequestLimits({ NODE_ENV }).loginIp.limit, 100);
    assert.equal(getRequestLimits({ NODE_ENV }).geminiIp.limit, 30);
  }
});

test("login email/IP quotas reject abuse before DB work; registration and recovery are independent", async (t) => {
  const f = await harness(t);
  const success = await f.post("/api/auth/login", { email: "known@example.invalid", password: "Password1" });
  assert.equal(success.status, 200); assert.match(success.headers.get("set-cookie"), /HttpOnly/);
  for (let i = 0; i < 10; i++) {
    assert.equal((await f.post("/api/auth/login", { email: "unknown@example.invalid", password: "Password1" })).status, 401);
  }
  const before = f.databaseCalls;
  const blocked = await f.post("/api/auth/login", { email: "unknown@example.invalid", password: "Password1" });
  assert.equal(blocked.status, 429); assert.equal(f.databaseCalls, before);
  assert.equal(blocked.headers.get("x-ratelimit-scope"), "login-email");
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  // Varying email cannot bypass the IP quota.
  let final;
  for (let i = 0; i < 30; i++) final = await f.post("/api/auth/login", { email: `different${i}@example.invalid`, password: "Password1" });
  assert.equal(final.status, 429); assert.equal(final.headers.get("x-ratelimit-scope"), "login-ip");
  assert.equal((await f.post("/api/auth/register", {})).status, 400);
  assert.equal((await f.post("/api/auth/forgot-password", { email: "invalid" })).status, 400);
});

test("registration quota protects writes and never echoes invalid password values", async (t) => {
  const f = await harness(t);
  const secret = "short-test-value";
  for (let i = 0; i < 5; i++) {
    const response = await f.post("/api/auth/register", { password: secret });
    assert.equal(response.status, 400);
    assert.ok(response.body.errors.some((error) => error.path === "password"));
    assert.ok(response.body.errors.every((error) => !("value" in error)));
    assert.ok(!JSON.stringify(response.body).includes(secret));
  }
  assert.equal((await f.post("/api/auth/register", {})).status, 429);
  assert.equal(f.databaseCalls, 0);
  assert.equal((await f.post("/api/auth/login", {})).status, 400);
});

test("registration enforces UTF-8 bytes, permits 72 bytes and rejects non-string passwords", async () => {
  for (const [password, valid] of [["A1" + "x".repeat(70), true], ["A1" + "x".repeat(71), false],
    ["A1" + "é".repeat(35), true], ["A1" + "é".repeat(36), false], [12345678, false], [[], false]]) {
    const req = { body: { name: "Fixture", email: "fixture@example.invalid", role: "FARMER", password } };
    for (const rule of auth.registerValidation) await rule.run(req);
    assert.equal(validationResult(req).isEmpty(), valid);
  }
});

test("anonymous Gemini still works but excess requests never reach the provider", async (t) => {
  const f = await harness(t);
  for (let i = 0; i < 10; i++) {
    const response = await f.post("/api/chat/gemini", { question: "How does AgroSphere work?" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-ratelimit-scope"), "gemini-global");
  }
  const blocked = await f.post("/api/chat/gemini", { question: "How does AgroSphere work?" });
  assert.equal(blocked.status, 429); assert.equal(f.providerCalls, 10);
  assert.equal(blocked.headers.get("x-ratelimit-scope"), "gemini-ip");
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal((await f.post("/api/auth/login", {})).status, 400);
});

test("global quota spans IPs, expires and fails closed when its bounded store is full", () => {
  let time = 0, allowed = 0;
  const global = createRequestLimiter({ limit: 2, windowMs: 1000, key: () => "global", now: () => time, scope: "gemini-global" });
  const call = (limiter, ip) => {
    const result = { headers: {}, statusCode: 200 };
    const res = { set: (key, value) => { result.headers[key] = value; }, status: (status) => { result.statusCode = status; return res; }, json: (body) => { result.body = body; } };
    limiter({ ip }, res, () => { allowed += 1; }); return result;
  };
  call(global, "one"); call(global, "two");
  assert.equal(call(global, "three").statusCode, 429); assert.equal(allowed, 2);
  time = 1001; assert.equal(call(global, "four").statusCode, 200);
  const bounded = createRequestLimiter({ limit: 2, windowMs: 1000, maxEntries: 1, now: () => time });
  call(bounded, "one"); assert.equal(call(bounded, "two").statusCode, 429);
});
