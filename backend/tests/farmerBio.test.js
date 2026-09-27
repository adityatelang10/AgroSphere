const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { beforeEach, describe, test } = require("node:test");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const User = require("../src/models/User");
const FarmerProfile = require("../src/models/FarmerProfile");
const Crop = require("../src/models/Crop");
const Review = require("../src/models/Review");
const farmerRoutes = require("../src/routes/farmerRoutes");

const FARMER = "64b000000000000000000001", OTHER = "64b000000000000000000002", CUSTOMER = "64b000000000000000000003";
const PROFILE = "64b000000000000000000011", OTHER_PROFILE = "64b000000000000000000012";

// Isolated persistence doubles; no demo database or Cloudinary operations.
describe("Farmer bio editing", { concurrency: false }, () => {
  let profiles, baseUrl, writes;
  const query = (get, populate = (value) => value) => {
    let populated = false;
    const q = { select() { return q; }, lean() { return q; }, sort() { return q; },
      populate() { populated = true; return q; },
      then(resolve, reject) { return Promise.resolve().then(get).then((value) => populated ? populate(value) : value).then(resolve, reject); },
    };
    return q;
  };
  const request = async (path, { user, body } = {}) => {
    const headers = { "content-type": "application/json" };
    if (user) headers.cookie = `token=${jwt.sign({ userId: user }, process.env.JWT_SECRET, { expiresIn: "5m" })}`;
    const response = await fetch(`${baseUrl}${path}`, {
      method: body === undefined ? "GET" : "PATCH", headers,
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, body: await response.json() };
  };

  beforeEach(async (t) => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
    t.after(() => { if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
    profiles = [
      { _id: PROFILE, user: FARMER, farmName: "Test Farm", location: { district: "Bidar", state: "Karnataka" }, bio: "Existing bio", gallery: [{ _id: "photo", url: "https://example.invalid/farm.jpg", publicId: "private-gallery-id" }] },
      { _id: OTHER_PROFILE, user: OTHER, bio: "Other farmer's bio", gallery: [] },
    ];
    t.mock.method(User, "findById", async (id) => ({ _id: id, role: id === CUSTOMER ? "CUSTOMER" : "FARMER" }));
    t.mock.method(FarmerProfile, "findOne", ({ user }) => query(() => profiles.find((profile) => profile.user === user)));
    t.mock.method(FarmerProfile, "findById", (id) => query(() => profiles.find((profile) => profile._id === id), (profile) => ({ ...profile, user: { name: "Test Farmer" } })));
    writes = t.mock.method(FarmerProfile, "findOneAndUpdate", async (filter, changes, options) => {
      assert.deepEqual(Object.keys(filter), ["user"]);
      assert.deepEqual(Object.keys(changes), ["$set"]);
      assert.deepEqual(Object.keys(changes.$set), ["bio"]);
      assert.deepEqual(options, { new: true, runValidators: true });
      const profile = profiles.find((record) => record.user === filter.user);
      if (!profile) return null;
      profile.bio = changes.$set.bio;
      return profile;
    });
    t.mock.method(Crop, "find", () => query(() => []));
    t.mock.method(Review, "aggregate", async () => []);
    const app = express(); app.use(cookieParser(), express.json());
    app.use("/api/farmer", farmerRoutes);
    app.use((error, req, res, next) => res.status(500).json({ message: error.message }));
    const server = await new Promise((resolve) => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
    t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  test("owner saves trimmed bio; subsequent own/public reads persist it and preserve gallery", async () => {
    const galleryBefore = JSON.stringify(profiles[0].gallery);
    const response = await request("/api/farmer/profile", { user: FARMER, body: { bio: "  Seasonal vegetables.\nGrown with care.  " } });
    assert.equal(response.status, 200);
    assert.equal(response.body.bio, "Seasonal vegetables.\nGrown with care.");
    assert.deepEqual(Object.keys(response.body).sort(), ["bio", "message", "success"]);
    assert.equal((await request("/api/farmer/profile", { user: FARMER })).body.profile.bio, response.body.bio);
    assert.equal((await request(`/api/farmer/public/${PROFILE}`)).body.profile.bio, response.body.bio);
    assert.equal(JSON.stringify(profiles[0].gallery), galleryBefore);
    assert.equal(profiles[0].farmName, "Test Farm");
  });
  test("empty/whitespace-only bio clears to empty for the existing public fallback", async () => {
    assert.equal((await request("/api/farmer/profile", { user: FARMER, body: { bio: " \n " } })).body.bio, "");
    assert.equal((await request(`/api/farmer/public/${PROFILE}`)).body.profile.bio, "");
  });
  test("500 characters accepted, 501 and non-string values rejected before writing", async () => {
    assert.equal((await request("/api/farmer/profile", { user: FARMER, body: { bio: "x".repeat(500) } })).status, 200);
    for (const bio of ["x".repeat(501), null, {}, [], 42]) {
      assert.equal((await request("/api/farmer/profile", { user: FARMER, body: { bio } })).status, 400);
    }
    assert.equal((await request("/api/farmer/profile", { user: FARMER, body: {} })).status, 400);
    assert.equal(writes.mock.callCount(), 1); assert.equal(profiles[0].bio.length, 500);
  });
  test("anonymous/customer denied; no authentication behavior changed", async () => {
    for (const [user, status] of [[undefined, 401], [CUSTOMER, 403]]) {
      assert.equal((await request("/api/farmer/profile", { user, body: { bio: "Not permitted" } })).status, status);
    }
    assert.equal(writes.mock.callCount(), 0); assert.equal(profiles[0].bio, "Existing bio");
  });
  test("forged profile/user IDs cannot target another farmer or change gallery/name", async () => {
    const original = JSON.stringify(profiles[0]);
    const response = await request("/api/farmer/profile", { user: OTHER, body: {
      bio: "Only my own bio", user: FARMER, _id: PROFILE, profileId: PROFILE, gallery: [], farmName: "Overwrite",
    } });
    assert.equal(response.status, 200); assert.equal(profiles[1].bio, "Only my own bio");
    assert.equal(JSON.stringify(profiles[0]), original);
  });
  test("missing farmer profile returns 404 without inventing farm data", async () => {
    profiles = [];
    assert.equal((await request("/api/farmer/profile", { user: FARMER, body: { bio: "My bio" } })).status, 404);
    assert.equal(profiles.length, 0);
  });
  test("schema enforces 500-character trimmed bio without migrating existing records", () => {
    const values = { user: FARMER, farmName: "Test Farm", location: { district: "Bidar", state: "Karnataka" } };
    const valid = new FarmerProfile({ ...values, bio: "  Farm bio  " });
    assert.equal(valid.bio, "Farm bio"); assert.equal(valid.validateSync(), undefined);
    assert.ok(new FarmerProfile({ ...values, bio: "x".repeat(501) }).validateSync().errors.bio);
  });
});
