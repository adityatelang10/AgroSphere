const Crop = require("../models/Crop");
const {
  TRACEABILITY_ID_PATTERN,
  buildPublicTraceabilityRecord,
} = require("../services/traceabilityService");

const sendTraceabilityNotFound = (res) =>
  res.status(404).json({
    success: false,
    message: "Traceability record not found",
  });

const getTraceabilityRecord = async (req, res, next) => {
  try {
    const traceabilityId = String(req.params.traceabilityId || "")
      .trim()
      .toUpperCase();

    if (!TRACEABILITY_ID_PATTERN.test(traceabilityId)) {
      return sendTraceabilityNotFound(res);
    }

    const crop = await Crop.findOne({ traceabilityId })
      .select(
        "traceabilityId name category description price unit stockQuantity season location images harvestDate createdAt farmer"
      )
      .populate({
        path: "farmer",
        select: "farmName location user",
        populate: {
          path: "user",
          select: "name",
        },
      });

    if (!crop) {
      return sendTraceabilityNotFound(res);
    }

    return res.status(200).json({
      success: true,
      traceability: buildPublicTraceabilityRecord(crop),
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getTraceabilityRecord,
};
