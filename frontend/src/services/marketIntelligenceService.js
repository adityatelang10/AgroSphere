import { apiRequest } from "./apiClient";

export function requestMarketIntelligence(payload) {
  return apiRequest("/api/ai/market-intelligence", {
    method: "POST",
    body: payload,
  });
}
