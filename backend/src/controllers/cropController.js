const { body, param, query, validationResult } = require("express-validator");

const { deleteFromCloudinary, uploadBufferToCloudinary } = require("../config/cloudinary");
const Crop = require("../models/Crop");
const FarmerProfile = require("../models/FarmerProfile");

const SUPPORTED_UNITS = [
  "kg",
  "gram",
  "quintal",
  "dozen",
  "piece",
  "bundle",
  "packet",
  "litre",
];

const SUPPORTED_SEASONS = ["Kharif", "Rabi", "Zaid", "Year-round"];

const handleValidation = (req, res) => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return null;
  }

  return res.status(400).json({
    success: false,
    message: "Validation failed",
    errors: errors.array(),
  });
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseBoolean = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return undefined;
};

const parseNumber = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return NaN;
  }

  return Number(value);
};

const parseJsonString = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return undefined;
  }
};

const resolveLocation = (body) => {
  const parsedLocation = parseJsonString(body.location);

  if (parsedLocation && typeof parsedLocation === "object") {
    return {
      district: parsedLocation.district,
      state: parsedLocation.state,
    };
  }

  return {
    district: body.district,
    state: body.state,
  };
};

const validateLocationInput = (body, { requireBoth = false } = {}) => {
  const location = resolveLocation(body);
  const hasDistrict = Boolean(location.district && String(location.district).trim());
  const hasState = Boolean(location.state && String(location.state).trim());
  const locationProvided =
    typeof body.location !== "undefined" ||
    typeof body.district !== "undefined" ||
    typeof body.state !== "undefined";

  if (requireBoth && (!hasDistrict || !hasState)) {
    throw new Error("District and state are required");
  }

  if (locationProvided && hasDistrict !== hasState) {
    throw new Error("Both district and state are required when providing location");
  }

  if (typeof body.location !== "undefined" && !hasDistrict && !hasState) {
    throw new Error("Location must be a valid object or JSON string with district and state");
  }

  return true;
};

const buildCropPayload = (body) => {
  const location = resolveLocation(body);
  const payload = {};

  if (typeof body.name !== "undefined") {
    payload.name = body.name;
  }

  if (typeof body.category !== "undefined") {
    payload.category = body.category;
  }

  if (typeof body.description !== "undefined") {
    payload.description = body.description;
  }

  if (typeof body.price !== "undefined") {
    payload.price = parseNumber(body.price);
  }

  if (typeof body.unit !== "undefined") {
    payload.unit = body.unit;
  }

  if (typeof body.stockQuantity !== "undefined") {
    payload.stockQuantity = parseNumber(body.stockQuantity);
  }

  if (typeof body.season !== "undefined") {
    payload.season = body.season;
  }

  if (typeof body.isOrganic !== "undefined") {
    payload.isOrganic = parseBoolean(body.isOrganic);
  }

  if (location.district && location.state) {
    payload.location = {
      district: location.district,
      state: location.state,
    };
  }

  return payload;
};

const normalizeImageDocuments = (uploads) =>
  uploads.map((result) => ({
    url: result.secure_url,
    publicId: result.public_id,
  }));

const uploadImages = async (files) => {
  if (!files || files.length === 0) {
    return [];
  }

  const uploads = [];

  try {
    for (const file of files) {
      const result = await uploadBufferToCloudinary(file.buffer);
      uploads.push(result);
    }

    return normalizeImageDocuments(uploads);
  } catch (error) {
    await Promise.allSettled(uploads.map((file) => deleteFromCloudinary(file.public_id)));
    throw error;
  }
};

const getFarmerProfileForUser = async (userId) => FarmerProfile.findOne({ user: userId });

const populateFarmer = {
  path: "farmer",
  select: "farmName location bio averageRating totalReviews",
  populate: {
    path: "user",
    select: "name email",
  },
};

const cropIdValidation = [
  param("id").isMongoId().withMessage("Crop id must be a valid MongoDB ObjectId"),
];

const createCropValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Crop name is required")
    .isLength({ min: 2, max: 120 })
    .withMessage("Crop name must be between 2 and 120 characters"),
  body("category")
    .trim()
    .notEmpty()
    .withMessage("Category is required")
    .isLength({ max: 60 })
    .withMessage("Category cannot exceed 60 characters"),
  body("description")
    .trim()
    .notEmpty()
    .withMessage("Description is required")
    .isLength({ min: 10, max: 1500 })
    .withMessage("Description must be between 10 and 1500 characters"),
  body("price")
    .notEmpty()
    .withMessage("Price is required")
    .custom((value) => Number.isFinite(parseNumber(value)) && parseNumber(value) >= 0)
    .withMessage("Price must be a valid non-negative number"),
  body("unit")
    .trim()
    .notEmpty()
    .withMessage("Unit is required")
    .isIn(SUPPORTED_UNITS)
    .withMessage("Unit must be one of the supported crop units"),
  body("stockQuantity")
    .notEmpty()
    .withMessage("Stock quantity is required")
    .custom((value) => Number.isFinite(parseNumber(value)) && parseNumber(value) >= 0)
    .withMessage("Stock quantity must be a valid non-negative number"),
  body("season")
    .trim()
    .notEmpty()
    .withMessage("Season is required")
    .isIn(SUPPORTED_SEASONS)
    .withMessage("Season must be one of the supported crop seasons"),
  body("isOrganic")
    .optional()
    .custom((value) => typeof parseBoolean(value) === "boolean")
    .withMessage("isOrganic must be true or false"),
  body().custom((_, { req }) => validateLocationInput(req.body, { requireBoth: true })),
];

const updateCropValidation = [
  ...cropIdValidation,
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 120 })
    .withMessage("Crop name must be between 2 and 120 characters"),
  body("category")
    .optional()
    .trim()
    .isLength({ max: 60 })
    .withMessage("Category cannot exceed 60 characters"),
  body("description")
    .optional()
    .trim()
    .isLength({ min: 10, max: 1500 })
    .withMessage("Description must be between 10 and 1500 characters"),
  body("price")
    .optional()
    .custom((value) => Number.isFinite(parseNumber(value)) && parseNumber(value) >= 0)
    .withMessage("Price must be a valid non-negative number"),
  body("stockQuantity")
    .optional()
    .custom((value) => Number.isFinite(parseNumber(value)) && parseNumber(value) >= 0)
    .withMessage("Stock quantity must be a valid non-negative number"),
  body("unit")
    .optional()
    .trim()
    .isIn(SUPPORTED_UNITS)
    .withMessage("Unit must be one of the supported crop units"),
  body("season")
    .optional()
    .trim()
    .isIn(SUPPORTED_SEASONS)
    .withMessage("Season must be one of the supported crop seasons"),
  body("isOrganic")
    .optional()
    .custom((value) => typeof parseBoolean(value) === "boolean")
    .withMessage("isOrganic must be true or false"),
  body().custom((_, { req }) => validateLocationInput(req.body)),
];

const listCropValidation = [
  query("minPrice")
    .optional()
    .custom((value) => Number.isFinite(parseNumber(value)) && parseNumber(value) >= 0)
    .withMessage("minPrice must be a valid non-negative number"),
  query("maxPrice")
    .optional()
    .custom((value) => Number.isFinite(parseNumber(value)) && parseNumber(value) >= 0)
    .withMessage("maxPrice must be a valid non-negative number"),
  query("isOrganic")
    .optional()
    .custom((value) => typeof parseBoolean(value) === "boolean")
    .withMessage("isOrganic must be true or false"),
  query().custom((_, { req }) => {
    if (
      typeof req.query.minPrice !== "undefined" &&
      typeof req.query.maxPrice !== "undefined" &&
      parseNumber(req.query.minPrice) > parseNumber(req.query.maxPrice)
    ) {
      throw new Error("minPrice cannot be greater than maxPrice");
    }

    return true;
  }),
];

const createCrop = async (req, res, next) => {
  const validationErrorResponse = handleValidation(req, res);
  if (validationErrorResponse) {
    return validationErrorResponse;
  }

  let uploadedImages = [];
  let cropCreated = false;

  try {
    let farmerProfile = await getFarmerProfileForUser(req.user._id);

    if (!farmerProfile) {
      const location = resolveLocation(req.body);
      farmerProfile = await FarmerProfile.create({
        user: req.user._id,
        farmName: `${req.user.name}'s Farm`,
        location: {
          district: location.district || "Default District",
          state: location.state || "Default State",
        },
      });
    }

    uploadedImages = await uploadImages(req.files);

    const cropPayload = buildCropPayload(req.body);

    const crop = await Crop.create({
      ...cropPayload,
      farmer: farmerProfile._id,
      images: uploadedImages,
    });
    cropCreated = true;

    return res.status(201).json({
      success: true,
      message: "Crop created successfully",
      crop: await Crop.findById(crop._id).populate(populateFarmer),
    });
  } catch (error) {
    if (!cropCreated) {
      await Promise.allSettled(uploadedImages.map((image) => deleteFromCloudinary(image.publicId)));
    }

    return next(error);
  }
};

