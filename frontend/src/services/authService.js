import { apiRequest } from "./apiClient";

export function registerUser(payload) {
  return apiRequest("/api/auth/register", {
    method: "POST",
    body: payload,
  });
}

export function loginUser(payload) {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: payload,
  });
}

export function logoutUser() {
  return apiRequest("/api/auth/logout", {
    method: "POST",
  });
}

export function getCurrentUser() {
  return apiRequest("/api/auth/me");
}

export function updateDeliveryAddress(payload) {
  return apiRequest("/api/auth/me/delivery-address", {
    method: "PATCH",
    body: payload,
  });
}
