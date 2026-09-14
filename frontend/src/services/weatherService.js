import { apiRequest, buildQueryString } from "./apiClient";

export function getWeather({ latitude, longitude }) {
  return apiRequest(
    `/api/weather${buildQueryString({ latitude, longitude })}`
  );
}
