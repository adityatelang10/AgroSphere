const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const { beforeEach, describe, test } = require("node:test");

const cookieParser = require("cookie-parser");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
// Reuse the existing frontend client for real transport tests; no extra package.
const { io: createClient } = require("../../frontend/node_modules/socket.io-client");

const User = require("../src/models/User");
const FarmerProfile = require("../src/models/FarmerProfile");
const Order = require("../src/models/Order");
const { authMiddleware } = require("../src/middleware/authMiddleware");
const { configureSocketAuthentication } = require("../src/middleware/socketAuthMiddleware");
const { createCheckoutService } = require("../src/services/checkoutService");
const { updateOrderStatus } = require("../src/controllers/orderController");
const authRoutes = require("../src/routes/authRoutes");

const FARMER = "64b000000000000000000021";
const CUSTOMER_A = "64b000000000000000000031";
const CUSTOMER_B = "64b000000000000000000032";
const PROFILE = "64b000000000000000000011";
const CROP = "64b000000000000000000001";
const ORDER = "64b000000000000000000051";
const ORIGIN = "http://localhost:5173";

const waitForEvent = (socket, name) => new Promise((resolve, reject) => {
  const listener = (value) => {
    clearTimeout(timer);
    resolve(value);
  };
  const timer = setTimeout(() => {
    socket.off(name, listener);
    reject(new Error(`Timed out waiting for ${name}`));
  }, 3000);
  socket.once(name, listener);
});

