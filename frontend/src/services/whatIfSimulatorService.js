import { apiRequest, buildQueryString } from "./apiClient";

export function getWhatIfContext(crop) {
  return apiRequest(
    `/api/ai/decision-engine/simulation-context${buildQueryString({ crop })}`
  );
}

export function runWhatIfSimulation(payload) {
  return apiRequest("/api/ai/decision-engine/simulate", {
    method: "POST",
    body: payload,
  });
}
