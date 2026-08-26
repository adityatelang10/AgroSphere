import { apiRequest } from "./apiClient";

export function requestIrrigationAdvice(payload) {
  return apiRequest("/api/ai/irrigation-advice", {
    method: "POST",
    body: payload,
  });
}
