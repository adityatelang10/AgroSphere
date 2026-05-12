import { apiRequest } from "./apiClient";

export function checkout(payload) {
  return apiRequest("/api/orders/checkout", {
    method: "POST",
    body: payload,
  });
}

export function getMyOrders() {
  return apiRequest("/api/orders/my-orders");
}

export function getFarmerOrders() {
  return apiRequest("/api/orders/farmer");
}

export function updateOrderStatus(orderId, status) {
  return apiRequest(`/api/orders/${orderId}/status`, {
    method: "PATCH",
    body: { status },
  });
}
