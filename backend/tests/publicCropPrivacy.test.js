const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Writable } = require("node:stream");
const { beforeEach, describe, test } = require("node:test");

const cookieParser = require("cookie-parser");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const Crop = require("../src/models/Crop");
const FarmerProfile = require("../src/models/FarmerProfile");
const User = require("../src/models/User");
const { cloudinary } = require("../src/config/cloudinary");
const cropRoutes = require("../src/routes/cropRoutes");
const traceabilityRoutes = require("../src/routes/traceabilityRoutes");
const { serializePublicCrop } = require("../src/utils/publicCrop");

const CROP_ID = "64b000000000000000000001";
const PROFILE_ID = "64b000000000000000000011";
const FARMER_ID = "64b000000000000000000021";
const OTHER_FARMER_ID = "64b000000000000000000022";
const CUSTOMER_ID = "64b000000000000000000031";
const TRACE_ID = "AGS-TOM-0123456789ABCDEF";
const CROP_URL = "https://example.com/tomato.jpg";
const PROFILE_URL = "https://example.com/farmer.jpg";

// Synthetic fixtures only: no database connection, uploads or real account data.
const privateFields = {
  email: "private@example.com",
  password: "private-password-hash",
  deliveryAddress: { line1: "private address" },
  phone: "private phone",
  jwt: "private token",
  secret: "private secret",
  privateAccountData: "future private field",
  __v: 2,
};

const assertPublicOnly = (value) => {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(![...Object.keys(privateFields), "publicId", "role", "aiRecords"].includes(key),
      `Public response contains forbidden key: ${key}`);
    assertPublicOnly(child);
  }
};

