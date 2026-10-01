const assert = require("node:assert/strict");
const { test } = require("node:test");
const Crop = require("../src/models/Crop");
const FarmerProfile = require("../src/models/FarmerProfile");
const Order = require("../src/models/Order");
const DecisionSnapshot = require("../src/models/DecisionSnapshot");
const CropRecommendation = require("../src/models/CropRecommendation");
const DiseaseScan = require("../src/models/DiseaseScan");
const IrrigationRecord = require("../src/models/IrrigationRecord");
const MarketAnalysis = require("../src/models/MarketAnalysis");
const { getEvidencePreview } = require("../src/services/decisionEngineService");
const { getIntelligenceDashboard } = require("../src/services/intelligenceDashboardService");

const query = (value) => ({ sort() { return this; }, async lean() { return value; } });
function fixture(t, onlyRemoved = false) {
  const listings = [
    { _id: "removed", farmer: "farm", name: "Maize", stockQuantity: 999, unit: "kg", removedAt: new Date(), updatedAt: new Date() },
    ...(!onlyRemoved ? [
      { _id: "active", farmer: "farm", name: "Tomato", stockQuantity: 20, unit: "kg", removedAt: null, updatedAt: new Date("2026-09-30") },
      { _id: "legacy", farmer: "farm", name: "Tomato", stockQuantity: 10, unit: "kg", updatedAt: new Date("2026-09-29") },
    ] : []),
  ];
  for (const Model of [DecisionSnapshot, CropRecommendation, DiseaseScan, IrrigationRecord, MarketAnalysis]) {
    t.mock.method(Model, "findOne", () => query(null));
  }
  t.mock.method(FarmerProfile, "findOne", () => query({ _id: "farm", user: "farmer", location: { district: "Bidar", state: "Karnataka" } }));
  const matches = (filter) => {
    assert.equal(filter.farmer, "farm"); assert.equal(filter.removedAt, null);
    return listings.filter((item) => item.removedAt == null && (!filter.name || filter.name.test(item.name)));
  };
  t.mock.method(Crop, "find", (filter) => query(matches(filter)));
  t.mock.method(Crop, "findOne", (filter) => query(matches(filter)[0] || null));
  t.mock.method(Crop, "aggregate", async (pipeline) => {
    const rows = matches(pipeline[0].$match);
    return rows.length ? [{ _id: "kg", listingCount: rows.length, stockQuantity: rows.reduce((sum, item) => sum + item.stockQuantity, 0) }] : [];
  });
  t.mock.method(Order, "aggregate", async (pipeline) => {
    assert.deepEqual(pipeline[0].$match, { "items.farmer": "farm" });
    return [{ totalOrders: 1, deliveredOrders: 1, deliveredOrderValue: 40 }];
  });
}

test("decision evidence excludes removed rows but includes null/legacy active listings", async (t) => {
  fixture(t);
  const { evidence } = await getEvidencePreview({ farmerId: "farmer", selectedCrop: "tomato" });
  assert.equal(evidence.inventory.data.matchingListingCount, 2);
  assert.deepEqual(evidence.inventory.data.listings.map((item) => item.cropId), ["active", "legacy"]);
  const removedCrop = await getEvidencePreview({ farmerId: "farmer", selectedCrop: "maize" });
  assert.equal(removedCrop.evidence.inventory.usedInScoring, false);
  assert.equal(removedCrop.evidence.inventory.data.matchingListingCount, 0);
});

test("dashboard totals and fallback crop use only active inventory, not removed listings", async (t) => {
  fixture(t);
  const result = await getIntelligenceDashboard({ farmer: { _id: "farmer", name: "Fixture" } });
  assert.equal(result.inventory.listingCount, 2);
  assert.equal(result.orders.totalOrders, 1);
  assert.equal(result.orders.deliveredOrders, 1);
  assert.equal(result.primaryCrop.value, "tomato");
  assert.equal(JSON.stringify(result.inventory).includes("999"), false);
});

test("dashboard with only removed crops has no inventory or fallback current crop", async (t) => {
  fixture(t, true);
  const result = await getIntelligenceDashboard({ farmer: { _id: "farmer", name: "Fixture" } });
  assert.equal(result.inventory.listingCount, 0);
  assert.equal(result.orders.totalOrders, 1); // Removed listings do not erase order history.
  assert.equal(result.primaryCrop.available, false);
});
