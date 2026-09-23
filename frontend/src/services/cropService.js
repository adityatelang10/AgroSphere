import { apiRequest, buildQueryString } from "./apiClient";

export function listCrops(filters = {}) {
  return apiRequest(`/api/crops${buildQueryString(filters)}`);
}

export function getCropById(cropId) {
  return apiRequest(`/api/crops/${cropId}`);
}

export function createCrop(cropData) {
  return apiRequest(`/api/crops`, {
    method: "POST",
    body: cropData,
  });
}

export function removeCrop(cropId) {
  return apiRequest(`/api/crops/${cropId}`, { method: "DELETE" });
}

export function ensureCropTraceability(cropId) {
  return apiRequest(`/api/crops/${cropId}/traceability`, {
    method: "POST",
  });
}
