const assert = require("node:assert/strict");
const { test } = require("node:test");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const express = require("express");
const cookieParser = require("cookie-parser");
const nodemailer = require("nodemailer");
const User = require("../src/models/User");
const { createPasswordResetService, hashResetToken, isValidPassword } = require("../src/services/passwordResetService");
const { getMailConfiguration, sendResetEmail } = require("../src/services/passwordResetMailService");
const { createPasswordResetLimiter } = require("../src/middleware/passwordResetLimiter");
const { getUserFromToken } = require("../src/utils/authToken");
const { forgotPassword, forgotPasswordValidation, resetPassword, resetPasswordValidation } = require("../src/controllers/passwordResetController");

// Isolated in-memory users/mailboxes: never connect to the demo database or SMTP.
const fixture = () => {
  const user = { _id: "64b000000000000000000031", email: "test@example.com", password: "original-hash" };
  let time = new Date("2026-09-18T10:00:00Z");
  const mail = [];
  const matches = (q) => (!q.email || q.email === user.email) &&
    (!q.passwordResetTokenHash || q.passwordResetTokenHash === user.passwordResetTokenHash) &&
    (!q.passwordResetExpiresAt || user.passwordResetExpiresAt > q.passwordResetExpiresAt.$gt);
  const update = (q, u) => {
    if (!matches(q)) return null;
    Object.assign(user, u.$set);
    for (const field of Object.keys(u.$unset || {})) delete user[field];
    for (const [field, amount] of Object.entries(u.$inc || {})) user[field] = (user[field] || 0) + amount;
    return { ...user };
  };
  const UserModel = {
    findOne: async (q) => matches(q) ? { ...user } : null,
    updateOne: async (q, u) => update(q, u),
    exists: async (q) => matches(q),
    findOneAndUpdate: async (q, u) => update(q, u),
  };
  const service = createPasswordResetService({ UserModel, now: () => time, sendMail: async (m) => mail.push(m) });
  return { user, mail, UserModel, service, advance: (ms) => { time = new Date(time.getTime() + ms); } };
};

test("reset emails contain random tokens; database stores only hashes and 15-minute expiry", async () => {
  const f = fixture();
  await f.service.requestReset(f.user.email, {});
  assert.match(f.mail[0].token, /^[a-f0-9]{64}$/);
  assert.equal(f.user.passwordResetTokenHash, hashResetToken(f.mail[0].token));
  assert.ok(!JSON.stringify(f.user).includes(f.mail[0].token));
  assert.equal(f.user.passwordResetExpiresAt.toISOString(), "2026-09-18T10:15:00.000Z");
  assert.equal(f.user.password, "original-hash");
  await f.service.requestReset("unknown@example.com", {});
  assert.equal(f.mail.length, 1);
});

