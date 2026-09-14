import { apiRequest } from "./apiClient";

export function createTestPaymentOrder(payload) {
  return apiRequest("/api/payments/create-order", {
    method: "POST",
    body: payload,
  });
}

export function verifyTestPayment(payload) {
  return apiRequest("/api/payments/verify", {
    method: "POST",
    body: payload,
  });
}

export function cancelTestPaymentAttempt(paymentAttemptId) {
  return apiRequest(`/api/payments/${paymentAttemptId}/cancel`, {
    method: "POST",
  });
}