describe("Socket cookie authentication and notification isolation", { concurrency: false }, () => {
  let io;
  let baseUrl;
  let clients;
  let users;

  beforeEach(async (t) => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
    t.after(() => {
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    });

    users = new Map([
      [FARMER, { _id: FARMER, role: "FARMER" }],
      [CUSTOMER_A, { _id: CUSTOMER_A, role: "CUSTOMER" }],
      [CUSTOMER_B, { _id: CUSTOMER_B, role: "CUSTOMER" }],
    ]);
    t.mock.method(User, "findById", async (id) => users.get(String(id)) || null);

    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use("/api/auth", authRoutes);
    app.get("/health", (req, res) => res.json({ success: true }));
    app.get("/session", authMiddleware, (req, res) =>
      res.json({ id: String(req.user._id), role: req.user.role }));
    const server = http.createServer(app);
    io = new Server(server, { cors: { origin: ORIGIN, credentials: true } });
    configureSocketAuthentication(io);
    // Test-only acknowledgement establishes that earlier attack packets were processed.
    io.on("connection", (socket) => socket.on("test:barrier", (ack) => ack()));
    clients = [];
    t.after(async () => {
      clients.forEach((client) => client.disconnect());
      await new Promise((resolve) => io.close(resolve));
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  const tokenFor = (userId, options = {}) => jwt.sign(
    { userId, role: "UNTRUSTED_CLIENT_ROLE" },
    process.env.JWT_SECRET,
    { expiresIn: "5m", ...options }
  );

  const makeClient = (token, options = {}) => {
    const client = createClient(baseUrl, {
      autoConnect: false,
      reconnection: false,
      transports: ["websocket"],
      withCredentials: true,
      // Node test clients have no browser cookie jar; emulate the Cookie header.
      extraHeaders: { Origin: ORIGIN, ...(token ? { cookie: `token=${token}` } : {}) },
      ...options,
    });
    clients.push(client);
    return client;
  };

  const connect = async (userId, options = {}) => {
    const client = makeClient(tokenFor(userId), options);
    const connected = waitForEvent(client, "connect");
    client.connect();
    await connected;
    return client;
  };

  const expectRejected = async (client) => {
    const failed = waitForEvent(client, "connect_error");
    client.connect();
    const error = await failed;
    assert.equal(error.message, "Authentication required");
    assert.equal(error.data, undefined);
    assert.equal(client.connected, false);
    assert.equal(io.of("/").sockets.size, 0);
  };

  const userRooms = (client) => [...io.of("/").sockets.get(client.id).rooms]
    .filter((room) => room.startsWith("user:"));

  const drainEvents = async () => {
    await Promise.all(clients.filter((client) => client.connected).map(async (client) => {
      const delivered = waitForEvent(client, "test:drain");
      io.to(client.id).emit("test:drain");
      await delivered;
    }));
  };

  test("anonymous socket is rejected", async () => expectRejected(makeClient()));

  test("query IDs and auth-payload JWTs cannot replace the cookie", async () => {
    await expectRejected(makeClient(undefined, {
      query: { userId: CUSTOMER_A },
      auth: { userId: CUSTOMER_A, token: tokenFor(CUSTOMER_A) },
    }));
  });

  test("invalid token is rejected safely", async () => expectRejected(makeClient("not-a-jwt")));

  test("wrongly signed token is rejected", async () => {
    await expectRejected(makeClient(jwt.sign({ userId: CUSTOMER_A }, "different-test-secret")));
  });

  test("expired token is rejected", async () => {
    await expectRejected(makeClient(tokenFor(CUSTOMER_A, { expiresIn: -1 })));
  });

  test("not-yet-valid token is rejected", async () => {
    await expectRejected(makeClient(tokenFor(CUSTOMER_A, { notBefore: "1h" })));
  });

  test("a deleted user is rejected even with a valid issued token", async () => {
    const token = tokenFor(CUSTOMER_A);
    users.delete(CUSTOMER_A);
    await expectRejected(makeClient(token));
  });

  test("unsupported database role is rejected", async () => {
    users.set(CUSTOMER_A, { _id: CUSTOMER_A, role: "ADMIN" });
    await expectRejected(makeClient(tokenFor(CUSTOMER_A)));
  });

  test("database failures do not expose internal details", async (t) => {
    t.mock.method(User, "findById", async () => { throw new Error("private database detail"); });
    await expectRejected(makeClient(tokenFor(CUSTOMER_A)));
  });

  test("missing secret rejects the socket safely", async () => {
    const token = tokenFor(CUSTOMER_A);
    delete process.env.JWT_SECRET;
    await expectRejected(makeClient(token));
  });

  for (const [id, role] of [[FARMER, "FARMER"], [CUSTOMER_A, "CUSTOMER"]]) {
    test(`valid ${role} joins only its database-derived user room`, async () => {
      const client = await connect(id);
      assert.deepEqual(userRooms(client), [`user:${id}`]);
      assert.deepEqual(io.of("/").sockets.get(client.id).data, { user: { id, role } });
    });
  }

  test("cookie parsing supports other cookies and encoded token values", async () => {
    const client = await connect(FARMER, {
      extraHeaders: { Origin: ORIGIN, cookie: `theme=dark; token=${encodeURIComponent(tokenFor(FARMER))}; other=value` },
    });
    assert.deepEqual(userRooms(client), [`user:${FARMER}`]);
  });

  test("polling also authenticates with credentialed restricted CORS", async () => {
    const client = await connect(CUSTOMER_A, { transports: ["polling"] });
    assert.deepEqual(userRooms(client), [`user:${CUSTOMER_A}`]);
    const response = await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling`, {
      method: "OPTIONS", headers: { Origin: ORIGIN, "Access-Control-Request-Method": "GET" },
    });
    assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  });

  test("spoofed query/auth IDs and join:user cannot enter another user room", async () => {
    const attacker = await connect(CUSTOMER_A, {
      query: { userId: CUSTOMER_B }, auth: { userId: CUSTOMER_B, role: "FARMER" },
    });
    const victim = await connect(CUSTOMER_B);
    const attackerEvents = [];
    const victimEvents = [];
    attacker.on("orderStatusUpdated", (payload) => attackerEvents.push(payload));
    victim.on("orderStatusUpdated", (payload) => victimEvents.push(payload));
    attacker.emit("join:user", CUSTOMER_B);
    attacker.emit("join:user", FARMER);
    await attacker.timeout(2000).emitWithAck("test:barrier");
    assert.deepEqual(userRooms(attacker), [`user:${CUSTOMER_A}`]);
    const payload = { orderId: ORDER, status: "Confirmed" };
    io.to(`user:${CUSTOMER_B}`).emit("orderStatusUpdated", payload);
    await drainEvents();
    assert.deepEqual(attackerEvents, []);
    assert.deepEqual(victimEvents, [payload]);
  });

  test("each reconnect rechecks database user existence", async () => {
    const client = await connect(CUSTOMER_A);
    const disconnected = waitForEvent(io.of("/").sockets.get(client.id), "disconnect");
    client.disconnect();
    await disconnected;
    users.delete(CUSTOMER_A);
    await expectRejected(client);
  });

  test("HTTP cookie authentication remains compatible and socket rejection leaves HTTP working", async () => {
    await expectRejected(makeClient("invalid"));
    assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
    for (const id of [FARMER, CUSTOMER_A]) {
      const response = await fetch(`${baseUrl}/session`, { headers: { Cookie: `token=${tokenFor(id)}` } });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { id, role: users.get(id).role });
    }
    for (const token of [null, "invalid", tokenFor(CUSTOMER_A, { expiresIn: -1 })]) {
      const response = await fetch(`${baseUrl}/session`, { headers: token ? { Cookie: `token=${token}` } : {} });
      assert.equal(response.status, 401);
    }
  });

  test("login issues an HTTP-only cookie usable by sockets; logout clears that cookie", async (t) => {
    const bcrypt = require("bcrypt");
    const password = "SocketFixture42";
    const passwordHash = await bcrypt.hash(password, 4);
    t.mock.method(User, "findOne", () => ({
      select: async () => ({
        ...users.get(CUSTOMER_A), name: "Socket test customer", email: "socket@example.test",
        comparePassword: (candidate) => bcrypt.compare(candidate, passwordHash),
      }),
    }));
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "socket@example.test", password }),
    });
    assert.equal(loginResponse.status, 200);
    const setCookie = loginResponse.headers.get("set-cookie");
    // Boolean assertions avoid including a token in test failure output.
    assert.ok(setCookie.includes("HttpOnly"));
    assert.ok(setCookie.includes("SameSite=Lax"));
    const cookie = setCookie.split(";")[0];
    const client = makeClient(undefined, { extraHeaders: { Origin: ORIGIN, cookie } });
    const connected = waitForEvent(client, "connect");
    client.connect();
    await connected;
    assert.deepEqual(userRooms(client), [`user:${CUSTOMER_A}`]);
    assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie } })).status, 200);
    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST", headers: { cookie },
    });
    assert.equal(logoutResponse.status, 200);
    assert.ok(logoutResponse.headers.get("set-cookie").startsWith("token=;"));
    const disconnected = waitForEvent(io.of("/").sockets.get(client.id), "disconnect");
    client.disconnect();
    await disconnected;
    await expectRejected(makeClient());
    assert.equal((await fetch(`${baseUrl}/api/auth/me`)).status, 401);
  });

  test("checkout's existing orderPlaced publisher reaches only the intended farmer", async () => {
    const farmer = await connect(FARMER);
    const customer = await connect(CUSTOMER_A);
    const received = [];
    const unexpected = [];
    farmer.on("orderPlaced", (payload) => received.push(payload));
    customer.on("orderPlaced", (payload) => unexpected.push(payload));
    const orders = [];
    const service = createCheckoutService({
      CropModel: {
        find: async () => [{ _id: CROP, stockQuantity: 100, farmer: { _id: PROFILE, user: FARMER } }],
        updateOne: async () => ({ modifiedCount: 1 }),
      },
      OrderModel: {
        create: async (payload) => {
          const order = { ...payload, _id: ORDER, placedAt: new Date("2026-09-12T10:00:00Z") };
          orders.push(order);
          return order;
        },
        find: () => ({ sort: () => ({ populate: async () => orders }) }),
      },
    });
    await service.finalizeCheckout({
      customer: CUSTOMER_A,
      paymentAttemptId: "64b000000000000000000041",
      itemsSnapshot: [{ crop: CROP, farmer: PROFILE, farmerUser: FARMER, quantity: 2, priceAtOrder: 40 }],
      deliverySnapshot: {}, razorpayOrderId: "order_fixture", razorpayPaymentId: "pay_fixture",
      verifiedAt: new Date(), io,
    });
    await drainEvents();
    assert.equal(received.length, 1);
    assert.equal(received[0].orderId, ORDER);
    assert.equal(received[0].status, "Pending");
    assert.equal(received[0].paymentMode, "test");
    assert.deepEqual(received[0].customer, { id: CUSTOMER_A });
    assert.deepEqual(unexpected, []);
  });

  test("order status publisher reaches only the intended customer", async (t) => {
    const farmer = await connect(FARMER);
    const customer = await connect(CUSTOMER_A);
    const otherCustomer = await connect(CUSTOMER_B);
    const received = [];
    const unexpected = [];
    customer.on("orderStatusUpdated", (payload) => received.push(payload));
    [farmer, otherCustomer].forEach((client) => client.on("orderStatusUpdated", (payload) => unexpected.push(payload)));
    const order = { _id: ORDER, customer: CUSTOMER_A, status: "Pending", save: async () => {} };
    t.mock.method(FarmerProfile, "findOne", async () => ({ _id: PROFILE }));
    t.mock.method(Order, "findOne", async () => order);
    t.mock.method(Order, "findById", () => ({ populate: async () => order }));
    const response = { status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await updateOrderStatus({
      user: users.get(FARMER), params: { orderId: ORDER }, body: { status: "Confirmed" },
      app: { get: () => io },
    }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 200);
    await drainEvents();
    assert.deepEqual(received, [{ orderId: ORDER, status: "Confirmed", message: "Your order status is now Confirmed." }]);
    assert.deepEqual(unexpected, []);
  });
});
