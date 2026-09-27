import { apiRequest, buildQueryString } from "./apiClient";

export const startConversation = (farmerProfileId, cropId) => apiRequest("/api/conversations", {
  method: "POST", body: { farmerProfileId, ...(cropId ? { cropId } : {}) },
});
export const getConversations = (offset = 0) => apiRequest(`/api/conversations${buildQueryString({ offset })}`);
export const getMessages = (id, before) => apiRequest(`/api/conversations/${id}/messages${buildQueryString({ before })}`);
export const markConversationRead = (id, throughMessageId) => apiRequest(`/api/conversations/${id}/read`, {
  method: "PATCH", body: { throughMessageId },
});

export function socketRequest(socket, event, payload) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error("Reconnecting… Your message has not been sent. Please try again when connected."));
    socket.timeout(12000).emit(event, payload, (error, response) => {
      if (error) return reject(new Error("Confirmation timed out. Your text is kept; retrying this draft will not duplicate a saved message."));
      if (!response?.success) return reject(new Error(response?.message || "Unable to complete chat request."));
      resolve(response);
    });
  });
}
