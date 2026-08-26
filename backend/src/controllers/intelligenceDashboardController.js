const {
  getIntelligenceDashboard,
} = require("../services/intelligenceDashboardService");

const getFarmerIntelligenceDashboard = async (req, res, next) => {
  try {
    const dashboard = await getIntelligenceDashboard({ farmer: req.user });
    return res.status(200).json(dashboard);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getFarmerIntelligenceDashboard,
};
