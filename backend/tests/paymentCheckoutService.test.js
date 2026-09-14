const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CheckoutError,
  createCheckoutService,
  normalizeCheckoutItems,
} = require("../src/services/checkoutService");

const IDS = {
  cropA: "64b000000000000000000001",
  cropB: "64b000000000000000000002",
  farmerA: "64b000000000000000000011",
  farmerB: "64b000000000000000000012",
  farmerUserA: "64b000000000000000000021",
  farmerUserB: "64b000000000000000000022",
  customer: "64b000000000000000000031",
  attempt: "64b000000000000000000041",
};

const address = {
  line1: "12 Market Road",
  line2: "",
  villageOrCity: "Bidar",
  district: "Bidar",
  state: "Karnataka",
  pincode: "585401",
};

const crop = ({
  id = IDS.cropA,
  name = "Tomato",
  price = 400,
  stock = 10,
  farmer = IDS.farmerA,
  farmerUser = IDS.farmerUserA,
} = {}) => ({
  _id: id,
  name,
  price,
  stockQuantity: stock,
  unit: "kg",
  farmer: { _id: farmer, user: farmerUser },
});

const quoteCropModel = (crops) => ({
  find: () => ({ populate: async () => crops }),
});

test("server-side quote ignores a malicious client total and uses database price", async () => {
  const service = createCheckoutService({ CropModel: quoteCropModel([crop()]) });
  const quote = await service.buildCheckoutQuote({
    items: [{ cropId: IDS.cropA, quantity: 2 }],
    deliveryAddress: address,
    total: 1,
  });

  assert.equal(quote.subtotalPaise, 80000);
  assert.equal(quote.amountPaise, 80000);
  assert.equal(quote.itemsSnapshot[0].priceAtOrder, 400);
});

test("INR totals are converted into integer paise", async () => {
  const service = createCheckoutService({
    CropModel: quoteCropModel([crop({ price: 499.5 })]),
  });
  const quote = await service.buildCheckoutQuote({
    items: [{ cropId: IDS.cropA, quantity: 1 }],
    deliveryAddress: address,
  });

  assert.equal(quote.amountPaise, 49950);
  assert.ok(Number.isInteger(quote.amountPaise));
});

test("duplicate cart crop IDs are consolidated before validation", () => {
  const items = normalizeCheckoutItems([
    { cropId: IDS.cropA, quantity: 1 },
    { cropId: IDS.cropA, quantity: 2 },
  ]);
  assert.deepEqual(items, [{ cropId: IDS.cropA, quantity: 3 }]);
});

test("invalid crop and invalid quantity are rejected", async () => {
  const service = createCheckoutService({ CropModel: quoteCropModel([]) });

  await assert.rejects(
    service.buildCheckoutQuote({
      items: [{ cropId: IDS.cropA, quantity: 1 }],
      deliveryAddress: address,
    }),
    (error) => error instanceof CheckoutError && error.statusCode === 404
  );
  assert.throws(
    () => normalizeCheckoutItems([{ cropId: IDS.cropA, quantity: 0 }]),
    CheckoutError
  );
});

test("out-of-stock items are rejected before any payment order is created", async () => {
  const service = createCheckoutService({
    CropModel: quoteCropModel([crop({ stock: 1 })]),
  });

  await assert.rejects(
    service.buildCheckoutQuote({
      items: [{ cropId: IDS.cropA, quantity: 2 }],
      deliveryAddress: address,
    }),
    (error) => error.code === "OUT_OF_STOCK" && error.statusCode === 409
  );
});

