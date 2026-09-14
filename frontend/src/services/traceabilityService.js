import { apiRequest } from "./apiClient";

export function getTraceabilityRecord(traceabilityId) {
  return apiRequest(`/api/traceability/${encodeURIComponent(traceabilityId)}`);
}
