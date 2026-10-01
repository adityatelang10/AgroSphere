const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
const mongoose = require("mongoose");

const DEMO_DB = "agrosphere_demo";
function assertDemoTarget(uri) {
  let url;
  try { url = new URL(uri); } catch { throw Error("Provide a valid local MONGO_URI targeting agrosphere_demo."); }
  if (url.protocol !== "mongodb:" || !["127.0.0.1", "localhost"].includes(url.hostname) ||
      decodeURIComponent(url.pathname) !== `/${DEMO_DB}` || (url.port && url.port !== "27017")) {
    throw Error("Refusing seed: target must be the local agrosphere_demo database on port 27017.");
  }
  return url;
}
function assertConnectedDemo(connection) {
  if (connection.name !== DEMO_DB || connection.db.databaseName !== DEMO_DB) throw Error("Unsafe connected database; aborting.");
}
function demoPassword(value) {
  const password = value || `${crypto.randomBytes(18).toString("base64url")}A1!`;
  if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72 ||
      !/[A-Z]/.test(password) || !/[0-9]/.test(password)) throw Error("Demo passwords must meet registration rules.");
  return password;
}
async function fingerprint(db) {
  const records = {};
  for (const { name } of (await db.listCollections().toArray()).sort((a, b) => a.name.localeCompare(b.name))) {
    const hash = crypto.createHash("sha256"); let count = 0;
    for await (const doc of db.collection(name).find().sort({ _id: 1 })) {
      hash.update(mongoose.mongo.BSON.serialize(doc)); count++;
    }
    records[name] = { count, sha256: hash.digest("hex") };
  }
  return records;
}

