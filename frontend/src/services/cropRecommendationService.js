import { apiRequest } from "./apiClient";

export function requestCropRecommendation(payload) {
  return apiRequest("/api/ai/crop-recommendation", {
    method: "POST",
    body: payload,
  });
}
