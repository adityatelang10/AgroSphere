import assert from "node:assert/strict";
import test from "node:test";

import { getCartAfterPaymentVerification } from "../src/utils/cartCalculations.js";

const cart = [
  { cropId: "tomato", quantity: 2 },
  { cropId: "mango", quantity: 1 },
];

test("failed, cancelled, or unverified payment leaves the cart intact", () => {
  for (const result of [
    null,
    { success: false },
    { success: true, payment: { status: "FAILED" }, orderIds: [] },
    { success: true, payment: { status: "VERIFIED" }, orderIds: [] },
  ]) {
    assert.strictEqual(
      getCartAfterPaymentVerification(cart, ["tomato"], result),
      cart
    );
  }
});

test("verified finalization removes only the purchased crop items", () => {
  const result = getCartAfterPaymentVerification(cart, ["tomato"], {
    success: true,
    payment: { status: "VERIFIED" },
    orderIds: ["order-a"],
  });

  assert.deepEqual(result, [{ cropId: "mango", quantity: 1 }]);
});
