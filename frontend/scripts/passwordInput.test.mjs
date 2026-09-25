import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import { transformSync } from "esbuild";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const source = read("components/ui/PasswordInput.jsx");
const { code } = transformSync(source, { loader: "jsx", format: "cjs", jsx: "automatic" });

function inputHarness(props = {}) {
  let visible = false;
  const element = (type, props) => ({ type, props });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: (name) => {
    if (name === "react") return {
      useId: () => "password-fixture",
      useState: () => [visible, (next) => { visible = typeof next === "function" ? next(visible) : next; }],
    };
    if (name === "react/jsx-runtime") return { jsx: element, jsxs: element, Fragment: "fragment" };
    throw Error(`Unexpected import: ${name}`);
  } });
  return () => {
    const node = module.exports.default(props);
    const [input, button] = node.props.children;
    return { input: input.props, button: button.props };
  };
}

test("eye starts hidden, toggles both ways without editing the password or submitting", () => {
  let changes = 0;
  const render = inputHarness({ value: "VisibleFixture1", onChange: () => { changes += 1; } });
  assert.equal(render().input.type, "password");
  assert.equal(render().button["aria-label"], "Show password");
  assert.equal(render().button.type, "button");
  render().button.onClick();
  assert.equal(render().input.type, "text");
  assert.equal(render().input.value, "VisibleFixture1");
  assert.equal(render().button["aria-label"], "Hide password");
  assert.equal(render().button["aria-pressed"], true);
  render().button.onClick();
  assert.equal(render().input.type, "password");
  assert.equal(changes, 0);
});

test("toggle is a keyboard-accessible native button tied to its input and respects disabled state", () => {
  const { input, button } = inputHarness({ id: "new-password", disabled: true, autoComplete: "new-password" })();
  assert.equal(input.id, "new-password");
  assert.equal(button["aria-controls"], input.id);
  assert.equal(button.tabIndex, undefined); // Native button retains normal keyboard tab order.
  assert.equal(button.disabled, true);
  assert.equal(input.disabled, true);
  assert.equal(input.autoComplete, "new-password");
  assert.match(input.className, /pr-12/);
  assert.match(button.className, /focus-visible:ring-2/);
  assert.match(button.className, /dark:hover:text-emerald-200/);
  assert.doesNotMatch(button.className, /amber|yellow/);
});

test("each password control has independent visibility", () => {
  const password = inputHarness();
  const confirmation = inputHarness();
  password().button.onClick();
  assert.equal(password().input.type, "text");
  assert.equal(confirmation().input.type, "password");
});

test("Login, Register and both Reset fields reuse the component with explicit labels", () => {
  for (const [page, id] of [["LoginPage", "login-password"], ["RegisterPage", "register-password"]]) {
    const pageSource = read(`pages/auth/${page}.jsx`);
    assert.ok(pageSource.includes(`htmlFor="${id}"`));
    assert.match(pageSource, /<PasswordInput/);
    assert.doesNotMatch(pageSource, /type="password"/);
  }
  const reset = read("pages/auth/PasswordRecoveryPage.jsx");
  assert.equal((reset.match(/<PasswordInput /g) || []).length, 2);
  assert.match(reset, /htmlFor="confirm-reset-password"/);
});
