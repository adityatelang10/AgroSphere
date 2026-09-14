const assert = require("node:assert/strict");
const test = require("node:test");

const {
  TRACEABILITY_ID_PATTERN,
  assignTraceabilityIdToExistingCrop,
  buildPublicTraceabilityRecord,
  generateTraceabilityId,
} = require("../src/services/traceabilityService");

test("generated traceability ids use the crop prefix and collision-resistant format", () => {
  const ids = new Set();

  for (let index = 0; index < 2000; index += 1) {
    const traceabilityId = generateTraceabilityId("Tomato");
    assert.match(traceabilityId, TRACEABILITY_ID_PATTERN);
    assert.ok(traceabilityId.startsWith("AGS-TOM-"));
    ids.add(traceabilityId);
  }

  assert.equal(ids.size, 2000);
});

test("lazy assignment keeps the first traceability id on repeated requests", async () => {
  let storedTraceabilityId = null;
  let writeCount = 0;
  const crop = { _id: "crop-1", name: "Mango", traceabilityId: null };
  const CropModel = {
    exists: async ({ traceabilityId }) => traceabilityId === storedTraceabilityId,
    collection: {
      updateOne: async (_, update) => {
        writeCount += 1;
        storedTraceabilityId = update.$set.traceabilityId;
        return { modifiedCount: 1 };
      },
    },
  };

  const firstId = await assignTraceabilityIdToExistingCrop(CropModel, crop);
  crop.traceabilityId = storedTraceabilityId;
  const secondId = await assignTraceabilityIdToExistingCrop(CropModel, crop);

  assert.equal(firstId, secondId);
  assert.equal(writeCount, 1);
});

test("public traceability DTO excludes private and internal fields", () => {
  const record = buildPublicTraceabilityRecord({
    _id: "crop-object-id",
    traceabilityId: "AGS-TOM-0123456789ABCDEF",
    name: "Tomato",
    category: "Vegetables",
    description: "Fresh field tomatoes",
    price: 40,
    unit: "kg",
    stockQuantity: 120,
    season: "Kharif",
    isOrganic: true,
    location: { district: "Bidar", state: "Karnataka" },
    images: [
      {
        url: "https://example.com/tomato.jpg",
        publicId: "private-cloudinary-id",
      },
    ],
    createdAt: new Date("2026-08-20T00:00:00.000Z"),
    farmer: {
      _id: "farmer-object-id",
      farmName: "Green Farm",
      location: { district: "Bidar", state: "Karnataka" },
      user: {
        _id: "user-object-id",
        name: "Asha",
        email: "private@example.com",
        password: "private-password-hash",
      },
    },
  });

  const serializedRecord = JSON.stringify(record);

  assert.equal(record.farmer.displayName, "Asha");
  assert.equal(record.crop.imageUrl, "https://example.com/tomato.jpg");
  assert.ok(!serializedRecord.includes("private@example.com"));
  assert.ok(!serializedRecord.includes("private-password-hash"));
  assert.ok(!serializedRecord.includes("private-cloudinary-id"));
  assert.ok(!serializedRecord.includes("object-id"));
  assert.ok(!serializedRecord.includes("isOrganic"));
});
