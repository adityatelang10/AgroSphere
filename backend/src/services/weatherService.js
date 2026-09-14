const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_ATTRIBUTION_URL = "https://open-meteo.com/";
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 7000;

const weatherCache = new Map();

class WeatherServiceError extends Error {
  constructor(message, statusCode = 503) {
    super(message);
    this.name = "WeatherServiceError";
    this.statusCode = statusCode;
  }
}

const WEATHER_CODE_LABELS = new Map([
  [0, "Clear sky"],
  [1, "Mainly clear"],
  [2, "Partly cloudy"],
  [3, "Overcast"],
  [45, "Fog"],
  [48, "Depositing rime fog"],
  [51, "Light drizzle"],
  [53, "Moderate drizzle"],
  [55, "Dense drizzle"],
  [56, "Light freezing drizzle"],
  [57, "Dense freezing drizzle"],
  [61, "Slight rain"],
  [63, "Moderate rain"],
  [65, "Heavy rain"],
  [66, "Light freezing rain"],
  [67, "Heavy freezing rain"],
  [71, "Slight snowfall"],
  [73, "Moderate snowfall"],
  [75, "Heavy snowfall"],
  [77, "Snow grains"],
  [80, "Slight rain showers"],
  [81, "Moderate rain showers"],
  [82, "Violent rain showers"],
  [85, "Slight snow showers"],
  [86, "Heavy snow showers"],
  [95, "Thunderstorm"],
  [96, "Thunderstorm with slight hail"],
  [99, "Thunderstorm with heavy hail"],
]);

const TEMPORARY_FAILURE_MESSAGE =
  "Weather data is temporarily unavailable. You can continue using manual irrigation inputs.";

const toFiniteNumber = (value) => {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const validateCoordinates = (latitude, longitude) => {
  const normalizedLatitude = toFiniteNumber(latitude);
  const normalizedLongitude = toFiniteNumber(longitude);

  if (
    normalizedLatitude === null ||
    normalizedLatitude < -90 ||
    normalizedLatitude > 90
  ) {
    throw new WeatherServiceError("Latitude must be between -90 and 90.", 400);
  }

  if (
    normalizedLongitude === null ||
    normalizedLongitude < -180 ||
    normalizedLongitude > 180
  ) {
    throw new WeatherServiceError("Longitude must be between -180 and 180.", 400);
  }

  return {
    latitude: normalizedLatitude,
    longitude: normalizedLongitude,
  };
};

const getWeatherCondition = (weatherCode) =>
  WEATHER_CODE_LABELS.get(toFiniteNumber(weatherCode)) || "Unknown conditions";

const getOffsetSuffix = (offsetSeconds) => {
  const normalizedSeconds = toFiniteNumber(offsetSeconds);
  if (normalizedSeconds === null) {
    return null;
  }
  if (normalizedSeconds === 0) {
    return "Z";
  }

  const sign = normalizedSeconds >= 0 ? "+" : "-";
  const totalMinutes = Math.abs(Math.round(normalizedSeconds / 60));
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
};

const sumNext24HoursPrecipitation = (hourly) => {
  if (!Array.isArray(hourly?.time) || !Array.isArray(hourly?.precipitation)) {
    return null;
  }

  if (hourly.time.length < 24 || hourly.precipitation.length < 24) {
    return null;
  }

  // A partial forecast must not be presented as a complete 24-hour rainfall total.
  let total = 0;
  for (let index = 0; index < 24; index += 1) {
    const precipitation = toFiniteNumber(hourly.precipitation[index]);
    if (
      typeof hourly.time[index] !== "string" ||
      hourly.time[index].trim() === "" ||
      precipitation === null
    ) {
      return null;
    }
    total += precipitation;
  }

  return Number.isFinite(total) ? Number(total.toFixed(2)) : null;
};

const readDailyForecast = (daily, index) => {
  const date = daily?.time?.[index];
  const minimumTemperatureC = toFiniteNumber(daily?.temperature_2m_min?.[index]);
  const maximumTemperatureC = toFiniteNumber(daily?.temperature_2m_max?.[index]);
  const precipitationMm = toFiniteNumber(daily?.precipitation_sum?.[index]);
  const precipitationProbabilityPercent = toFiniteNumber(
    daily?.precipitation_probability_max?.[index]
  );

  if (!date) {
    throw new WeatherServiceError(TEMPORARY_FAILURE_MESSAGE, 502);
  }

  return {
    date,
    minimumTemperatureC,
    maximumTemperatureC,
    precipitationMm,
    precipitationProbabilityPercent,
  };
};

const normalizeOpenMeteoResponse = (payload, requestedCoordinates, fetchedAt) => {
  const current = payload?.current;
  const currentTemperatureC = toFiniteNumber(current?.temperature_2m);
  const relativeHumidityPercent = toFiniteNumber(current?.relative_humidity_2m);
  const currentPrecipitationMm = toFiniteNumber(current?.precipitation);
  const windSpeedKmph = toFiniteNumber(current?.wind_speed_10m);
  const weatherCode = toFiniteNumber(current?.weather_code);

  if (!current?.time) {
    throw new WeatherServiceError(TEMPORARY_FAILURE_MESSAGE, 502);
  }

  const today = readDailyForecast(payload.daily, 0);
  const tomorrow = readDailyForecast(payload.daily, 1);
  const next24HoursRainfallMm = sumNext24HoursPrecipitation(payload.hourly);
  const providerLatitude = toFiniteNumber(payload.latitude);
  const providerLongitude = toFiniteNumber(payload.longitude);
  const offsetSuffix = getOffsetSuffix(payload.utc_offset_seconds);

  return {
    success: true,
    provider: "Open-Meteo",
    location: {
      latitude: providerLatitude ?? requestedCoordinates.latitude,
      longitude: providerLongitude ?? requestedCoordinates.longitude,
      timezone: payload.timezone || "Unknown",
      timezoneAbbreviation: payload.timezone_abbreviation || "",
    },
    current: {
      temperatureC: currentTemperatureC,
      relativeHumidityPercent,
      precipitationMm: currentPrecipitationMm,
      weatherCode,
      condition: getWeatherCondition(weatherCode),
      windSpeedKmph,
    },
    today,
    tomorrow,
    irrigationInputs: {
      minimumTemperatureC: today.minimumTemperatureC,
      maximumTemperatureC: today.maximumTemperatureC,
      latitude: requestedCoordinates.latitude,
      forecastRainfallNext24HoursMm: next24HoursRainfallMm,
      recentRainfallMm: null,
      recentRainfallNote:
        "Enter this manually as rain since the soil-moisture reading; it is not derived from the forecast.",
    },
    observedAt: offsetSuffix === null ? null : `${current.time}${offsetSuffix}`,
    fetchedAt,
    providerAttribution: "Weather data by Open-Meteo.com",
    providerUrl: OPEN_METEO_ATTRIBUTION_URL,
  };
};

const buildForecastUrl = ({ latitude, longitude }) => {
  const url = new URL(OPEN_METEO_FORECAST_URL);
  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m"
  );
  url.searchParams.set("hourly", "precipitation");
  url.searchParams.set(
    "daily",
    "temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max"
  );
  url.searchParams.set("forecast_hours", "24");
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set("timezone", "auto");
  return url;
};

