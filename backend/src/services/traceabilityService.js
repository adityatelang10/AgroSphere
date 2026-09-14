const crypto = require("crypto");

const TRACEABILITY_ID_PATTERN = /^AGS-[A-Z0-9]{3}-[A-F0-9]{16}$/;
const MAX_TRACEABILITY_ATTEMPTS = 5;

const getCropPrefix = (cropName) => {
  const normalizedName = String(cropName || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  return (normalizedName.slice(0, 3) || "CRP").padEnd(3, "X");
};

const generateTraceabilityId = (cropName) => {
  const randomSuffix = crypto.randomBytes(8).toString("hex").toUpperCase();
  return `AGS-${getCropPrefix(cropName)}-${randomSuffix}`;
};

const isDuplicateTraceabilityIdError = (error) =>
  error?.code === 11000 &&
  (Boolean(error?.keyPattern?.traceabilityId) ||
    Boolean(error?.keyValue?.traceabilityId) ||
    String(error?.message || "").includes("traceabilityId"));

const createAvailableTraceabilityId = async (CropModel, cropName) => {
  for (let attempt = 0; attempt < MAX_TRACEABILITY_ATTEMPTS; attempt += 1) {
    const candidate = generateTraceabilityId(cropName);
    const alreadyExists = await CropModel.exists({ traceabilityId: candidate });

    if (!alreadyExists) {
      return candidate;
    }
  }

  throw new Error("Unable to generate a unique crop traceability id");
};

const assignTraceabilityIdToExistingCrop = async (CropModel, crop) => {
  if (crop.traceabilityId) {
    return crop.traceabilityId;
  }

  for (let attempt = 0; attempt < MAX_TRACEABILITY_ATTEMPTS; attempt += 1) {
    const candidate = await createAvailableTraceabilityId(CropModel, crop.name);

    try {
      const result = await CropModel.collection.updateOne(
        {
          _id: crop._id,
          $or: [
            { traceabilityId: { $exists: false } },
            { traceabilityId: null },
            { traceabilityId: "" },
          ],
        },
        { $set: { traceabilityId: candidate } }
      );

      if (result.modifiedCount === 1) {
        return candidate;
      }

      const currentCrop = await CropModel.findById(crop._id)
        .select("traceabilityId")
        .lean();

      if (currentCrop?.traceabilityId) {
        return currentCrop.traceabilityId;
      }
    } catch (error) {
      if (!isDuplicateTraceabilityIdError(error)) {
        throw error;
      }
    }
  }

  throw new Error("Unable to assign a unique crop traceability id");
};

const buildPublicTraceabilityRecord = (cropDocument) => {
  const crop = cropDocument?.toObject ? cropDocument.toObject() : cropDocument;
  const farmer = crop?.farmer || {};
  const farmerUser = farmer?.user || {};

  return {
    traceabilityId: crop.traceabilityId,
    crop: {
      name: crop.name,
      category: crop.category,
      description: crop.description,
      imageUrl: crop.images?.[0]?.url || null,
      season: crop.season,
      harvestDate: crop.harvestDate || null,
      listedAt: crop.createdAt,
      availableStock: crop.stockQuantity,
      unit: crop.unit,
      price: crop.price,
      location: {
        district: crop.location?.district || "",
        state: crop.location?.state || "",
      },
    },
    farmer: {
      displayName: farmerUser.name || farmer.farmName || "AgroSphere farmer",
      farmName: farmer.farmName || "Farm profile",
      location: {
        district: farmer.location?.district || crop.location?.district || "",
        state: farmer.location?.state || crop.location?.state || "",
      },
    },
    disclaimer:
      "This trace page shows farmer-provided listing information and a stable AgroSphere listing identity. It is not a certification of quality, origin, or farming practices.",
  };
};

module.exports = {
  TRACEABILITY_ID_PATTERN,
  assignTraceabilityIdToExistingCrop,
  buildPublicTraceabilityRecord,
  createAvailableTraceabilityId,
  generateTraceabilityId,
  getCropPrefix,
};
