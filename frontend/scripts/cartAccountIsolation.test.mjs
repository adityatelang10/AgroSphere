import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import * as calculations from "../src/utils/cartCalculations.js";

// Execute the real provider, including its keyed account boundary and storage effects.
function fixture(blockStorage = false) {
  const storage = new Map([["agrosphere-cart", JSON.stringify([{ cropId: "legacy-private", quantity: 1 }])]]);
  let user = null, key, slots = [], cursor = 0, effects = [];
  const react = {
    createContext: () => ({ Provider: "Provider" }),
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === "function" ? initial() : initial };
      const slot = slots[i];
      return [slot.value, (value) => { slot.value = typeof value === "function" ? value(slot.value) : value; }];
    },
    useEffect(effect) { effects.push(effect); },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const module = { exports: {} };
  vm.runInNewContext(transformSync(readFileSync(new URL("../src/context/CartContext.jsx", import.meta.url), "utf8"), {
    loader: "jsx", format: "cjs", jsx: "automatic",
  }).code, { module, exports: module.exports, console,
    window: { localStorage: {
      getItem: (key) => { if (blockStorage) throw Error("Storage blocked"); return storage.get(key); },
      setItem: (key, value) => { if (blockStorage) throw Error("Storage blocked"); storage.set(key, value); },
    } },
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx };
      if (name.includes("AuthContext")) return { useAuth: () => ({ user }) };
      if (name.includes("cartCalculations")) return calculations;
      throw Error("Unexpected import " + name);
    },
  });
  const render = () => {
    const child = module.exports.CartProvider({ children: "Application" });
    if (key !== child.key) { key = child.key; slots = []; }
    cursor = 0; effects = [];
    const tree = child.type(child.props);
    effects.forEach((effect) => effect());
    return tree.props.value;
  };
  return { storage, render, login(id, role = "CUSTOMER") { user = id ? { id, role } : null; return render(); } };
}
const crop = { cropId: "tomato", name: "Tomato", price: 40, stockQuantity: 100, unit: "kg" };

test("account switch/logout never displays or overwrites another account cart", () => {
  const f = fixture();
  assert.equal(f.render().items.length, 0); // Legacy unowned cart is not imported.
  f.login("a").addToCart(crop, 5);
  assert.equal(f.render().subtotal, 200);
  const a = f.storage.get("agrosphere-cart:CUSTOMER:a");
  assert.equal(f.login(null).items.length, 0);
  assert.equal(f.login("b").items.length, 0);
  f.render().addToCart({ ...crop, cropId: "mango" }, 2); f.render();
  assert.equal(f.storage.get("agrosphere-cart:CUSTOMER:a"), a);
  assert.equal(f.login("a").items[0].quantity, 5);
  assert.equal(f.login("farmer", "FARMER").items.length, 0);
  assert.equal(JSON.parse(f.storage.get("agrosphere-cart"))[0].cropId, "legacy-private");
});

test("quantity controls and verified purchase removal work within the selected account", () => {
  const f = fixture();
  f.login("a").addToCart(crop, 5);
  f.render().updateQuantity("tomato", 6); assert.equal(f.render().subtotal, 240);
  f.render().removePurchasedItems(["tomato"], { success: false }); assert.equal(f.render().items.length, 1);
  f.render().removePurchasedItems(["tomato"], { success: true, payment: { status: "VERIFIED" }, orderIds: ["order"] });
  assert.equal(f.render().items.length, 0);
});

test("blocked browser storage does not prevent in-memory cart use", () => {
  const f = fixture(true);
  f.login("a").addToCart(crop, 2);
  assert.equal(f.render().totalQuantity, 2);
});
