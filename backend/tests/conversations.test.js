const assert = require("node:assert/strict");
const { beforeEach, describe, test } = require("node:test");
const http = require("node:http");
const crypto = require("node:crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const { io: clientIO } = require("../../frontend/node_modules/socket.io-client");
const User = require("../src/models/User");
const Conversation = require("../src/models/Conversation");
const Message = require("../src/models/Message");
const { createConversationService } = require("../src/services/conversationService");
const { createConversationRouter } = require("../src/routes/conversationRoutes");
const { configureSocketAuthentication } = require("../src/middleware/socketAuthMiddleware");
const { configureConversationSocket } = require("../src/services/conversationSocket");
const { makeConversationStore } = require("./helpers/conversationStore");
const CUSTOMER = "64b000000000000000000001", FARMER = "64b000000000000000000002", OUTSIDER = "64b000000000000000000003", OTHER_FARMER = "64b000000000000000000004";
const PROFILE = "64b000000000000000000011", CROP = "64b000000000000000000021";
const actor = (id) => ({ id, role: [FARMER, OTHER_FARMER].includes(id) ? "FARMER" : "CUSTOMER" });
const wait = (socket, event) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { socket.off(event, done); reject(Error(`Timeout: ${event}`)); }, 3000);
  function done(value) { clearTimeout(timer); resolve(value); } socket.once(event, done);
});

