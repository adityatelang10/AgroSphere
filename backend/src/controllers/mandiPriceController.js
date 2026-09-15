const { MandiPriceServiceError, getLatestMandiPrices } = require("../services/mandiPriceService");

const getLatestMandiPrice = async (req, res) => {
  try {
    const result = await getLatestMandiPrices(req.query);
    return res.status(200).json(result);
  } catch (error) {
    // Keep key-bearing upstream failures away from the global error logger.
    if (error instanceof MandiPriceServiceError) {
      return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
    }
    return res.status(503).json({
      success: false, code: "MANDI_UNAVAILABLE",
      message: "Mandi price service is temporarily unavailable. Please try again later.",
    });
  }
};

module.exports = { getLatestMandiPrice };