test("successful captured-payment finalization creates the existing Order shape", async () => {
  const crops = [crop()];
  const createdOrders = [];
  const CropModel = {
    find: async () => crops,
    updateOne: async () => ({ modifiedCount: 1 }),
    bulkWrite: async () => {},
  };
  const OrderModel = {
    create: async (payload) => {
      const order = {
        ...payload,
        _id: "64b000000000000000000051",
        placedAt: new Date("2026-08-30T10:00:00.000Z"),
      };
      createdOrders.push(order);
      return order;
    },
    find: () => ({
      sort: () => ({ populate: async () => createdOrders }),
    }),
    findByIdAndDelete: async () => {},
  };
  const service = createCheckoutService({ CropModel, OrderModel });

  const result = await service.finalizeCheckout({
    customer: IDS.customer,
    paymentAttemptId: IDS.attempt,
    itemsSnapshot: [
      {
        crop: IDS.cropA,
        cropName: "Tomato",
        unit: "kg",
        quantity: 2,
        priceAtOrder: 400,
        lineAmountPaise: 80000,
        farmer: IDS.farmerA,
        farmerUser: IDS.farmerUserA,
      },
    ],
    deliverySnapshot: address,
    razorpayOrderId: "order_test123",
    razorpayPaymentId: "pay_test123",
    verifiedAt: new Date("2026-08-30T09:59:00.000Z"),
  });

  assert.equal(result.orderIds.length, 1);
  assert.equal(createdOrders[0].paymentStatus, "VERIFIED");
  assert.equal(createdOrders[0].paymentMode, "test");
  assert.equal(createdOrders[0].razorpayPaymentId, "pay_test123");
  assert.equal(createdOrders[0].items[0].priceAtOrder, 400);
});

test("multi-farmer finalization rolls back stock and partial orders on failure", async () => {
  const restored = [];
  const deleted = [];
  let createCount = 0;
  const CropModel = {
    find: async () => [
      crop(),
      crop({
        id: IDS.cropB,
        name: "Mango",
        farmer: IDS.farmerB,
        farmerUser: IDS.farmerUserB,
      }),
    ],
    updateOne: async () => ({ modifiedCount: 1 }),
    bulkWrite: async (operations) => restored.push(...operations),
  };
  const OrderModel = {
    create: async (payload) => {
      createCount += 1;
      if (createCount === 2) {
        throw new Error("simulated order failure");
      }
      return { ...payload, _id: "64b000000000000000000052" };
    },
    findByIdAndDelete: async (id) => deleted.push(String(id)),
  };
  const service = createCheckoutService({ CropModel, OrderModel });
  const snapshots = [
    {
      crop: IDS.cropA,
      cropName: "Tomato",
      unit: "kg",
      quantity: 1,
      priceAtOrder: 400,
      lineAmountPaise: 40000,
      farmer: IDS.farmerA,
      farmerUser: IDS.farmerUserA,
    },
    {
      crop: IDS.cropB,
      cropName: "Mango",
      unit: "kg",
      quantity: 1,
      priceAtOrder: 400,
      lineAmountPaise: 40000,
      farmer: IDS.farmerB,
      farmerUser: IDS.farmerUserB,
    },
  ];

  await assert.rejects(
    service.finalizeCheckout({
      customer: IDS.customer,
      paymentAttemptId: IDS.attempt,
      itemsSnapshot: snapshots,
      deliverySnapshot: address,
      razorpayOrderId: "order_test123",
      razorpayPaymentId: "pay_test123",
      verifiedAt: new Date(),
    }),
    /simulated order failure/
  );
  assert.equal(restored.length, 2);
  assert.deepEqual(deleted, ["64b000000000000000000052"]);
});

test("stock changes after verified payment stop finalization before decrement", async () => {
  let decrementCalls = 0;
  const service = createCheckoutService({
    CropModel: {
      find: async () => [crop({ stock: 0 })],
      updateOne: async () => {
        decrementCalls += 1;
        return { modifiedCount: 1 };
      },
    },
    OrderModel: {},
  });

  await assert.rejects(
    service.finalizeCheckout({
      customer: IDS.customer,
      paymentAttemptId: IDS.attempt,
      itemsSnapshot: [
        {
          crop: IDS.cropA,
          quantity: 1,
          farmer: IDS.farmerA,
          farmerUser: IDS.farmerUserA,
        },
      ],
      deliverySnapshot: address,
      razorpayOrderId: "order_test123",
      razorpayPaymentId: "pay_test123",
      verifiedAt: new Date(),
    }),
    (error) => error.code === "RECONCILIATION_REQUIRED"
  );
  assert.equal(decrementCalls, 0);
});