test("password is hashed once, token consumed, and sessions versioned; concurrent reuse fails", async () => {
  const f = fixture();
  await f.service.requestReset(f.user.email, {});
  const token = f.mail[0].token;
  const outcomes = await Promise.all([f.service.resetPassword(token, "NewPassword1"), f.service.resetPassword(token, "OtherPassword2")]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.equal(f.user.authVersion, 1);
  assert.equal(f.user.passwordResetTokenHash, undefined);
  assert.equal(f.user.passwordResetExpiresAt, undefined);
  const winningPassword = outcomes[0] ? "NewPassword1" : "OtherPassword2";
  assert.equal(await bcrypt.compare(winningPassword, f.user.password), true);
  assert.equal(await f.service.resetPassword(token, "ThirdPassword3"), null);
});

test("expired, superseded, malformed tokens and weak passwords do not change an account", async () => {
  const f = fixture();
  await f.service.requestReset(f.user.email, {});
  const old = f.mail[0].token;
  await f.service.requestReset(f.user.email, {});
  const current = f.mail[1].token;
  assert.notEqual(current, old);
  assert.equal(await f.service.resetPassword(old, "ValidPassword1"), null);
  assert.equal(await f.service.resetPassword("bad", "ValidPassword1"), null);
  assert.equal(await f.service.resetPassword(current, "weak"), null);
  f.advance(15 * 60 * 1000);
  assert.equal(await f.service.resetPassword(current, "ValidPassword1"), null);
  assert.equal(f.user.password, "original-hash");
  assert.equal(isValidPassword("A1" + "é".repeat(36)), false);
});

test("SMTP failure invalidates only its own token", async () => {
  const f = fixture();
  const service = createPasswordResetService({ UserModel: f.UserModel, sendMail: async () => { throw Error("private SMTP details"); } });
  await assert.rejects(service.requestReset(f.user.email, {}), /delivery failed/);
  assert.equal(f.user.passwordResetTokenHash, undefined);
  assert.equal(f.user.password, "original-hash");
  const racing = createPasswordResetService({ UserModel: f.UserModel, sendMail: async () => {
    await f.service.requestReset(f.user.email, {});
    throw Error("old request delivery failed");
  } });
  await assert.rejects(racing.requestReset(f.user.email, {}));
  assert.equal(f.user.passwordResetTokenHash, hashResetToken(f.mail[0].token));
});

test("mail config fails closed, requires TLS and builds links only from CLIENT_URL", async (t) => {
  const environment = { SMTP_HOST: "smtp.example.com", SMTP_USER: "sender", SMTP_PASS: "test-fixture", SMTP_FROM: "sender@example.com", CLIENT_URL: "https://app.example.com" };
  assert.throws(() => getMailConfiguration({}));
  assert.throws(() => getMailConfiguration({ ...environment, CLIENT_URL: "http://app.example.com" }));
  assert.throws(() => getMailConfiguration({ ...environment, CLIENT_URL: "http://localhost:5173", NODE_ENV: "production" }));
  const configuration = getMailConfiguration(environment);
  assert.equal(configuration.transport.requireTLS, true);
  let sent;
  t.mock.method(nodemailer, "createTransport", () => ({ sendMail: async (mail) => { sent = mail; return { accepted: [mail.to] }; } }));
  await sendResetEmail({ email: "test@example.com", token: "a".repeat(64), configuration });
  assert.match(sent.text, /https:\/\/app.example.com\/reset-password#token=/);
  assert.equal(sent.to, "test@example.com");
});

test("per-process limiter stops excess requests and expires without retaining raw keys", () => {
  let time = 100;
  const limiter = createPasswordResetLimiter({ limit: 2, windowMs: 1000, now: () => time });
  const res = { set() {}, status(code) { this.code = code; return this; }, json() {} };
  let accepted = 0;
  const request = () => limiter({ ip: "127.0.0.1" }, res, () => { accepted += 1; });
  request(); request(); request();
  assert.equal(accepted, 2);
  assert.equal(res.code, 429);
  time += 1000;
  request();
  assert.equal(accepted, 3);
});

test("legacy sessions work until reset, old tokens fail afterward, new tokens work", async (t) => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "isolated-test-secret-only";
  t.after(() => { if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; });
  const user = { _id: "test-user", authVersion: 0 };
  t.mock.method(User, "findById", async () => user);
  const old = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
  assert.equal(await getUserFromToken(old), user);
  user.authVersion = 1;
  assert.equal(await getUserFromToken(old), null);
  const current = jwt.sign({ userId: user._id, authVersion: 1 }, process.env.JWT_SECRET);
  assert.equal(await getUserFromToken(current), user);
});

test("User JSON hides reset material and session version", () => {
  const serialized = new User({ name: "Test", email: "test@example.com", role: "CUSTOMER", password: "test-hash", authVersion: 2, passwordResetTokenHash: "secret-hash", passwordResetExpiresAt: new Date() }).toJSON();
  for (const key of ["password", "authVersion", "passwordResetTokenHash", "passwordResetExpiresAt"]) assert.equal(serialized[key], undefined);
});

test("HTTP recovery: generic responses, single-use reset, old-session rejection and new-password login", async (t) => {
  const env = { SMTP_HOST: "smtp.example.com", SMTP_USER: "test", SMTP_PASS: "test-fixture", SMTP_FROM: "test@example.com", CLIENT_URL: "http://localhost:5173", NODE_ENV: "test", JWT_SECRET: "isolated-recovery-test-secret" };
  for (const [key, value] of Object.entries(env)) {
    const old = process.env[key]; process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  const f = fixture();
  f.user.password = await bcrypt.hash("OldFixturePassword1", 4);
  f.user.name = "Recovery fixture";
  f.user.role = "CUSTOMER";
  for (const [key, fn] of Object.entries(f.UserModel)) t.mock.method(User, key, fn);
  t.mock.method(User, "findOne", (query) => {
    const result = f.UserModel.findOne(query);
    return {
      then: result.then.bind(result),
      select: async () => {
        const user = await result;
        return user ? { ...user, comparePassword: (candidate) => bcrypt.compare(candidate, user.password) } : null;
      },
    };
  });
  t.mock.method(User, "findById", async () => ({ ...f.user }));
  let mail;
  t.mock.method(nodemailer, "createTransport", () => ({ sendMail: async (m) => { mail = m; return { accepted: [m.to] }; } }));
  const app = express(); app.use(cookieParser()); app.use(express.json());
  app.use("/api/auth", require("../src/routes/authRoutes"));
  let disconnected;
  app.set("io", { in: (room) => ({ disconnectSockets: (flag) => { disconnected = { room, flag }; } }) });
  app.post("/forgot", forgotPasswordValidation, forgotPassword);
  app.post("/reset", resetPasswordValidation, resetPassword);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const post = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { response, data: await response.json() };
  };
  const legacy = jwt.sign({ userId: f.user._id, role: f.user.role }, process.env.JWT_SECRET);
  const session = (cookie) => fetch(`http://127.0.0.1:${server.address().port}/api/auth/me`, { headers: { cookie } });
  assert.equal((await session(`token=${legacy}`)).status, 200);
  const known = await post("/forgot", { email: f.user.email });
  const unknown = await post("/forgot", { email: "unknown@example.com" });
  assert.equal(known.response.status, 200);
  assert.deepEqual(known.data, unknown.data);
  assert.ok(!JSON.stringify(known.data).includes("token="));
  // Finish the scheduled local fake mail task; no network mail is sent.
  await new Promise((resolve) => setImmediate(resolve));
  const token = mail.text.match(/#token=([a-f0-9]{64})/)[1];
  const invalid = await post("/reset", { token, password: "ValidPassword1", confirmPassword: "wrong" });
  assert.equal(invalid.response.status, 400);
  assert.ok(!JSON.stringify(invalid.data).includes("ValidPassword1"));
  const reset = await post("/reset", { token, password: "ValidPassword1", confirmPassword: "ValidPassword1" });
  assert.equal(reset.response.status, 200);
  assert.match(reset.response.headers.get("set-cookie"), /token=;/);
  assert.deepEqual(disconnected, { room: `user:${f.user._id}`, flag: true });
  assert.equal(reset.response.headers.get("cache-control"), "no-store");
  assert.equal((await post("/reset", { token, password: "ValidPassword1", confirmPassword: "ValidPassword1" })).response.status, 400);
  assert.equal((await session(`token=${legacy}`)).status, 401);
  const oldLogin = await post("/api/auth/login", { email: f.user.email, password: "OldFixturePassword1" });
  assert.equal(oldLogin.response.status, 401);
  const newLogin = await post("/api/auth/login", { email: f.user.email, password: "ValidPassword1" });
  assert.equal(newLogin.response.status, 200);
  const cookie = newLogin.response.headers.get("set-cookie").split(";")[0];
  assert.equal((await session(cookie)).status, 200);
  for (const key of ["password", "passwordResetTokenHash", "passwordResetExpiresAt", "authVersion"]) {
    assert.equal(newLogin.data.user[key], undefined);
  }
  for (const email of [null, [f.user.email], { $ne: null }, "not-an-email"]) {
    assert.equal((await post("/forgot", { email })).response.status, 400);
  }
  delete process.env.SMTP_HOST;
  assert.equal((await post("/forgot", { email: f.user.email })).response.status, 503);
  assert.equal((await post("/forgot", { email: "unknown@example.com" })).response.status, 503);
});
