const assert = require("node:assert/strict");
const { test } = require("node:test");
const express = require("express");
const nodemailer = require("nodemailer");
const User = require("../src/models/User");
const { getPasswordResetLimits } = require("../src/middleware/passwordResetLimiter");

// Exercise the actual router and BOTH limiters, with no real DB/SMTP access.
async function harness(t, mode = "production") {
  const config = { NODE_ENV: mode, CLIENT_URL: "https://agrosphere.example", SMTP_HOST: "smtp.example.invalid",
    SMTP_USER: "fixture", SMTP_PASS: "fixture", SMTP_FROM: "test@example.invalid", JWT_SECRET: "test-secret" };
  for (const [key, value] of Object.entries(config)) {
    const previous = process.env[key]; process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  const mail = [];
  const writes = [];
  const account = { _id: "64b000000000000000000031", email: "known@example.invalid", role: "CUSTOMER", name: "Fixture", comparePassword: async () => true };
  t.mock.method(User, "findOne", ({ email }) => {
    const value = email === account.email ? account : null;
    return { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject), select: async () => value };
  });
  t.mock.method(User, "updateOne", async (filter, update) => { writes.push({ filter, update }); return { modifiedCount: 1 }; });
  t.mock.method(nodemailer, "createTransport", () => ({ sendMail: async (message) => {
    mail.push(message); return { accepted: [message.to] };
  } }));
  const createRouter = () => {
    delete require.cache[require.resolve("../src/routes/authRoutes")];
    return require("../src/routes/authRoutes");
  };
  const start = async () => {
    const app = express(); app.use(express.json()); app.use("/api/auth", createRouter());
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
    return async (path, body) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      return { status: response.status, headers: response.headers, body: await response.json() };
    };
  };
  const post = await start();
  return { post, mail, writes, start };
}

test("development policy is relaxed; production and unknown deployments stay limited", () => {
  assert.deepEqual(getPasswordResetLimits({ NODE_ENV: "production", CLIENT_URL: "http://localhost:5173" }), {
    forgotIp: { limit: 10, windowMs: 900000 }, forgotEmail: { limit: 3, windowMs: 3600000 }, resetIp: { limit: 20, windowMs: 900000 },
  });
  for (const env of [{ NODE_ENV: "development" }, { NODE_ENV: "test" }, { CLIENT_URL: "http://localhost:5173" }]) {
    assert.equal(getPasswordResetLimits(env).forgotIp.limit, 30);
    assert.equal(getPasswordResetLimits(env).forgotEmail.limit, 10);
  }
  assert.equal(getPasswordResetLimits({ CLIENT_URL: "https://agrosphere.example" }).forgotIp.limit, 10);
  assert.equal(getPasswordResetLimits({ NODE_ENV: "staging" }).forgotIp.limit, 10);
});

test("first known/unknown requests get identical generic 200; existing account reaches SMTP", async (t) => {
  const f = await harness(t);
  const known = await f.post("/forgot-password", { email: "known@example.invalid" });
  const unknown = await f.post("/forgot-password", { email: "unknown@example.invalid" });
  assert.equal(known.status, 200); assert.equal(unknown.status, 200);
  assert.deepEqual(known.body, unknown.body);
  assert.equal(known.headers.get("ratelimit-limit"), "3");
  assert.equal(known.headers.get("ratelimit-remaining"), "2");
  assert.equal(known.headers.get("x-ratelimit-scope"), "forgot-password-email");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.mail.length, 1);
  assert.equal(f.writes.length, 1);
  assert.equal(f.mail[0].to, "known@example.invalid");
  assert.ok(!JSON.stringify(known.body).includes("token"));
});

test("production email limiter is independent and new router resets its memory store", async (t) => {
  const f = await harness(t);
  for (let i = 0; i < 3; i += 1) assert.equal((await f.post("/forgot-password", { email: "unknown@example.invalid" })).status, 200);
  const blocked = await f.post("/forgot-password", { email: "unknown@example.invalid" });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.limiter, "forgot-password-email");
  assert.equal(blocked.headers.get("ratelimit-remaining"), "0");
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal((await f.post("/forgot-password", { email: "different@example.invalid" })).status, 200);
  const restarted = await f.start();
  assert.equal((await restarted("/forgot-password", { email: "unknown@example.invalid" })).status, 200);
});

for (const [mode, ipLimit, emailLimit] of [["production", 10, 3], ["development", 30, 10]]) {
  test(`${mode}: IP abuse is stopped; login and reset endpoints do not share its bucket`, async (t) => {
    const f = await harness(t, mode);
    for (let i = 0; i < ipLimit; i += 1) assert.equal((await f.post("/forgot-password", { email: `unknown${i}@example.invalid` })).status, 200);
    const blocked = await f.post("/forgot-password", { email: "another@example.invalid" });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.limiter, "forgot-password-ip");
    assert.equal(blocked.headers.get("ratelimit-limit"), String(ipLimit));
    assert.ok(Number(blocked.headers.get("retry-after")) <= 900);
    const login = await f.post("/login", { email: "known@example.invalid", password: "FixturePassword1" });
    assert.equal(login.status, 200);
    assert.match(login.headers.get("set-cookie"), /HttpOnly/);
    assert.equal(login.headers.get("x-ratelimit-scope"), null);
    const invalidReset = await f.post("/reset-password", {});
    assert.equal(invalidReset.status, 400);
    assert.equal(invalidReset.headers.get("x-ratelimit-scope"), "reset-password-ip");
  });
  test(`${mode}: repeated same-email requests eventually stop at ${emailLimit}`, async (t) => {
    const f = await harness(t, mode);
    for (let i = 0; i < emailLimit; i += 1) assert.equal((await f.post("/forgot-password", { email: "unknown@example.invalid" })).status, 200);
    assert.equal((await f.post("/forgot-password", { email: "unknown@example.invalid" })).body.limiter, "forgot-password-email");
  });
}

test("server configuration errors do not spend email quota, but retain the IP abuse cap", async (t) => {
  const f = await harness(t);
  const host = process.env.SMTP_HOST;
  delete process.env.SMTP_HOST;
  for (let i = 0; i < 4; i += 1) assert.equal((await f.post("/forgot-password", { email: "unknown@example.invalid" })).status, 503);
  process.env.SMTP_HOST = host;
  assert.equal((await f.post("/forgot-password", { email: "unknown@example.invalid" })).status, 200);
  delete process.env.SMTP_HOST;
  for (let i = 0; i < 5; i += 1) assert.equal((await f.post("/forgot-password", { email: `unknown${i}@example.invalid` })).status, 503);
  const blocked = await f.post("/forgot-password", { email: "still-unknown@example.invalid" });
  assert.equal(blocked.status, 429); assert.equal(blocked.body.limiter, "forgot-password-ip");
});

test("login attempts do not consume the recovery quota", async (t) => {
  const f = await harness(t);
  for (let i = 0; i < 12; i += 1) assert.equal((await f.post("/login", {})).status, 400);
  const recovery = await f.post("/forgot-password", { email: "unknown@example.invalid" });
  assert.equal(recovery.status, 200);
  assert.equal(recovery.headers.get("ratelimit-remaining"), "2");
});
