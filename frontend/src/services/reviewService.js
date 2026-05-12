import { apiRequest } from "./apiClient";

export function getCropReviews(cropId) {
  return apiRequest(`/api/reviews/crop/${cropId}`);
}
