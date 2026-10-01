import { apiRequest, buildQueryString } from "./apiClient";

export function getWeather({ latitude, longitude }, options = {}) {
  return apiRequest(
    `/api/weather${buildQueryString({ latitude, longitude })}`,
    options
  );
}