const createWeatherService = ({
  fetchImplementation = global.fetch,
  cache = weatherCache,
  now = () => new Date(),
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) => {
  if (typeof fetchImplementation !== "function") {
    throw new Error("A fetch implementation is required for the weather service.");
  }

  const getWeather = async ({ latitude, longitude }) => {
    const coordinates = validateCoordinates(latitude, longitude);
    const cacheKey = `${coordinates.latitude.toFixed(4)},${coordinates.longitude.toFixed(4)}`;
    const currentTime = now();
    const cachedEntry = cache.get(cacheKey);

    if (cachedEntry && currentTime.getTime() - cachedEntry.cachedAt < CACHE_TTL_MS) {
      return {
        ...cachedEntry.value,
        cache: { status: "HIT", ttlSeconds: CACHE_TTL_MS / 1000 },
      };
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetchImplementation(buildForecastUrl(coordinates), {
        headers: { Accept: "application/json" },
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new WeatherServiceError(TEMPORARY_FAILURE_MESSAGE, 502);
      }

      const payload = await response.json();
      const normalizedWeather = normalizeOpenMeteoResponse(
        payload,
        coordinates,
        currentTime.toISOString()
      );

      cache.set(cacheKey, {
        cachedAt: currentTime.getTime(),
        value: normalizedWeather,
      });

      return {
        ...normalizedWeather,
        cache: { status: "MISS", ttlSeconds: CACHE_TTL_MS / 1000 },
      };
    } catch (error) {
      if (error instanceof WeatherServiceError) {
        throw error;
      }

      throw new WeatherServiceError(TEMPORARY_FAILURE_MESSAGE, 503);
    } finally {
      clearTimeout(timeout);
    }
  };

  return { getWeather };
};

const { getWeather } = createWeatherService();

module.exports = {
  CACHE_TTL_MS,
  OPEN_METEO_FORECAST_URL,
  TEMPORARY_FAILURE_MESSAGE,
  WeatherServiceError,
  buildForecastUrl,
  createWeatherService,
  getWeather,
  getWeatherCondition,
  normalizeOpenMeteoResponse,
  sumNext24HoursPrecipitation,
  validateCoordinates,
};
