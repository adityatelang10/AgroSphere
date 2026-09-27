import { apiRequest } from "./apiClient";

export function getCropReviews(cropId) {
  return apiRequest(`/api/reviews/crop/${cropId}`);
}

export function getMyReviews() {
  return apiRequest("/api/reviews/mine");
}

export function createReview(values) {
  return apiRequest("/api/reviews", { method: "POST", body: values });
}

export function updateReview(id, values) {
  return apiRequest(`/api/reviews/${id}`, { method: "PATCH", body: values });
}
