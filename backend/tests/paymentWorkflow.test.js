const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const { requireRole } = require("../src/middleware/authMiddleware");
const {
  PaymentServiceError,
  PaymentVerificationError,
  createRazorpayClient,
  getRazorpayConfiguration,
  validateCapturedPayment,
  validatePaidGatewayOrder,
  verifyRazorpaySignature,
} = require("../src/services/razorpayService");
const {
  createPaymentWorkflow,
} = require("../src/services/paymentWorkflowService");

const CUSTOMER_A = "64b000000000000000000031";
const CUSTOMER_B = "64b000000000000000000032";
const ATTEMPT_ID = "64b000000000000000000041";
const ORDER_ID = "order_server123";
const PAYMENT_ID = "pay_captured123";
const KEY_SECRET = "test-secret-never-returned";

const signatureFor = (orderId = ORDER_ID, paymentId = PAYMENT_ID) =>
  crypto
    .createHmac("sha256", KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

const makeAttempt = (overrides = {}) => ({
  _id: ATTEMPT_ID,
  customer: CUSTOMER_A,
  status: "CREATED",
  razorpayOrderId: ORDER_ID,
  razorpayPaymentId: null,
  amountPaise: 80000,
  subtotalPaise: 80000,
  deliveryChargePaise: 0,
  currency: "INR",
  itemsSnapshot: [{ crop: "64b000000000000000000001", quantity: 2 }],
  deliverySnapshot: { line1: "Road", pincode: "585401" },
  finalOrderIds: [],
  save: async function save() {
    return this;
  },
  ...overrides,
});

const createAttemptModel = (initialAttempt = makeAttempt()) => {
  let attempt = initialAttempt;
  return {
    get attempt() {
      return attempt;
    },
    create: async (payload) => {
      attempt = makeAttempt({ ...payload, _id: ATTEMPT_ID, razorpayOrderId: null });
      return attempt;
    },
    findOne: async (query) => {
      if (
        !attempt ||
        String(query._id) !== String(attempt._id) ||
        String(query.customer) !== String(attempt.customer)
      ) {
        return null;
      }
      return attempt;
    },
    findOneAndUpdate: async (query, update) => {
      if (
        !attempt ||
        String(query._id) !== String(attempt._id) ||
        String(query.customer) !== String(attempt.customer) ||
        (query.status && query.status !== attempt.status)
      ) {
        return null;
      }
      Object.assign(attempt, update.$set);
      return attempt;
    },
  };
};

const razorpayClient = (overrides = {}) => ({
  getConfiguration: () => ({
    keyId: "rzp_test_public123",
    keySecret: KEY_SECRET,
    mode: "test",
  }),
  createOrder: async ({ amountPaise }) => ({
    id: ORDER_ID,
    amount: amountPaise,
    currency: "INR",
    status: "created",
  }),
  fetchPayment: async () => ({
    id: PAYMENT_ID,
    order_id: ORDER_ID,
    amount: 80000,
    currency: "INR",
    status: "captured",
    captured: true,
  }),
  fetchOrder: async () => ({
    id: ORDER_ID,
    amount: 80000,
    currency: "INR",
    status: "paid",
  }),
  ...overrides,
});

const verificationInput = (overrides = {}) => ({
  customer: CUSTOMER_A,
  paymentAttemptId: ATTEMPT_ID,
  razorpayPaymentId: PAYMENT_ID,
  razorpayOrderId: ORDER_ID,
  razorpaySignature: signatureFor(),
  ...overrides,
});

test("CUSTOMER role is allowed while FARMER and anonymous users are rejected", () => {
  const customerReq = { user: { role: "CUSTOMER" } };
  let customerNext = false;
  requireRole("CUSTOMER")(customerReq, {}, () => {
    customerNext = true;
  });
  assert.equal(customerNext, true);

  const response = () => {
    const result = { statusCode: null, body: null };
    return {
      result,
      status(code) {
        result.statusCode = code;
        return this;
      },
      json(body) {
        result.body = body;
        return this;
      },
    };
  };
  const farmerRes = response();
  requireRole("CUSTOMER")({ user: { role: "FARMER" } }, farmerRes, () => {});
  assert.equal(farmerRes.result.statusCode, 403);
  const anonymousRes = response();
  requireRole("CUSTOMER")({}, anonymousRes, () => {});
  assert.equal(anonymousRes.result.statusCode, 401);
});

test("missing keys and non-test configuration fail without breaking module load", () => {
  assert.throws(
    () => getRazorpayConfiguration({}),
    (error) => error instanceof PaymentServiceError && error.statusCode === 503
  );
  assert.throws(
    () =>
      getRazorpayConfiguration({
        RAZORPAY_KEY_ID: "rzp_live_not_allowed",
        RAZORPAY_KEY_SECRET: "secret",
        RAZORPAY_MODE: "live",
      }),
    (error) => error.code === "UNSUPPORTED_PAYMENT_MODE"
  );
});

test("gateway creation failure creates no final marketplace order", async () => {
  const model = createAttemptModel();
  let finalizationCalls = 0;
  const workflow = createPaymentWorkflow({
    PaymentAttemptModel: model,
    checkoutQuoteBuilder: async () => ({
      amountPaise: 80000,
      subtotalPaise: 80000,
      deliveryChargePaise: 0,
      currency: "INR",
      itemsSnapshot: [],
      deliverySnapshot: {},
    }),
    checkoutFinalizer: async () => {
      finalizationCalls += 1;
    },
    razorpayClient: razorpayClient({
      createOrder: async () => {
        throw new PaymentServiceError("safe gateway failure", 503);
      },
    }),
  });

  await assert.rejects(
    workflow.createPaymentAttempt({ customer: CUSTOMER_A, items: [], deliveryAddress: {} }),
    PaymentServiceError
  );
  assert.equal(model.attempt.status, "FAILED");
  assert.equal(finalizationCalls, 0);
});

test("create-order response exposes Key ID but never Key Secret", async () => {
  const model = createAttemptModel();
  const workflow = createPaymentWorkflow({
    PaymentAttemptModel: model,
    checkoutQuoteBuilder: async () => ({
      amountPaise: 80000,
      subtotalPaise: 80000,
      deliveryChargePaise: 0,
      currency: "INR",
      itemsSnapshot: [
        {
          crop: "64b000000000000000000001",
          cropName: "Tomato",
          unit: "kg",
          quantity: 2,
          priceAtOrder: 400,
          lineAmountPaise: 80000,
        },
      ],
      deliverySnapshot: {},
    }),
    razorpayClient: razorpayClient(),
  });

  const response = await workflow.createPaymentAttempt({
    customer: CUSTOMER_A,
    items: [],
    deliveryAddress: {},
  });
  assert.equal(response.razorpay.keyId, "rzp_test_public123");
  assert.ok(!JSON.stringify(response).includes(KEY_SECRET));
});

test("correct HMAC signature passes and an incorrect signature fails", () => {
  assert.equal(
    verifyRazorpaySignature({
      storedOrderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: signatureFor(),
      keySecret: KEY_SECRET,
    }),
    true
  );
  assert.equal(
    verifyRazorpaySignature({
      storedOrderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: "0".repeat(64),
      keySecret: KEY_SECRET,
    }),
    false
  );
});

test("signature input uses the server-stored order ID, not a spoofed callback ID", () => {
  const spoofedSignature = signatureFor("order_browserSpoof", PAYMENT_ID);
  assert.equal(
    verifyRazorpaySignature({
      storedOrderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      signature: spoofedSignature,
      keySecret: KEY_SECRET,
    }),
    false
  );
});

test("provider payment verification checks identity, order, amount, currency and capture", () => {
  assert.equal(
    validateCapturedPayment(
      {
        id: PAYMENT_ID,
        order_id: ORDER_ID,
        amount: 80000,
        currency: "INR",
        status: "captured",
        captured: true,
      },
      { paymentId: PAYMENT_ID, orderId: ORDER_ID, amountPaise: 80000 }
    ),
    true
  );
});

test("payment amount mismatch is rejected", () => {
  assert.throws(
    () =>
      validateCapturedPayment(
        {
          id: PAYMENT_ID,
          order_id: ORDER_ID,
          amount: 100,
          currency: "INR",
          status: "captured",
          captured: true,
        },
        { paymentId: PAYMENT_ID, orderId: ORDER_ID, amountPaise: 80000 }
      ),
    PaymentVerificationError
  );
});

test("wrong gateway order is rejected", () => {
  assert.throws(
    () =>
      validateCapturedPayment(
        {
          id: PAYMENT_ID,
          order_id: "order_wrong",
          amount: 80000,
          currency: "INR",
          status: "captured",
          captured: true,
        },
        { paymentId: PAYMENT_ID, orderId: ORDER_ID, amountPaise: 80000 }
      ),
    PaymentVerificationError
  );
});

test("authorized but uncaptured payment is not finalized", () => {
  assert.throws(
    () =>
      validateCapturedPayment(
        {
          id: PAYMENT_ID,
          order_id: ORDER_ID,
          amount: 80000,
          currency: "INR",
          status: "authorized",
          captured: false,
        },
        { paymentId: PAYMENT_ID, orderId: ORDER_ID, amountPaise: 80000 }
      ),
    (error) => error.code === "PAYMENT_NOT_CAPTURED"
  );
});

test("gateway order must also be paid with matching identity and amount", () => {
  assert.equal(
    validatePaidGatewayOrder(
      { id: ORDER_ID, amount: 80000, currency: "INR", status: "paid" },
      { orderId: ORDER_ID, amountPaise: 80000 }
    ),
    true
  );
  assert.throws(
    () =>
      validatePaidGatewayOrder(
        { id: ORDER_ID, amount: 80000, currency: "INR", status: "attempted" },
        { orderId: ORDER_ID, amountPaise: 80000 }
      ),
    PaymentVerificationError
  );
});

test("spoofed browser order ID is rejected before provider calls or finalization", async () => {
  const model = createAttemptModel();
  let providerCalls = 0;
  let finalizationCalls = 0;
  const workflow = createPaymentWorkflow({
    PaymentAttemptModel: model,
    razorpayClient: razorpayClient({
      fetchPayment: async () => {
        providerCalls += 1;
      },
    }),
    checkoutFinalizer: async () => {
      finalizationCalls += 1;
    },
  });

  await assert.rejects(
    workflow.verifyPaymentAttempt(
      verificationInput({ razorpayOrderId: "order_browserSpoof" })
    ),
    PaymentVerificationError
  );
  assert.equal(providerCalls, 0);
  assert.equal(finalizationCalls, 0);
});

test("duplicate valid verification finalizes once and returns the same order IDs", async () => {
  const model = createAttemptModel();
  let finalizationCalls = 0;
  const workflow = createPaymentWorkflow({
    PaymentAttemptModel: model,
    razorpayClient: razorpayClient(),
    checkoutFinalizer: async () => {
      finalizationCalls += 1;
      return {
        orderIds: ["64b000000000000000000051"],
        orders: [{ _id: "64b000000000000000000051" }],
      };
    },
    now: () => new Date("2026-08-30T10:00:00.000Z"),
  });

  const first = await workflow.verifyPaymentAttempt(verificationInput());
  const second = await workflow.verifyPaymentAttempt(verificationInput());

  assert.equal(finalizationCalls, 1);
  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.deepEqual(second.orderIds, first.orderIds);
  assert.equal("orders" in first, false);
});

test("another customer cannot verify the owner's payment attempt", async () => {
  const workflow = createPaymentWorkflow({
    PaymentAttemptModel: createAttemptModel(),
    razorpayClient: razorpayClient(),
  });

  await assert.rejects(
    workflow.verifyPaymentAttempt(verificationInput({ customer: CUSTOMER_B })),
    (error) => error.statusCode === 404
  );
});

test("payment verification failure never calls order finalization", async () => {
  let finalizationCalls = 0;
  const workflow = createPaymentWorkflow({
    PaymentAttemptModel: createAttemptModel(),
    razorpayClient: razorpayClient(),
    checkoutFinalizer: async () => {
      finalizationCalls += 1;
    },
  });

  await assert.rejects(
    workflow.verifyPaymentAttempt(
      verificationInput({ razorpaySignature: "0".repeat(64) })
    ),
    PaymentVerificationError
  );
  assert.equal(finalizationCalls, 0);
});

test("Razorpay network failure returns a safe message without raw provider details", async () => {
  const client = createRazorpayClient({
    environment: {
      RAZORPAY_KEY_ID: "rzp_test_public123",
      RAZORPAY_KEY_SECRET: KEY_SECRET,
      RAZORPAY_MODE: "test",
    },
    fetchImplementation: async () => {
      throw new Error("private socket diagnostic");
    },
  });

  await assert.rejects(
    client.createOrder({ amountPaise: 80000, receipt: "ags_test" }),
    (error) =>
      error.statusCode === 503 &&
      !error.message.includes("private socket diagnostic") &&
      !error.message.includes(KEY_SECRET)
  );
});
