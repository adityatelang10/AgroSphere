import { toFiniteWeatherNumber } from "./weatherValues.js";

const NUMERIC_WEATHER_FIELDS = {
  minimumTemperature: "minimumTemperatureC",
  maximumTemperature: "maximumTemperatureC",
  latitude: "latitude",
  forecastRainfall: "forecastRainfallNext24HoursMm",
};

export const WEATHER_ASSISTED_FIELDS = new Set([
  ...Object.keys(NUMERIC_WEATHER_FIELDS),
  "observationDate",
]);

export function getIrrigationWeatherUpdates(weather) {
  const updates = {};
  for (const [field, weatherField] of Object.entries(NUMERIC_WEATHER_FIELDS)) {
    const value = toFiniteWeatherNumber(weather?.irrigationInputs?.[weatherField]);
    if (value !== null) {
      updates[field] = String(value);
    }
  }

  const date = weather?.today?.date;
  if (typeof date === "string" && date.trim() !== "") {
    updates.observationDate = date;
  }

  // Recent rainfall is never inferred from current, daily or forecast precipitation.
  return updates;
}

export function getIrrigationWeatherSources(currentSources, updates) {
  const sources = { ...currentSources, recentRainfall: "manual" };
  for (const field of WEATHER_ASSISTED_FIELDS) {
    if (Object.hasOwn(updates, field)) {
      sources[field] = "weather";
    } else if (sources[field] === "weather") {
      // Do not label a value retained from an older response as fresh weather data.
      sources[field] = "retained";
    }
  }
  return sources;
}
