const assert = require("node:assert/strict");
const { test } = require("node:test");
const crypto = require("node:crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const User = require("../src/models/User");
const FarmerProfile = require("../src/models/FarmerProfile");
const Crop = require("../src/models/Crop");
const farmerRoutes = require("../src/routes/farmerRoutes");

// Real route/RBAC/DTO with read-only DB doubles; never touches demonstration data.
async function fixture(t, { missing = false, failure = false } = {}) {
  const secret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
  t.after(() => { if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret; });
  const reads = [];
  const query = (result) => ({
    select() { return this; }, sort() { return this; },
    lean: async () => { if (failure) throw Error("DB unavailable"); return result; },
  });
  t.mock.method(User, "findById", async (id) => ({ _id: id, role: id === "customer" ? "CUSTOMER" : "FARMER" }));
  t.mock.method(FarmerProfile, "findOne", (filter) => {
    reads.push(["profile", filter]);
    return query(missing ? null : { _id: "profile-" + filter.user, farmName: "Stored farm", bio: "Stored bio",
      location: { district: "Bidar", state: "Karnataka", privateAddress: "must-not-leak" },
      gallery: [{ _id: "image", url: "https://example.invalid/farm.jpg", publicId: "private" }],
      email: "private", password: "private", aiRecords: ["private"] });
  });
  t.mock.method(Crop, "find", (filter) => {
    reads.push(["crops", filter]);
    assert.equal(filter.removedAt, null);
    return query([{ _id: "listing", name: "Tomato", unit: "kg", stockQuantity: 100, farmer: filter.farmer,
      location: { district: "Bidar", state: "Karnataka", privateAddress: "hidden" },
      images: [{ publicId: "private" }], email: "private" }]);
  });
  for (const Model of [Crop, FarmerProfile]) {
    t.mock.method(Model, "create", () => { throw Error("Context must never write"); });
    t.mock.method(Model, "findOneAndUpdate", () => { throw Error("Context must never write"); });
  }
  const app = express();
  app.use(cookieParser()); app.use("/api/farmer", farmerRoutes);
  app.use((error, req, res, next) => res.status(503).json({ message: "Farm context unavailable" }));
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return { reads, request: async (user) => {
    const token = user ? jwt.sign({ userId: user }, process.env.JWT_SECRET) : "";
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/farmer/context?user=someone-else`, {
      headers: token ? { cookie: "token=" + token } : {}, signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, body: await response.json() };
  } };
}

test("farm context requires authentication and FARMER before any context read", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request()).status, 401);
  assert.equal((await f.request("customer")).status, 403);
  assert.equal(f.reads.length, 0);
});
test("context is session-owner scoped, excludes removed listings and private fields", async (t) => {
  const f = await fixture(t);
  const first = await f.request("farmer-one");
  assert.equal(first.status, 200);
  assert.deepEqual(f.reads, [["profile", { user: "farmer-one" }], ["crops", { farmer: "profile-farmer-one", removedAt: null }]]);
  assert.deepEqual(first.body.crops[0], { _id: "listing", name: "Tomato", unit: "kg", stockQuantity: 100, location: { district: "Bidar", state: "Karnataka" } });
  assert.deepEqual(first.body.profile.gallery, [{ _id: "image", url: "https://example.invalid/farm.jpg" }]);
  assert.doesNotMatch(JSON.stringify(first.body), /publicId|password|email|privateAddress|aiRecords/);
  const other = await f.request("farmer-two");
  assert.equal(other.body.profile._id, "profile-farmer-two");
});
test("missing profile is an empty context, not fabricated coordinates or crops", async (t) => {
  const f = await fixture(t, { missing: true });
  assert.deepEqual((await f.request("farmer")).body, { success: true, profile: null, crops: [] });
  assert.equal(f.reads.length, 1);
});
test("database failure follows normal error handling without synthetic context", async (t) => {
  const f = await fixture(t, { failure: true });
  assert.equal((await f.request("farmer")).status, 503);
});