const listCrops = async (req, res, next) => {
  const validationErrorResponse = handleValidation(req, res);
  if (validationErrorResponse) {
    return validationErrorResponse;
  }

  try {
    const { search, category, season, isOrganic, minPrice, maxPrice, district, state } = req.query;

    const filter = {};

    if (search) {
      filter.$text = { $search: search };
    }

    if (category) {
      filter.category = new RegExp(`^${escapeRegex(category)}$`, "i");
    }

    if (season) {
      filter.season = new RegExp(`^${escapeRegex(season)}$`, "i");
    }

    if (typeof isOrganic !== "undefined") {
      filter.isOrganic = parseBoolean(isOrganic);
    }

    if (typeof minPrice !== "undefined" || typeof maxPrice !== "undefined") {
      filter.price = {};

      if (typeof minPrice !== "undefined") {
        filter.price.$gte = parseNumber(minPrice);
      }

      if (typeof maxPrice !== "undefined") {
        filter.price.$lte = parseNumber(maxPrice);
      }
    }

    if (district) {
      filter["location.district"] = new RegExp(`^${escapeRegex(district)}$`, "i");
    }

    if (state) {
      filter["location.state"] = new RegExp(`^${escapeRegex(state)}$`, "i");
    }

    const queryBuilder = Crop.find(filter).populate(populateFarmer);

    if (search) {
      queryBuilder.sort({ score: { $meta: "textScore" } });
    } else {
      queryBuilder.sort({ createdAt: -1 });
    }

    const crops = await queryBuilder;

    return res.status(200).json({
      success: true,
      count: crops.length,
      crops,
    });
  } catch (error) {
    return next(error);
  }
};

const getCropById = async (req, res, next) => {
  const validationErrorResponse = handleValidation(req, res);
  if (validationErrorResponse) {
    return validationErrorResponse;
  }

  try {
    const crop = await Crop.findById(req.params.id).populate(populateFarmer);

    if (!crop) {
      return res.status(404).json({
        success: false,
        message: "Crop not found",
      });
    }

    return res.status(200).json({
      success: true,
      crop,
    });
  } catch (error) {
    return next(error);
  }
};

const updateCrop = async (req, res, next) => {
  const validationErrorResponse = handleValidation(req, res);
  if (validationErrorResponse) {
    return validationErrorResponse;
  }

  let uploadedImages = [];
  let cropSaved = false;

  try {
    const farmerProfile = await getFarmerProfileForUser(req.user._id);

    if (!farmerProfile) {
      return res.status(404).json({
        success: false,
        message: "Farmer profile not found. Create a farmer profile before updating crops.",
      });
    }

    const crop = await Crop.findById(req.params.id);

    if (!crop) {
      return res.status(404).json({
        success: false,
        message: "Crop not found",
      });
    }

    if (!crop.farmer.equals(farmerProfile._id)) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own crop listings",
      });
    }

    uploadedImages = await uploadImages(req.files);

    const replaceImages = parseBoolean(req.body.replaceImages) === true;
    const previousImages = [...crop.images];
    const nextImages =
      replaceImages && uploadedImages.length > 0
        ? uploadedImages
        : [...crop.images, ...uploadedImages];

    if (nextImages.length > 5) {
      await Promise.allSettled(uploadedImages.map((image) => deleteFromCloudinary(image.publicId)));

      return res.status(400).json({
        success: false,
        message: "A crop can have at most 5 images",
      });
    }

    Object.assign(crop, buildCropPayload(req.body));
    crop.images = nextImages;

    await crop.save();
    cropSaved = true;

    if (replaceImages && uploadedImages.length > 0) {
      await Promise.allSettled(previousImages.map((image) => deleteFromCloudinary(image.publicId)));
    }

    return res.status(200).json({
      success: true,
      message: "Crop updated successfully",
      crop: await Crop.findById(crop._id).populate(populateFarmer),
    });
  } catch (error) {
    if (!cropSaved) {
      await Promise.allSettled(uploadedImages.map((image) => deleteFromCloudinary(image.publicId)));
    }

    return next(error);
  }
};

const deleteCrop = async (req, res, next) => {
  const validationErrorResponse = handleValidation(req, res);
  if (validationErrorResponse) {
    return validationErrorResponse;
  }

  try {
    const farmerProfile = await getFarmerProfileForUser(req.user._id);

    if (!farmerProfile) {
      return res.status(404).json({
        success: false,
        message: "Farmer profile not found. Create a farmer profile before deleting crops.",
      });
    }

    const crop = await Crop.findById(req.params.id);

    if (!crop) {
      return res.status(404).json({
        success: false,
        message: "Crop not found",
      });
    }

    if (!crop.farmer.equals(farmerProfile._id)) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own crop listings",
      });
    }

    await Promise.allSettled(crop.images.map((image) => deleteFromCloudinary(image.publicId)));
    await crop.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Crop deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createCropValidation,
  updateCropValidation,
  listCropValidation,
  cropIdValidation,
  createCrop,
  listCrops,
  getCropById,
  updateCrop,
  deleteCrop,
};