describe("Participant-only customer/farmer chat", { concurrency: false }, () => {
  let store, service, url, io, clients;
  const token = (id) => jwt.sign({ userId: id }, process.env.JWT_SECRET, { expiresIn: "5m" });
  const request = async (path = "", { user = CUSTOMER, method = "GET", body } = {}) => {
    const response = await fetch(`${url}/api/conversations${path}`, { method,
      headers: { "content-type": "application/json", ...(user ? { cookie: `token=${token(user)}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    return { status: response.status, body: await response.json() };
  };
  const start = async () => (await request("", { method: "POST", body: { farmerProfileId: PROFILE, cropId: CROP } })).body.conversation;
  const send = (id, text = "Hi, is this tomato available?", user = CUSTOMER, key = crypto.randomUUID()) => request(`/${id}/messages`, { user, method: "POST", body: { text, clientMessageId: key, sender: OUTSIDER, senderRole: "ADMIN" } });
  const connect = async (id) => {
    const socket = clientIO(url, { autoConnect: false, reconnection: false, transports: ["websocket"], extraHeaders: id ? { cookie: `token=${token(id)}` } : {} });
    clients.push(socket); const event = wait(socket, id ? "connect" : "connect_error"); socket.connect(); await event; return socket;
  };
  const emit = (socket, event, data) => new Promise((resolve, reject) => socket.timeout(3000).emit(event, data, (error, result) => error ? reject(error) : resolve(result)));
  beforeEach(async (t) => {
    const previousSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
    t.after(() => { if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
    store = makeConversationStore();
    store.state.users = [CUSTOMER, FARMER, OUTSIDER, OTHER_FARMER].map((id) => ({ _id: id, ...actor(id), name: id === FARMER ? "Test farmer" : "Test customer",
      email: "private@example.invalid", password: "not-real", profileImage: { url: "https://example.invalid/avatar.jpg", publicId: "private" } }));
    store.state.farms = [{ _id: PROFILE, user: FARMER, farmName: "Test farm", phone: "private" }];
    store.state.crops = [{ _id: CROP, farmer: PROFILE, name: "Tomato", price: 40, unit: "kg", removedAt: null, images: [{ url: "https://example.invalid/tomato.jpg", publicId: "private" }] }];
    t.mock.method(User, "findById", async (id) => store.state.users.find((u) => u._id === String(id)) || null);
    service = createConversationService(store.models);
    const app = express(); app.use(express.json(), cookieParser());
    const server = http.createServer(app); io = new Server(server); app.set("io", io);
    configureSocketAuthentication(io); configureConversationSocket(io, service);
    app.use("/api/conversations", createConversationRouter(service));
    clients = []; t.after(async () => { clients.forEach((s) => s.disconnect()); await new Promise((resolve) => io.close(resolve)); });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); url = `http://127.0.0.1:${server.address().port}`;
  });

  test("customer creates and reuses one farmer pair, optional context is a reference", async () => {
    const first = await start(); const second = await start();
    assert.equal(first._id, second._id); assert.equal(store.state.conversations.length, 1);
    assert.equal(first.cropContext.name, "Tomato"); assert.equal(String(store.state.conversations[0].cropContext), CROP);
    assert.equal((await request("", { method: "POST", body: { farmerProfileId: PROFILE } })).body.conversation._id, first._id);
  });
  test("creation checks real target role and crop owner; rejects bad IDs and farmer initiators", async () => {
    assert.equal((await request("", { method: "POST", user: FARMER, body: { farmerProfileId: PROFILE } })).status, 403);
    for (const body of [{ farmerProfileId: "bad" }, { farmerProfileId: { $ne: null } }, { farmerProfileId: PROFILE, cropId: OUTSIDER }]) assert.equal((await request("", { method: "POST", body })).status, 400);
    store.state.users.find((u) => u._id === FARMER).role = "CUSTOMER";
    assert.equal((await request("", { method: "POST", body: { farmerProfileId: PROFILE } })).status, 404);
  });
  test("both participants list only their own chats; outsider and another farmer see none", async () => {
    const c = await start();
    for (const user of [CUSTOMER, FARMER]) assert.equal((await request("", { user })).body.conversations[0]._id, c._id);
    for (const user of [OUTSIDER, OTHER_FARMER]) assert.equal((await request("", { user })).body.conversations.length, 0);
    assert.equal((await request("", { user: null })).status, 401);
  });
  test("outsiders cannot fetch, send or mark read; malformed IDs rejected", async () => {
    const c = await start();
    for (const user of [OUTSIDER, OTHER_FARMER]) {
      assert.equal((await request(`/${c._id}/messages`, { user })).status, 404);
      assert.equal((await send(c._id, "attack", user)).status, 404);
      assert.equal((await request(`/${c._id}/read`, { user, method: "PATCH", body: { throughMessageId: CROP } })).status, 404);
    }
    assert.equal((await request("/bad/messages")).status, 400); assert.equal(store.state.messages.length, 0);
  });
  test("message persists, sender comes from session, preview updated, no private DTO fields", async () => {
    const c = await start(); const result = await send(c._id, "  Fresh?  ");
    assert.equal(result.status, 200); assert.equal(result.body.message.text, "Fresh?");
    assert.equal(result.body.message.sender, CUSTOMER); assert.equal(result.body.message.senderRole, "CUSTOMER");
    assert.equal(store.state.messages.length, 1); assert.equal(store.state.conversations[0].lastMessage, "Fresh?");
    const history = await request(`/${c._id}/messages`); assert.equal(history.body.messages[0]._id, result.body.message._id);
    const all = JSON.stringify([history.body, (await request()).body]);
    for (const privateField of ["email", "password", "phone", "publicId", "clientMessageId", "authVersion"]) assert.ok(!all.includes(`"${privateField}"`));
  });
  test("empty, too long and non-text messages rejected; max-length and escaped plain text allowed", async () => {
    const c = await start();
    for (const text of ["", " \n ", "x".repeat(2001), null, {}, "x\u0000y"]) assert.equal((await send(c._id, text)).status, 400);
    assert.equal((await send(c._id, "x".repeat(2000))).status, 200);
    assert.equal((await send(c._id, "<script>plain text only</script>")).status, 200);
  });
  test("idempotent retry and simultaneous duplicate requests persist only once", async () => {
    const c = await start(); const key = crypto.randomUUID();
    const results = await Promise.all([send(c._id, "hello", CUSTOMER, key), send(c._id, "hello", CUSTOMER, key)]);
    assert.equal(results[0].body.message._id, results[1].body.message._id); assert.equal(store.state.messages.length, 1);
    assert.equal((await send(c._id, "different", CUSTOMER, key)).status, 409);
  });
  test("unread excludes own messages; read boundary doesn't swallow later messages", async () => {
    const c = await start(); const first = (await send(c._id)).body.message;
    await send(c._id, "second");
    assert.equal((await request()).body.unreadCount, 0);
    assert.equal((await request("", { user: FARMER })).body.unreadCount, 2);
    assert.equal((await request(`/${c._id}/read`, { user: FARMER, method: "PATCH", body: { throughMessageId: first._id } })).status, 200);
    assert.equal((await request("", { user: FARMER })).body.unreadCount, 1);
    assert.equal((await request("", { user: FARMER })).body.conversations[0].unreadCount, 1);
    assert.equal((await request(`/${c._id}/read`, { user: FARMER, method: "PATCH", body: { throughMessageId: CROP } })).status, 400);
  });
  test("history is bounded to 50, oldest-to-newest, with non-overlapping earlier cursor", async () => {
    const c = await start();
    for (let i = 0; i < 55; i++) await service.send(actor(CUSTOMER), c._id, { text: String(i), clientMessageId: `message-${i}` });
    const recent = (await request(`/${c._id}/messages`)).body;
    assert.equal(recent.messages.length, 50); assert.equal(recent.hasMore, true); assert.equal(recent.messages[0].text, "5");
    const early = (await request(`/${c._id}/messages?before=${recent.messages[0]._id}`)).body;
    assert.equal(early.messages.length, 5); assert.equal(early.hasMore, false); assert.equal(early.messages[0].text, "0");
  });
  test("soft-removed crop context stays readable without changing crop or order data", async () => {
    const c = await start(); store.state.crops[0].removedAt = new Date();
    assert.equal((await request(`/${c._id}/messages`)).body.conversation.cropContext.removed, true);
    assert.equal((await send(c._id)).status, 200);
    assert.equal((await request("", { method: "POST", body: { farmerProfileId: PROFILE, cropId: CROP } })).status, 400);
  });
  test("socket cookie auth rejects anonymous; outsider cannot join/send/read/emit typing", async () => {
    const anonymous = await connect(null); assert.equal(anonymous.connected, false);
    const c = await start(); const outsider = await connect(OUTSIDER);
    for (const event of ["conversation:join", "message:send", "conversation:read", "conversation:typing"]) {
      const result = await emit(outsider, event, { conversationId: c._id, text: "attack", clientMessageId: crypto.randomUUID(), throughMessageId: CROP, typing: true });
      assert.equal(result.success, false);
    }
    assert.equal(io.sockets.adapter.rooms.get(`conversation:${c._id}`), undefined);
  });
  test("real sockets persist before emission, union rooms emit once, read receipts and reconnect retain history", async () => {
    const c = await start(); const customer = await connect(CUSTOMER), farmer = await connect(FARMER), outsider = await connect(OUTSIDER);
    await emit(customer, "conversation:join", { conversationId: c._id }); await emit(farmer, "conversation:join", { conversationId: c._id });
    let events = 0, leaked = 0; farmer.on("message:new", () => events++); outsider.on("message:new", () => leaked++);
    const received = wait(farmer, "message:new");
    const result = await emit(customer, "message:send", { conversationId: c._id, text: "Real time", clientMessageId: crypto.randomUUID(), sender: OUTSIDER });
    assert.equal(result.success, true); assert.equal((await received)._id, result.message._id); assert.equal(store.state.messages.length, 1);
    const receipt = wait(customer, "conversation:read");
    assert.equal((await emit(farmer, "conversation:read", { conversationId: c._id, throughMessageId: result.message._id })).success, true);
    assert.equal((await receipt).readerId, FARMER); assert.equal(events, 1); assert.equal(leaked, 0);
    farmer.disconnect(); const reconnected = await connect(FARMER);
    assert.equal((await emit(reconnected, "conversation:join", { conversationId: c._id })).success, true);
    assert.equal((await request(`/${c._id}/messages`, { user: FARMER })).body.messages.length, 1);
  });
  test("long-lived socket session is revalidated after account session invalidation", async () => {
    const c = await start(), customer = await connect(CUSTOMER);
    store.state.users.find((u) => u._id === CUSTOMER).authVersion = 1;
    const result = await emit(customer, "message:send", { conversationId: c._id, text: "expired", clientMessageId: crypto.randomUUID() });
    assert.equal(result.success, false); assert.equal(store.state.messages.length, 0);
  });
  test("temporary transport loss reconnects and rejoins without duplicating saved messages", async () => {
    const c = await start(), customer = await connect(CUSTOMER);
    customer.io.reconnection(true); customer.io.reconnectionDelay(10);
    await emit(customer, "conversation:join", { conversationId: c._id });
    const saved = await emit(customer, "message:send", { conversationId: c._id, text: "Reconnect test", clientMessageId: crypto.randomUUID() });
    const reconnected = wait(customer, "connect");
    io.sockets.sockets.get(customer.id).conn.close();
    await reconnected;
    assert.equal((await emit(customer, "conversation:join", { conversationId: c._id })).success, true);
    const history = (await request(`/${c._id}/messages`)).body;
    assert.equal(history.messages.length, 1); assert.equal(history.messages[0]._id, saved.message._id);
  });
  test("schema indexes enforce pair uniqueness, retry uniqueness and bounded history access", () => {
    assert.ok(Conversation.schema.indexes().some(([keys, opts]) => keys.customer && keys.farmer && opts.unique));
    assert.ok(Message.schema.indexes().some(([keys, opts]) => keys.clientMessageId && keys.sender && opts.unique));
    assert.ok(Message.schema.indexes().some(([keys]) => keys.conversation && keys._id));
  });
});