async function seedDemoData({ uri = process.env.MONGO_URI, reset = false } = {}) {
  assertDemoTarget(uri);
  const farmerPassword = demoPassword(process.env.DEMO_FARMER_PASSWORD);
  const customerPassword = demoPassword(process.env.DEMO_CUSTOMER_PASSWORD);
  // Original database is only read through the raw driver. No models/index writes.
  const oldConnection = await mongoose.createConnection(uri, { dbName: "agrosphere", autoIndex: false, autoCreate: false }).asPromise();
  let before;
  try {
    before = await fingerprint(oldConnection.db);
    await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
    assertConnectedDemo(mongoose.connection);
    const db = mongoose.connection.db;
    const completed = await db.collection("demo_seed_metadata").findOne({ _id: "seed-v1" });
    if (completed && !reset) return { ...completed.summary, alreadySeeded: true, credentials: "Existing passwords unchanged; use the credentials from the original seed run." };
    if (!reset && (await db.listCollections().toArray()).length) throw Error("Demo database is not empty. Inspect it first; only --reset-demo authorizes clearing THIS demo database.");

    const { getDiseaseDetection, getIrrigationAdvice } = require("../src/services/mlServiceClient");
    process.env.ML_SERVICE_TIMEOUT_MS ||= "30000";
    const fixture = path.resolve(__dirname, "../../ml-service/data/plant_disease/test/Tomato___healthy/1ae5cf7c-f03a-4591-93e9-61d9784763e0___RS_HL 0043.JPG");
    const buffer = await fs.readFile(fixture);
    const disease = await getDiseaseDetection({ buffer, filename: path.basename(fixture), mimeType: "image/jpeg" });
    if (disease.status !== "CLASSIFIED" || disease.crop !== "Tomato" || !disease.supportedClass) throw Error("The real supported Tomato fixture was not classified; no demo records written.");
    const observationDate = new Date().toISOString().slice(0, 10);
    // Explicit illustrative field observations, NOT live farm measurements/weather.
    const irrigationInputs = { crop: "tomato", growthStage: "mid_season", soilType: "silt", soilMoisture: 45,
      minimumTemperature: 22, maximumTemperature: 32, latitude: 17.91, observationDate,
      recentRainfall: 0, forecastRainfall: 0, daysSinceLastIrrigation: 3 };
    const irrigation = await getIrrigationAdvice(irrigationInputs);

    const sources = await oldConnection.db.collection("crops").find({ removedAt: null }).toArray();
    const sourceGallery = await oldConnection.db.collection("farmerprofiles").findOne({ "gallery.3": { $exists: true } });
    const cropDefinitions = [
      { name: "Tomato", category: "Vegetables", price: 40, stockQuantity: 98, season: "Year-round" },
      { name: "Mango", category: "Fruits", price: 90, stockQuantity: 60, season: "Zaid" },
      { name: "Potato", category: "Vegetables", price: 30, stockQuantity: 80, season: "Rabi" },
    ];
    const urlsFor = (name) => [...new Set(sources.filter((item) => item.name.toLowerCase().includes(name.toLowerCase()))
      .flatMap((item) => (item.images || []).map((image) => image.url)))].slice(0, 3);
    if (!sourceGallery || cropDefinitions.some((item) => !urlsFor(item.name).length)) throw Error("Suitable original image sources are unavailable; no demo records written.");
    const { cloudinary } = require("../src/config/cloudinary");
    async function copyImage(url, publicId) {
      if (!/^https:\/\/res\.cloudinary\.com\//.test(url)) throw Error("Only existing project Cloudinary images are copied.");
      const result = await cloudinary.uploader.upload(url, { public_id: `agrosphere/demo/${publicId}`, overwrite: false, resource_type: "image" });
      return { url: result.secure_url, publicId: result.public_id };
    }
    const gallery = [];
    for (const [index, image] of sourceGallery.gallery.slice(0, 4).entries()) gallery.push(await copyImage(image.url, `gallery-${index + 1}`));
    for (const definition of cropDefinitions) {
      definition.images = [];
      for (const [index, url] of urlsFor(definition.name).entries()) definition.images.push(await copyImage(url, `${definition.name.toLowerCase()}-${index + 1}`));
    }

    // All preflights succeeded. Reset requires explicit flag and BOTH target checks.
    if (reset) {
      assertDemoTarget(uri); assertConnectedDemo(mongoose.connection);
      for (const { name } of await db.listCollections().toArray()) {
        assertConnectedDemo(mongoose.connection);
        await db.collection(name).deleteMany({});
      }
    }
    const User = require("../src/models/User");
    const FarmerProfile = require("../src/models/FarmerProfile");
    const Crop = require("../src/models/Crop");
    const Order = require("../src/models/Order");
    const Review = require("../src/models/Review");
    const Conversation = require("../src/models/Conversation");
    const Message = require("../src/models/Message");
    const DiseaseScan = require("../src/models/DiseaseScan");
    const IrrigationRecord = require("../src/models/IrrigationRecord");
    const DecisionSnapshot = require("../src/models/DecisionSnapshot");
    for (const Model of [User, FarmerProfile, Crop, Order, Review, Conversation, Message, DiseaseScan, IrrigationRecord, DecisionSnapshot]) {
      await Model.createCollection(); await Model.createIndexes();
    }
    const location = { district: "Bidar", state: "Karnataka" };
    const address = { line1: "12 Market Road", villageOrCity: "Bidar", district: "Bidar", state: "Karnataka", pincode: "585401" };
    const farmer = await User.create({ name: "Nikhil Patil", email: "nikhil.demo@example.com", role: "FARMER", password: farmerPassword });
    const customer = await User.create({ name: "Arya Sharma", email: "arya.demo@example.com", role: "CUSTOMER", password: customerPassword, deliveryAddress: address });
    const profile = await FarmerProfile.create({ user: farmer._id, farmName: "Green Fields Farm", location, gallery,
      bio: "Demo farm profile showcasing seasonal produce and crop-planning tools in Bidar, Karnataka. Photos are copied presentation assets, not certification or proof of this fictional farm." });
    const { generateTraceabilityId } = require("../src/services/traceabilityService");
    const crops = [];
    for (const definition of cropDefinitions) crops.push(await Crop.create({ ...definition, farmer: profile._id, location, unit: "kg", isOrganic: false,
      traceabilityId: generateTraceabilityId(definition.name),
      description: `Demonstration ${definition.name} listing. Price and stock are illustrative marketplace data; photos are presentation assets.`, harvestDate: null }));
    const tomato = crops[0];
    // Historical demo order is NOT a gateway payment; optional payment fields stay absent.
    const order = await Order.create({ customer: customer._id, status: "Delivered", deliveryAddress: address,
      items: [{ crop: tomato._id, farmer: profile._id, quantity: 2, priceAtOrder: tomato.price }] });
    const review = await Review.create({ order: order._id, customer: customer._id, crop: tomato._id, farmer: profile._id,
      rating: 5, verifiedPurchase: true, comment: "Demonstration review linked to the seeded delivered Tomato order; not a real provider transaction." });
    await require("../src/services/reviewRatingService").refreshRatingSummaries(tomato._id, profile._id);
    const conversation = await Conversation.create({ customer: customer._id, farmer: farmer._id, cropContext: tomato._id });
    const messages = [];
    for (const [index, item] of [
      [customer, "Demo conversation: is the listed Tomato stock available?"],
      [farmer, "The demo listing shows 98 kg at ₹40/kg. Harvest information has not been entered."],
      [customer, "Thank you. I can open its AgroSphere trace record."],
    ].entries()) messages.push(await Message.create({ conversation: conversation._id, sender: item[0]._id,
      senderRole: item[0].role, text: item[1], clientMessageId: `demo-seed-${index + 1}`, readAt: new Date() }));
    conversation.lastMessage = messages.at(-1).text; conversation.lastMessageId = messages.at(-1)._id;
    conversation.lastMessageAt = messages.at(-1).createdAt; await conversation.save();
    const scan = await DiseaseScan.create({ farmer: farmer._id, originalFileName: path.basename(fixture), mimeType: "image/jpeg", sizeBytes: buffer.length,
      ...Object.fromEntries(["crop", "condition", "predictedClass", "isHealthy", "confidence", "modelVersion", "supportedClass"].map((key) => [key, disease[key]])) });
    const irrigationRecord = await IrrigationRecord.create({ farmer: farmer._id, inputs: irrigationInputs, result: irrigation, engineVersion: irrigation.engineVersion });
    const { generateDecision } = require("../src/services/decisionEngineService");
    const decision = await generateDecision({ farmerId: farmer._id, input: { selectedCrop: "tomato", farmState: "growing",
      availableQuantity: tomato.stockQuantity, quantityUnit: "kg", waterAvailability: "adequate", storageAvailable: false,
      currentSalePrice: null, transportCost: 0, storageCost: 0, otherCost: 0 } });
    const snapshot = await DecisionSnapshot.create({ farmer: farmer._id, selectedCrop: decision.selectedCrop, farmState: decision.farmState,
      farmerContext: decision.farmerContext, evidenceSnapshot: decision.evidence, candidateActions: decision.candidateActions,
      nextBestAction: decision.nextBestAction, alternatives: decision.alternatives, reasons: decision.why, constraints: decision.constraints,
      missingData: decision.missingData, assumptions: decision.assumptions, disclaimer: decision.disclaimer,
      decisionVersion: decision.decisionVersion, generatedAt: decision.generatedAt });
    const summary = { database: DEMO_DB, farmer: { id: String(farmer._id), profileId: String(profile._id), email: farmer.email },
      customer: { id: String(customer._id), email: customer.email },
      crops: crops.map((crop) => ({ id: String(crop._id), name: crop.name, traceabilityId: crop.traceabilityId, images: crop.images.length })),
      orderId: String(order._id), reviewId: String(review._id), conversationId: String(conversation._id),
      disease: { id: String(scan._id), crop: scan.crop, condition: scan.condition, confidence: scan.confidence, model: scan.modelVersion },
      irrigation: { id: String(irrigationRecord._id), timing: irrigation.recommendedTiming, needMm: irrigation.estimatedIrrigationNeed },
      decision: { id: String(snapshot._id), action: snapshot.nextBestAction.code, score: snapshot.nextBestAction.score },
      oldDatabaseCounts: Object.fromEntries(Object.entries(before).map(([name, item]) => [name, item.count])),
      demoInputsOnly: true, paymentAttemptsSeeded: 0 };
    await db.collection("demo_seed_metadata").insertOne({ _id: "seed-v1", createdAt: new Date(), summary, provenance: {
      diseaseFixture: path.relative(path.resolve(__dirname, "../.."), fixture), diseaseGroundTruth: "Tomato___healthy",
      irrigation: "Real irrigation-v1 calculation using illustrative field inputs, not live measurements.",
      order: "Seeded historical display only. No Razorpay payment claimed.", images: "Independent copies of existing project Cloudinary assets.",
    } });
    return { ...summary, credentials: { farmerPassword, customerPassword } };
  } finally {
    // Check CONTENT hashes as well as counts. Never repair/modify the old DB here.
    const after = await fingerprint(oldConnection.db);
    await mongoose.disconnect(); await oldConnection.close();
    if (before && JSON.stringify(before) !== JSON.stringify(after)) throw Error("Original database content changed during the seed; stop and investigate concurrent activity.");
  }
}

if (require.main === module) seedDemoData({ reset: process.argv.includes("--reset-demo") })
  .then((summary) => console.log(JSON.stringify(summary, null, 2)))
  .catch(() => { console.error("Demo seed stopped. Check target/preflights; no original database writes are performed. Do not retry reset blindly."); process.exitCode = 1; });

module.exports = { assertDemoTarget, assertConnectedDemo, demoPassword, seedDemoData };
