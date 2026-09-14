const {
  WeatherServiceError,
  getWeather,
} = require("../services/weatherService");

const getCurrentWeather = async (req, res, next) => {
  try {
    const weather = await getWeather({
      latitude: req.query.latitude,
      longitude: req.query.longitude,
    });
    return res.status(200).json(weather);
  } catch (error) {
    if (error instanceof WeatherServiceError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
};

module.exports = {
  getCurrentWeather,
};