describe("Public crop response privacy", { concurrency: false }, () => {
  let baseUrl;
  let storedCrop;
  let farmer;
  let populations;
  let filters;
  let sorts;
  let save;
  let remove;
  let destroy;

  const populatedCrop = () => storedCrop && { ...storedCrop, farmer };

  const query = (result, populated = result) => {
    let resolveResult = result;
    return {
      populate(selection) {
        populations.push(selection);
        resolveResult = populated;
        return this;
      },
      select() { return this; },
      sort(selection) { sorts.push(selection); return this; },
      then(resolve, reject) { return Promise.resolve(resolveResult()).then(resolve, reject); },
    };
  };

  const request = async (path, { method = "GET", userId, body } = {}) => {
    const headers = {};
    if (userId) {
      const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "5m" });
      headers.cookie = `token=${token}`;
    }
    if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, body: await response.json() };
  };

  beforeEach(async (t) => {
    const testEnvironment = {
      JWT_SECRET: crypto.randomBytes(32).toString("hex"),
      CLOUDINARY_CLOUD_NAME: "test-only",
      CLOUDINARY_API_KEY: "test-only",
      CLOUDINARY_API_SECRET: "test-only",
    };
    for (const [key, value] of Object.entries(testEnvironment)) {
      const previous = process.env[key];
      process.env[key] = value;
      t.after(() => {
        if (previous === undefined) delete process.env[key];
        else process.env[key] = previous;
      });
    }

    populations = [];
    filters = [];
    sorts = [];
    farmer = {
      ...privateFields,
      _id: new mongoose.Types.ObjectId(PROFILE_ID),
      farmName: "Example Farm",
      location: { district: "Bidar", state: "Karnataka", ...privateFields },
      bio: "A public farm description",
      averageRating: 4,
      totalReviews: 2,
      user: {
        ...privateFields,
        _id: new mongoose.Types.ObjectId(FARMER_ID),
        name: "Example Farmer",
        role: "FARMER",
        profileImage: { url: PROFILE_URL, publicId: "private-profile-image" },
      },
    };
    save = t.mock.fn(async () => storedCrop);
    remove = t.mock.fn(async () => { storedCrop = null; });
    storedCrop = {
      ...privateFields,
      _id: new mongoose.Types.ObjectId(CROP_ID),
      farmer: new mongoose.Types.ObjectId(PROFILE_ID),
      name: "Tomato",
      category: "Vegetables",
      description: "Fresh field tomatoes",
      price: 40,
      unit: "kg",
      stockQuantity: 100,
      season: "Kharif",
      isOrganic: false,
      harvestDate: null,
      traceabilityId: TRACE_ID,
      images: [{ url: CROP_URL, publicId: "private-crop-image" }],
      location: { district: "Bidar", state: "Karnataka", ...privateFields },
      averageRating: 4,
      totalReviews: 2,
      createdAt: new Date("2026-08-20T00:00:00.000Z"),
      updatedAt: new Date("2026-08-21T00:00:00.000Z"),
      aiRecords: { private: true },
      save,
      deleteOne: remove,
    };

    t.mock.method(Crop, "find", (filter) => {
      filters.push(filter);
      return query(() => storedCrop ? [populatedCrop()] : []);
    });
    t.mock.method(Crop, "findById", (id) => query(
      () => String(id) === CROP_ID ? storedCrop : null,
      () => String(id) === CROP_ID ? populatedCrop() : null
    ));
    t.mock.method(Crop, "findOne", ({ traceabilityId }) => query(
      () => traceabilityId === storedCrop?.traceabilityId ? populatedCrop() : null
    ));
    t.mock.method(Crop, "exists", async () => false);
    t.mock.method(Crop, "create", async (payload) => {
      storedCrop = { ...storedCrop, ...payload };
      return storedCrop;
    });
    t.mock.method(FarmerProfile, "findOne", async ({ user }) => ({
      _id: new mongoose.Types.ObjectId(String(user) === FARMER_ID
        ? PROFILE_ID : "64b000000000000000000012"),
    }));
    t.mock.method(User, "findById", async (id) => ({
      _id: id, name: "Example Farmer", role: id === CUSTOMER_ID ? "CUSTOMER" : "FARMER",
    }));
    destroy = t.mock.method(cloudinary.uploader, "destroy", async () => ({ result: "ok" }));
    t.mock.method(cloudinary.uploader, "upload_stream", (options, callback) => new Writable({
      write(chunk, encoding, done) { done(); },
      final(done) {
        callback(null, { secure_url: CROP_URL, public_id: "new-private-image" });
        done();
      },
    }));

    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use("/api/crops", cropRoutes);
    app.use("/api/traceability", traceabilityRoutes);
    app.use((error, req, res, next) => res.status(500).json({ message: error.message }));
    const server = await new Promise((resolve, reject) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
      listening.once("error", reject);
    });
    t.after(() => new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    }));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  test("anonymous crop list is 200 with display fields and no private metadata", async () => {
    const result = await request("/api/crops");
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.count, 1);
    const crop = result.body.crops[0];
    assert.equal(crop.farmer.user.name, "Example Farmer");
    assert.deepEqual(crop.farmer.user.profileImage, { url: PROFILE_URL });
    assert.deepEqual(crop.images, [{ url: CROP_URL }]);
    assert.equal(crop._id, CROP_ID);
    assert.equal(crop.farmer._id, PROFILE_ID);
    assert.equal(crop.farmer.user._id, FARMER_ID); // My Crops filter still works.
    assert.equal(crop.traceabilityId, TRACE_ID);
    assert.equal(crop.farmer.bio, farmer.bio);
    assert.equal(crop.farmer.averageRating, 4);
    assertPublicOnly(result.body);
    assert.equal(populations[0].populate.select, "name profileImage.url");
  });

  test("anonymous crop detail is 200 with URLs and no email or private User fields", async () => {
    const result = await request(`/api/crops/${CROP_ID}`);
    assert.equal(result.status, 200);
    assert.equal(result.body.crop.farmer.user.name, "Example Farmer");
    assert.deepEqual(result.body.crop.farmer.user.profileImage, { url: PROFILE_URL });
    assert.deepEqual(result.body.crop.images, [{ url: CROP_URL }]);
    assertPublicOnly(result.body);
    assert.equal(populations[0].populate.select, "name profileImage.url");
  });

  test("list and detail use the same public shape without mutating internal images", async () => {
    const before = JSON.stringify(populatedCrop());
    const list = await request("/api/crops");
    const detail = await request(`/api/crops/${CROP_ID}`);
    assert.deepEqual(list.body.crops[0], detail.body.crop);
    assert.equal(JSON.stringify(populatedCrop()), before);
    assert.equal(storedCrop.images[0].publicId, "private-crop-image");
    assert.equal(farmer.user.profileImage.publicId, "private-profile-image");
  });

  test("marketplace filters and sort are preserved", async () => {
    const result = await request("/api/crops?category=Vegetables&minPrice=10&maxPrice=80&isOrganic=false");
    assert.equal(result.status, 200);
    assert.deepEqual(filters[0].price, { $gte: 10, $lte: 80 });
    assert.equal(filters[0].isOrganic, false);
    assert.ok(filters[0].category.test("Vegetables"));
    assert.deepEqual(sorts[0], { createdAt: -1 });
    await request("/api/crops?search=tomato");
    assert.deepEqual(filters[1].$text, { $search: "tomato" });
    assert.deepEqual(sorts[1], { score: { $meta: "textScore" } });
  });

  test("unknown crop is still 404 and invalid crop id is still 400", async () => {
    assert.equal((await request("/api/crops/64b000000000000000000099")).status, 404);
    assert.equal((await request("/api/crops/not-an-id")).status, 400);
  });

  test("missing farmer, user or photos does not break public listing", async () => {
    farmer.user = null;
    storedCrop.images = [];
    let result = await request("/api/crops");
    assert.equal(result.status, 200);
    assert.equal(result.body.crops[0].farmer.user, null);
    assert.deepEqual(result.body.crops[0].images, []);
    farmer = null;
    result = await request(`/api/crops/${CROP_ID}`);
    assert.equal(result.status, 200);
    assert.equal(result.body.crop.farmer, null);
  });

  test("serializer also handles populated Mongoose documents", () => {
    const crop = Crop.hydrate(storedCrop);
    const profile = FarmerProfile.hydrate(farmer);
    profile.user = User.hydrate(farmer.user);
    crop.farmer = profile;
    const result = JSON.parse(JSON.stringify(serializePublicCrop(crop)));
    assert.equal(result.farmer.user._id, FARMER_ID);
    assert.equal(result.farmer.user.name, "Example Farmer");
    assert.deepEqual(result.images, [{ url: CROP_URL }]);
    assertPublicOnly(result);
  });

  test("owner can create a crop with uploaded image metadata retained internally", async () => {
    const form = new FormData();
    for (const field of ["name", "category", "description", "price", "unit", "stockQuantity", "season"]) {
      form.append(field, storedCrop[field]);
    }
    form.append("location", JSON.stringify({ district: "Bidar", state: "Karnataka" }));
    form.append("images", new Blob(["test image bytes"], { type: "image/jpeg" }), "test.jpg");
    const result = await request("/api/crops", { method: "POST", userId: FARMER_ID, body: form });
    assert.equal(result.status, 201);
    assert.equal(result.body.crop.images[0].publicId, "new-private-image");
    assert.match(result.body.crop.traceabilityId, /^AGS-TOM-[A-F0-9]{16}$/);
    assertPublicOnly((await request(`/api/crops/${CROP_ID}`)).body);
  });

  test("owner update preserves trace id and internal image metadata", async () => {
    const result = await request(`/api/crops/${CROP_ID}`, {
      method: "PUT", userId: FARMER_ID, body: { price: 45, stockQuantity: 90 },
    });
    assert.equal(result.status, 200);
    assert.equal(save.mock.callCount(), 1);
    assert.equal(result.body.crop.price, 45);
    assert.equal(result.body.crop.stockQuantity, 90);
    assert.equal(result.body.crop.traceabilityId, TRACE_ID);
    assert.equal(result.body.crop.images[0].publicId, "private-crop-image");
    const detail = await request(`/api/crops/${CROP_ID}`);
    assert.equal(detail.body.crop.price, 45);
    assertPublicOnly(detail.body);
  });

  test("owner image replacement uses the stored Cloudinary public id", async () => {
    const form = new FormData();
    form.append("replaceImages", "true");
    form.append("images", new Blob(["test image bytes"], { type: "image/jpeg" }), "test.jpg");
    const result = await request(`/api/crops/${CROP_ID}`, { method: "PUT", userId: FARMER_ID, body: form });
    assert.equal(result.status, 200);
    assert.equal(result.body.crop.images[0].publicId, "new-private-image");
    assert.equal(destroy.mock.calls[0].arguments[0], "private-crop-image");
    assertPublicOnly((await request(`/api/crops/${CROP_ID}`)).body);
  });

  test("owner delete retains image cleanup and makes crop unavailable", async () => {
    const result = await request(`/api/crops/${CROP_ID}`, { method: "DELETE", userId: FARMER_ID });
    assert.equal(result.status, 200);
    assert.equal(destroy.mock.calls[0].arguments[0], "private-crop-image");
    assert.equal(remove.mock.callCount(), 1);
    assert.equal((await request(`/api/crops/${CROP_ID}`)).status, 404);
    assert.equal((await request(`/api/traceability/${TRACE_ID}`)).status, 404);
  });

  test("owner QR action still returns the stable trace identity", async () => {
    const result = await request(`/api/crops/${CROP_ID}/traceability`, { method: "POST", userId: FARMER_ID });
    assert.equal(result.status, 200);
    assert.equal(result.body.traceabilityId, TRACE_ID);
    assert.equal(result.body.crop._id, CROP_ID);
  });

  test("anonymous and customer users cannot use farmer crop management routes", async () => {
    for (const [method, path] of [
      ["POST", "/api/crops"], ["PUT", `/api/crops/${CROP_ID}`],
      ["DELETE", `/api/crops/${CROP_ID}`], ["POST", `/api/crops/${CROP_ID}/traceability`],
    ]) {
      assert.equal((await request(path, { method })).status, 401);
      assert.equal((await request(path, { method, userId: CUSTOMER_ID })).status, 403);
    }
    assert.equal(save.mock.callCount(), 0);
    assert.equal(remove.mock.callCount(), 0);
  });

  test("another farmer cannot update, delete or prepare the owner's QR", async () => {
    for (const [method, path] of [
      ["PUT", `/api/crops/${CROP_ID}`], ["DELETE", `/api/crops/${CROP_ID}`],
      ["POST", `/api/crops/${CROP_ID}/traceability`],
    ]) {
      assert.equal((await request(path, { method, userId: OTHER_FARMER_ID })).status, 403);
    }
    assert.equal(save.mock.callCount(), 0);
    assert.equal(remove.mock.callCount(), 0);
  });

  test("public traceability remains sanitized and uses its existing DTO", async () => {
    const result = await request(`/api/traceability/${TRACE_ID}`);
    assert.equal(result.status, 200);
    assert.equal(result.body.traceability.farmer.displayName, "Example Farmer");
    assert.equal(result.body.traceability.crop.imageUrl, CROP_URL);
    assert.deepEqual(Object.keys(result.body.traceability).sort(), ["crop", "disclaimer", "farmer", "traceabilityId"]);
    assertPublicOnly(result.body);
    assert.ok(!JSON.stringify(result.body).includes('"_id"'));
  });
});
