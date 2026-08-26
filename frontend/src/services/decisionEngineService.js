import { apiRequest, buildQueryString } from "./apiClient";

export function getDecisionEvidence(crop) {
  return apiRequest(
    `/api/ai/decision-engine/evidence${buildQueryString({ crop })}`
  );
}

export function requestFarmDecision(payload) {
  return apiRequest("/api/ai/decision-engine", {
    method: "POST",
    body: payload,
  });
}
