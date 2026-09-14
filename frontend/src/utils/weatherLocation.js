import { toFiniteWeatherNumber } from "./weatherValues.js";

const WEATHER_LOCATION_KEY = "agrosphere.weather-location.v1";

const isValidCoordinate = (value, minimum, maximum) => {
  const numericValue = toFiniteWeatherNumber(value);
  return numericValue !== null && numericValue >= minimum && numericValue <= maximum;
};

export function readWeatherLocation() {
  try {
    const savedValue = window.localStorage.getItem(WEATHER_LOCATION_KEY);
    if (!savedValue) {
      return null;
    }

    const location = JSON.parse(savedValue);
    if (
      !isValidCoordinate(location.latitude, -90, 90) ||
      !isValidCoordinate(location.longitude, -180, 180)
    ) {
      return null;
    }

    return {
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
    };
  } catch (error) {
    return null;
  }
}

export function saveWeatherLocation({ latitude, longitude }) {
  if (
    !isValidCoordinate(latitude, -90, 90) ||
    !isValidCoordinate(longitude, -180, 180)
  ) {
    return;
  }

  try {
    window.localStorage.setItem(
      WEATHER_LOCATION_KEY,
      JSON.stringify({
        latitude: Number(latitude),
        longitude: Number(longitude),
      })
    );
  } catch (error) {
    // Weather continues to work even when storage is unavailable or disabled.
  }
}

export function validateWeatherCoordinates(latitude, longitude) {
  if (!isValidCoordinate(latitude, -90, 90)) {
    return "Latitude must be between -90 and 90.";
  }

  if (!isValidCoordinate(longitude, -180, 180)) {
    return "Longitude must be between -180 and 180.";
  }

  return "";
}
