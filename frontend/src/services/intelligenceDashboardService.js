import { apiRequest } from "./apiClient";

export function getFarmerIntelligenceDashboard() {
  return apiRequest("/api/ai/intelligence-dashboard");
}
