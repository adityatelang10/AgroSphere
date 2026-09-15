import { apiRequest, buildQueryString } from "./apiClient";

export function getLatestMandiPrices(query, { signal } = {}) {
  return apiRequest(`/api/market/mandi/latest${buildQueryString(query)}`, { signal });
}
