import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import { transformSync } from "esbuild";

// Exercise the real page handler with deterministic hook/service doubles.
// No browser credentials, network calls, SMTP or database access.
const source = readFileSync(new URL("../src/pages/auth/PasswordRecoveryPage.jsx", import.meta.url), "utf8");
const { code } = transformSync(source, { loader: "jsx", format: "cjs", jsx: "automatic" });
function harness(request, { reset = false, resetRequest = async () => ({}), hash = "" } = {}) {
  const hooks = []; let cursor = 0;
  const react = {
    useEffect() {},
    useState(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = typeof initial === "function" ? initial() : initial;
      return [hooks[i], (value) => { hooks[i] = typeof value === "function" ? value(hooks[i]) : value; }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = { current: initial };
      return hooks[i];
    },
  };
  const element = (type, props) => ({ type, props });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, TextEncoder, URLSearchParams,
    window: { location: { hash } },
    require: (name) => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx: element, jsxs: element, Fragment: "fragment" };
      if (name === "react-router-dom") return { Link: "link" };
      if (name.endsWith("AuthContext")) return { useAuth: () => ({ logout: async () => {} }) };
      if (name.endsWith("authService")) return { requestPasswordReset: request, resetPassword: resetRequest };
      if (name.endsWith("PasswordInput")) return { default: "password-input", __esModule: true };
      throw Error(`Unexpected import: ${name}`);
    },
  });
  const render = () => { cursor = 0; return module.exports.default({ reset }); };
  const find = (node, type, id) => {
    if (!node || typeof node !== "object") return undefined;
    if (node.type === type && (!id || node.props.id === id)) return node;
    const children = [node.props?.children].flat(Infinity);
    return children.map((child) => find(child, type, id)).find(Boolean);
  };
  return { render, find };
}

test("same-tick duplicate submit sends one request and button stays disabled while pending", async () => {
  const calls = []; let resolve;
  const f = harness((email) => { calls.push(email); return new Promise((r) => { resolve = r; }); });
  f.find(f.render(), "input").props.onChange({ target: { value: "fixture@example.invalid" } });
  const submit = f.find(f.render(), "form").props.onSubmit;
  const event = { preventDefault() {} };
  const pending = submit(event);
  await submit(event);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], "fixture@example.invalid");
  assert.equal(f.find(f.render(), "button").props.disabled, true);
  resolve({ success: true, message: "Generic recovery message" });
  await pending;
  assert.equal(f.find(f.render(), "form"), undefined);
  assert.equal(calls.length, 1);
});

test("reset page rejects mismatched passwords locally and submits valid matching values once", async () => {
  const calls = [];
  let resolve;
  const f = harness(async () => { throw Error("Wrong endpoint"); }, {
    reset: true, hash: `#token=${"a".repeat(64)}`,
    resetRequest: (payload) => { calls.push(payload); return new Promise((r) => { resolve = r; }); },
  });
  const enter = (id, value) => f.find(f.render(), "password-input", id).props.onChange({ target: { value } });
  enter("reset-password", "NewFixturePassword1");
  enter("confirm-reset-password", "DifferentPassword2");
  await f.find(f.render(), "form").props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 0);
  enter("confirm-reset-password", "NewFixturePassword1");
  const submit = f.find(f.render(), "form").props.onSubmit;
  const pending = submit({ preventDefault() {} });
  await submit({ preventDefault() {} });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].password, "NewFixturePassword1");
  assert.equal(calls[0].confirmPassword, calls[0].password);
  assert.equal(f.find(f.render(), "password-input", "reset-password").props.disabled, true);
  resolve({ message: "Password updated. Sign in again." });
  await pending;
  assert.equal(f.find(f.render(), "form"), undefined);
  assert.equal(f.find(f.render(), "p").props.children, "AgroSphere account recovery");
});

test("reset page without a valid email-link token cannot submit", () => {
  for (const hash of ["", "#token=invalid"]) {
    const f = harness(() => { throw Error("Unexpected request"); }, { reset: true, hash });
    assert.equal(f.find(f.render(), "form"), undefined);
  }
});

test("recovery routes reset page state, link from Login and avoid persistent token storage", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const login = readFileSync(new URL("../src/pages/auth/LoginPage.jsx", import.meta.url), "utf8");
  assert.match(app, /path="\/forgot-password" element=\{<PasswordRecoveryPage key="forgot"/);
  assert.match(app, /path="\/reset-password" element=\{<PasswordRecoveryPage key="reset" reset/);
  assert.match(login, /to="\/forgot-password"/);
  assert.match(source, /window.history.replaceState/);
  assert.match(source, /removeEventListener\("hashchange", consumeFragment\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\.log/);
});

test("a failed request releases the latch so a later deliberate retry works", async () => {
  let calls = 0;
  const f = harness(async () => { calls += 1; throw Error("Temporary failure"); });
  f.find(f.render(), "input").props.onChange({ target: { value: "fixture@example.invalid" } });
  await f.find(f.render(), "form").props.onSubmit({ preventDefault() {} });
  assert.equal(f.find(f.render(), "button").props.disabled, false);
  await f.find(f.render(), "form").props.onSubmit({ preventDefault() {} });
  assert.equal(calls, 2);
});
