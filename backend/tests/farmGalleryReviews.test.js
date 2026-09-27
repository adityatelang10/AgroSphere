const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Writable } = require("node:stream");
const { beforeEach, describe, test } = require("node:test");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../src/models/User");
const Crop = require("../src/models/Crop");
const FarmerProfile = require("../src/models/FarmerProfile");
const Order = require("../src/models/Order");
const Review = require("../src/models/Review");
const { cloudinary } = require("../src/config/cloudinary");
const farmerRoutes = require("../src/routes/farmerRoutes");
const reviewRoutes = require("../src/routes/reviewRoutes");

const id = (n) => n.toString(16).padStart(24, "0");
const FARMER = id(1), OTHER_FARMER = id(2), CUSTOMER = id(3), OTHER_CUSTOMER = id(4);
const PROFILE = id(11), OTHER_PROFILE = id(12), CROP = id(21), ORDER = id(31), OTHER_ORDER = id(32);
const privateFields = { email: "test-only@example.invalid", password: "not-a-real-hash", phone: "private", jwt: "private", aiRecords: ["private"] };
const publicOnly = (value) => {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(![...Object.keys(privateFields), "publicId", "__v", "order", "deliveryAddress"].includes(key), `Leaked ${key}`);
    publicOnly(child);
  }
};

