const { getMlServiceHealth } = require("../services/mlServiceClient");

const getAiHealth = async (req, res, next) => {
  try {
    const health = await getMlServiceHealth();

    return res.status(200).json({
      success: true,
      ...health,
    });
  } catch (error) {
    if (error.statusCode === 503) {
      return res.status(503).json({
        success: false,
        message: "AI service is currently unavailable",
      });
    }

    return next(error);
  }
};

module.exports = {
  getAiHealth,
};