// Real Express/Multer/RBAC/validation/model schemas; isolated in-memory persistence
// and image-provider doubles. Never connect to MongoDB or upload demo photos.
describe("Farm gallery and verified delivered-purchase reviews", { concurrency: false }, () => {
  let baseUrl, profiles, crops, orders, reviews, uploads, deletes, sequence;
  const matches = (record, filter) => Object.entries(filter).every(([key, value]) => String(record[key]) === String(value));
  const query = (get, populate = (value) => value) => {
    let populated = false;
    let population;
    const q = {
      select() { return q; }, sort() { return q; }, lean() { return q; },
      populate(selection) { populated = true; population = selection; return q; },
      then(resolve, reject) { return Promise.resolve().then(get).then((value) => populated ? populate(value, population) : value).then(resolve, reject); },
    };
    return q;
  };
  const populatedReview = (review) => review && ({ ...review,
    customer: { _id: review.customer, name: "Test Customer", ...privateFields },
    order: orders.find((order) => order._id === review.order) || null,
  });
  const verified = (review) => orders.some((order) => order._id === review.order &&
    order.customer === review.customer && order.status === "Delivered" && order.items.some((item) => item.crop === review.crop));
  const request = async (path, { user, method = "GET", body } = {}) => {
    const headers = {};
    if (user) headers.cookie = `token=${jwt.sign({ userId: user }, process.env.JWT_SECRET, { expiresIn: "5m" })}`;
    if (body && !(body instanceof FormData)) headers["content-type"] = "application/json";
    const res = await fetch(`${baseUrl}${path}`, { method, headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    return { status: res.status, body: await res.json() };
  };
  const photoForm = (count = 1, { size = 32, type = "image/jpeg", fake = false } = {}) => {
    const form = new FormData();
    const bytes = Buffer.alloc(size);
    if (!fake) bytes.set([0xff, 0xd8, 0xff]);
    for (let n = 0; n < count; n++) form.append("images", new Blob([bytes], { type }), `photo-${n}.jpg`);
    return form;
  };
  const postReview = (overrides = {}, user = CUSTOMER) => request("/reviews", {
    user, method: "POST", body: { orderId: ORDER, cropId: CROP, rating: 4, comment: "Fresh produce.", ...overrides },
  });

  beforeEach(async (t) => {
    sequence = 100;
    for (const [key, value] of Object.entries({ JWT_SECRET: crypto.randomBytes(32).toString("hex"), CLOUDINARY_CLOUD_NAME: "test-only", CLOUDINARY_API_KEY: "test-only", CLOUDINARY_API_SECRET: "test-only" })) {
      const previous = process.env[key]; process.env[key] = value;
      t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
    }
    profiles = [{ _id: PROFILE, user: FARMER, farmName: "Test Farm", location: { district: "Bidar", state: "Karnataka", ...privateFields }, bio: "Test farm bio", gallery: [], ...privateFields },
      { _id: OTHER_PROFILE, user: OTHER_FARMER, farmName: "Other Farm", gallery: [] }];
    crops = [{ _id: CROP, farmer: PROFILE, name: "Tomato", price: 40, unit: "kg", stockQuantity: 100, removedAt: null, images: [{ url: "https://example.invalid/crop.jpg", publicId: "agrosphere/crops/keep" }], ...privateFields }];
    orders = [{ _id: ORDER, customer: CUSTOMER, status: "Delivered", items: [{ crop: CROP, farmer: PROFILE }], ...privateFields },
      { _id: OTHER_ORDER, customer: OTHER_CUSTOMER, status: "Delivered", items: [{ crop: CROP, farmer: PROFILE }] }];
    reviews = [];
    t.mock.method(User, "findById", async (userId) => ({ _id: userId, name: "Test User", role: [FARMER, OTHER_FARMER].includes(userId) ? "FARMER" : "CUSTOMER" }));
    t.mock.method(FarmerProfile, "findById", (value) => query(() => profiles.find((p) => p._id === String(value)), (profile) => profile && ({ ...profile, user: { _id: profile.user, name: "Test Farmer", profileImage: { url: "https://example.invalid/avatar.jpg", publicId: "private-avatar" }, ...privateFields } })));
    t.mock.method(FarmerProfile, "findOne", (filter) => query(() => profiles.find((p) => matches(p, filter))));
    t.mock.method(FarmerProfile, "findOneAndUpdate", async (filter, change, options) => {
      const profile = profiles.find((p) => p.user === String(filter.user) && (!filter._id || p._id === String(filter._id)));
      if (!profile) return null;
      const previous = structuredClone(profile);
      if (change.$push) {
        const maximumBefore = filter.$expr.$lte[1];
        assert.deepEqual(filter.$expr.$lte[0], { $size: { $ifNull: ["$gallery", []] } });
        if (profile.gallery.length > maximumBefore) return null;
        profile.gallery.push(...change.$push.gallery.$each.map((image) => ({ _id: id(sequence++), ...image })));
      } else {
        if (!profile.gallery.some((image) => image._id === filter["gallery._id"])) return null;
        profile.gallery = profile.gallery.filter((image) => image._id !== change.$pull.gallery._id);
      }
      return options.new ? profile : previous;
    });
    t.mock.method(FarmerProfile, "findByIdAndUpdate", async (value, changes) => Object.assign(profiles.find((p) => p._id === String(value)), changes));
    t.mock.method(Crop, "findById", (value) => query(() => crops.find((c) => c._id === String(value)), (crop) => crop && ({ ...crop, farmer: profiles.find((p) => p._id === crop.farmer) })));
    t.mock.method(Crop, "find", (filter) => query(() => crops.filter((crop) => matches(crop, filter))));
    t.mock.method(Crop, "findByIdAndUpdate", async (value, changes) => Object.assign(crops.find((c) => c._id === String(value)), changes));
    t.mock.method(Order, "findOne", async (filter) => orders.find((order) => order._id === String(filter._id) && order.customer === String(filter.customer) && order.status === filter.status && order.items.some((item) => item.crop === String(filter["items.crop"]))));
    t.mock.method(Review, "findOne", (filter) => query(() => reviews.find((r) => matches(r, filter))));
    t.mock.method(Review, "findById", (value) => query(() => reviews.find((r) => r._id === String(value)), (record, population) => {
      if (population?.path === "crop") {
        const result = { ...record, crop: crops.find((c) => c._id === record.crop) };
        result.save = async () => { record.farmerReply = result.farmerReply; };
        return result;
      }
      return populatedReview(record);
    }));
    t.mock.method(Review, "find", (filter) => query(() => reviews.filter((r) => matches(r, filter)), (records) => records.map(populatedReview)));
    t.mock.method(Review, "create", async (payload) => {
      if (reviews.some((r) => r.order === String(payload.order) && r.crop === String(payload.crop) && r.customer === String(payload.customer))) throw Object.assign(new Error("Duplicate"), { code: 11000 });
      const record = { _id: id(sequence++), ...payload, createdAt: new Date().toISOString(), farmerReply: "" };
      record.save = async () => { record.updatedAt = new Date().toISOString(); };
      reviews.push(record); return record;
    });
    t.mock.method(Review, "aggregate", async (pipeline) => {
      assert.ok(pipeline.some((stage) => stage.$lookup?.from === "orders"));
      assert.deepEqual(pipeline.find((stage) => stage.$match?.["purchase.status"]).$match, {
        "purchase.status": "Delivered", $expr: { $and: [
          { $eq: ["$customer", "$purchase.customer"] }, { $in: ["$crop", "$purchase.items.crop"] },
        ] },
      });
      const farmerFilter = pipeline.find((stage) => stage.$match?.["cropDoc.farmer"])?.$match["cropDoc.farmer"];
      const cropIds = pipeline.find((stage) => stage.$match?.crop)?.$match.crop.$in.map(String);
      const grouped = new Map();
      for (const review of reviews.filter(verified)) {
        const crop = crops.find((c) => c._id === review.crop);
        if (farmerFilter && crop?.farmer !== String(farmerFilter)) continue;
        if (cropIds && !cropIds.includes(review.crop)) continue;
        const key = farmerFilter ? String(farmerFilter) : review.crop;
        grouped.set(key, [...(grouped.get(key) || []), review.rating]);
      }
      return [...grouped].map(([key, ratings]) => ({ _id: key, averageRating: ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length, totalReviews: ratings.length }));
    });
    uploads = t.mock.method(cloudinary.uploader, "upload_stream", (options, callback) => new Writable({
      write(chunk, encoding, done) { done(); },
      final(done) { callback(null, { secure_url: `https://example.invalid/farm-${sequence}.jpg`, public_id: `${options.folder}/${sequence++}` }); done(); },
    }));
    deletes = t.mock.method(cloudinary.uploader, "destroy", async () => ({ result: "ok" }));
    const app = express(); app.use(cookieParser(), express.json());
    app.use("/farmer", farmerRoutes); app.use("/reviews", reviewRoutes);
    app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
    const server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  test("owner adds multiple gallery photos; public/customer reads are sanitized", async () => {
    const result = await request("/farmer/profile/gallery", { user: FARMER, method: "POST", body: photoForm(3) });
    assert.equal(result.status, 201); assert.equal(result.body.gallery.length, 3); publicOnly(result.body);
    assert.ok(profiles[0].gallery[0].publicId.startsWith("agrosphere/farm-gallery/"));
    for (const user of [undefined, CUSTOMER, FARMER]) {
      const publicResult = await request(`/farmer/public/${PROFILE}`, { user });
      assert.equal(publicResult.status, 200); assert.equal(publicResult.body.profile.gallery.length, 3);
      assert.equal(publicResult.body.crops.length, 1); publicOnly(publicResult.body);
    }
    publicOnly((await request("/farmer/profile", { user: FARMER })).body);
  });
  test("owner removal deletes only the gallery asset, not crop images", async () => {
    await request("/farmer/profile/gallery", { user: FARMER, method: "POST", body: photoForm(2) });
    const image = profiles[0].gallery[0];
    const cropBefore = JSON.stringify(crops);
    const result = await request(`/farmer/profile/gallery/${image._id}`, { user: FARMER, method: "DELETE" });
    assert.equal(result.status, 200); assert.equal(profiles[0].gallery.length, 1);
    assert.equal(deletes.mock.calls[0].arguments[0], image.publicId); assert.equal(JSON.stringify(crops), cropBefore);
  });
  test("other farmer cannot remove another gallery image or choose its upload owner", async () => {
    await request("/farmer/profile/gallery", { user: FARMER, method: "POST", body: photoForm() });
    const imageId = profiles[0].gallery[0]._id;
    assert.equal((await request(`/farmer/profile/gallery/${imageId}`, { user: OTHER_FARMER, method: "DELETE" })).status, 404);
    const forged = photoForm(); forged.append("farmer", PROFILE);
    assert.equal((await request("/farmer/profile/gallery", { user: OTHER_FARMER, method: "POST", body: forged })).status, 400);
    assert.equal(profiles[0].gallery.length, 1); assert.equal(deletes.mock.callCount(), 0);
  });
  test("anonymous/customer cannot change gallery", async () => {
    for (const [user, status] of [[undefined, 401], [CUSTOMER, 403]]) {
      assert.equal((await request("/farmer/profile/gallery", { user, method: "POST", body: photoForm() })).status, status);
      assert.equal((await request(`/farmer/profile/gallery/${id(99)}`, { user, method: "DELETE" })).status, status);
    }
    assert.equal(uploads.mock.callCount(), 0);
  });
  test("max eight persists atomically; excess/oversized/fake/empty/non-image uploads rejected", async () => {
    assert.equal((await request("/farmer/profile/gallery", { user: FARMER, method: "POST", body: photoForm(8) })).status, 201);
    assert.equal((await request("/farmer/profile/gallery", { user: FARMER, method: "POST", body: photoForm() })).status, 400);
    profiles[0].gallery = [];
    for (const form of [photoForm(9), photoForm(1, { size: 5 * 1024 * 1024 + 1 }), photoForm(1, { fake: true }), photoForm(1, { type: "text/plain" }), new FormData()]) {
      assert.equal((await request("/farmer/profile/gallery", { user: FARMER, method: "POST", body: form })).status, 400);
    }
    assert.equal(uploads.mock.callCount(), 8);
  });
  test("simultaneous uploads never exceed eight and losing uploads are cleaned up", async () => {
    const results = await Promise.all([1, 2].map(() => request("/farmer/profile/gallery", { user: FARMER, method: "POST", body: photoForm(5) })));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.ok([400, 409].includes(results.find((r) => r.status !== 201).status));
    assert.equal(profiles[0].gallery.length, 5);
    assert.equal(uploads.mock.callCount() - deletes.mock.callCount(), 5);
  });
  test("failed image decode cleans up preceding uploads without changing gallery", async () => {
    let n = 0;
    uploads.mock.mockImplementation((options, callback) => new Writable({ write(chunk, encoding, done) { done(); }, final(done) {
      if (n++) callback(new Error("Image could not be decoded"));
      else callback(null, { secure_url: "https://example.invalid/one.jpg", public_id: "agrosphere/farm-gallery/one" });
      done();
    } }));
    const result = await request("/farmer/profile/gallery", { user: FARMER, method: "POST", body: photoForm(2) });
    assert.equal(result.status, 502); assert.equal(profiles[0].gallery.length, 0); assert.equal(deletes.mock.callCount(), 1);
  });
  test("public profile survives no active crops, excludes removed crops and rejects invalid IDs", async () => {
    crops[0].removedAt = new Date();
    const response = await request(`/farmer/public/${PROFILE}`);
    assert.equal(response.status, 200); assert.equal(response.body.crops.length, 0);
    assert.equal((await request("/farmer/public/not-an-id")).status, 400);
    assert.equal((await request(`/farmer/public/${id(99)}`)).status, 404);
    assert.equal((await request("/farmer/profile/gallery/bad-id", { user: FARMER, method: "DELETE" })).status, 400);
  });
  test("only a CUSTOMER with their own delivered purchase may review", async () => {
    assert.equal((await request("/reviews", { method: "POST", body: {} })).status, 401);
    assert.equal((await postReview({}, FARMER)).status, 403);
    assert.equal((await postReview({}, OTHER_CUSTOMER)).status, 403);
    assert.equal((await postReview({ orderId: OTHER_ORDER })).status, 403);
    for (const status of ["Pending", "Confirmed", "Dispatched"]) {
      orders[0].status = status;
      assert.equal((await postReview()).status, 403);
    }
    orders[0].status = "Delivered"; orders[0].items = [];
    assert.equal((await postReview()).status, 403); assert.equal(reviews.length, 0);
  });
  test("seller cannot self-review even if their account role changes", async () => {
    profiles[0].user = CUSTOMER;
    assert.equal((await postReview()).status, 403); assert.equal(reviews.length, 0);
  });
  test("integer stars, text length/type/markup and IDs are validated", async () => {
    for (const rating of [0, 6, 2.5, null, {}, "5"]) assert.equal((await postReview({ rating })).status, 400);
    for (const comment of ["x".repeat(1001), {}, "<script>alert(1)</script>", "bad\u0000text"]) assert.equal((await postReview({ comment })).status, 400);
    assert.equal((await postReview({ orderId: "bad" })).status, 400);
    assert.equal((await postReview({ cropId: "bad" })).status, 400);
    assert.equal(reviews.length, 0);
  });
  test("create and public lookup return real verification, display name, stars and sanitized text", async () => {
    const response = await postReview({ rating: 5, comment: "  Fresh & tasty  ", customer: OTHER_CUSTOMER, farmer: OTHER_PROFILE, verifiedPurchase: false });
    assert.equal(response.status, 201); assert.equal(response.body.review.verifiedPurchase, true);
    assert.equal(reviews[0].customer, CUSTOMER); assert.equal(reviews[0].farmer, PROFILE); assert.equal(reviews[0].verifiedPurchase, true);
    const result = await request(`/reviews/crop/${CROP}`);
    assert.equal(result.body.crop.averageRating, 5); assert.equal(result.body.crop.totalReviews, 1);
    assert.equal(result.body.reviews[0].comment, "Fresh & tasty"); assert.equal(result.body.reviews[0].customer.name, "Test Customer");
    publicOnly(result.body); assert.equal(result.body.reviews[0].orderId, undefined); assert.equal(result.body.reviews[0].customer._id, undefined);
  });
  test("duplicate reviews are rejected, including the unique-index race path", async () => {
    const results = await Promise.all([postReview(), postReview()]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal((await postReview()).status, 409); assert.equal(reviews.length, 1);
  });
  test("own review can be edited; identity stays stable and aggregates change", async () => {
    const first = await postReview({ rating: 5 });
    await postReview({ orderId: OTHER_ORDER, rating: 3 }, OTHER_CUSTOMER);
    assert.equal(crops[0].averageRating, 4); assert.equal(crops[0].totalReviews, 2);
    const reviewId = first.body.review._id;
    assert.equal((await request(`/reviews/${reviewId}`, { user: OTHER_CUSTOMER, method: "PATCH", body: { rating: 1 } })).status, 404);
    assert.equal((await request(`/reviews/${reviewId}`, { user: FARMER, method: "PATCH", body: { rating: 1 } })).status, 403);
    const result = await request(`/reviews/${reviewId}`, { user: CUSTOMER, method: "PATCH", body: { rating: 1, comment: "Updated experience", orderId: OTHER_ORDER, cropId: id(99), verifiedPurchase: false } });
    assert.equal(result.status, 200); assert.equal(reviews[0].order, ORDER); assert.equal(reviews[0].crop, CROP);
    assert.equal(result.body.aggregates.crop.averageRating, 2); assert.equal(result.body.aggregates.crop.totalReviews, 2);
    assert.equal(profiles[0].averageRating, 2); assert.equal(profiles[0].totalReviews, 2); assert.ok(result.body.review.updatedAt);
    const own = await request("/reviews/mine", { user: CUSTOMER });
    assert.equal(own.body.reviews.length, 1); assert.equal(own.body.reviews[0].orderId, ORDER);
    assert.equal((await request(`/farmer/public/${PROFILE}`)).body.crops[0].averageRating, 2);
  });
  test("edit revalidates delivery rather than trusting a stored flag", async () => {
    const result = await postReview(); orders[0].status = "Dispatched";
    assert.equal((await request(`/reviews/${result.body.review._id}`, { user: CUSTOMER, method: "PATCH", body: { rating: 1 } })).status, 403);
  });
  test("existing farmer reply route still enforces ownership and returns sanitized feedback", async () => {
    const created = await postReview();
    const path = `/reviews/${created.body.review._id}/reply`;
    assert.equal((await request(path, { user: OTHER_FARMER, method: "PATCH", body: { farmerReply: "Not my crop" } })).status, 403);
    assert.equal((await request(path, { user: CUSTOMER, method: "PATCH", body: { farmerReply: "Not a farmer" } })).status, 403);
    const response = await request(path, { user: FARMER, method: "PATCH", body: { farmerReply: "Thank you for your feedback." } });
    assert.equal(response.status, 200); assert.equal(response.body.review.farmerReply, "Thank you for your feedback.");
    assert.equal(response.body.review.verifiedPurchase, true); publicOnly(response.body);
  });
  test("removed listings retain public reviews, review editing and historical eligibility", async () => {
    crops[0].removedAt = new Date();
    assert.equal((await postReview()).status, 201);
    assert.equal((await request(`/reviews/crop/${CROP}`)).body.reviews.length, 1);
    const publicProfile = (await request(`/farmer/public/${PROFILE}`)).body;
    assert.equal(publicProfile.crops.length, 0); assert.equal(publicProfile.profile.totalReviews, 1);
    assert.equal((await request(`/reviews/${reviews[0]._id}`, { user: CUSTOMER, method: "PATCH", body: { rating: 5 } })).status, 200);
  });
  test("legacy review verification uses its order without changing old stored records", async () => {
    await postReview(); delete reviews[0].verifiedPurchase; delete reviews[0].farmer;
    const before = JSON.stringify(reviews);
    assert.equal((await request(`/reviews/crop/${CROP}`)).body.reviews[0].verifiedPurchase, true);
    assert.equal(JSON.stringify(reviews), before);
    orders[0].customer = OTHER_CUSTOMER;
    assert.equal((await request(`/reviews/crop/${CROP}`)).body.count, 0);
    assert.equal((await request(`/farmer/public/${PROFILE}`)).body.profile.totalReviews, 0);
  });
  test("schema retains compound uniqueness and enforces integer rating/max gallery size", () => {
    assert.ok(Review.schema.indexes().some(([keys, options]) => options.unique && keys.order === 1 && keys.customer === 1 && keys.crop === 1));
    assert.ok(new Review({ order: ORDER, customer: CUSTOMER, crop: CROP, rating: 2.5 }).validateSync().errors.rating);
    const profile = new FarmerProfile({ user: FARMER, farmName: "Test Farm", location: { district: "Bidar", state: "Karnataka" }, gallery: Array.from({ length: 9 }, () => ({ url: "https://example.invalid/img.jpg", publicId: "test-only" })) });
    assert.ok(profile.validateSync().errors.gallery);
    assert.equal(Review.schema.options.timestamps.updatedAt, true);
  });
});
