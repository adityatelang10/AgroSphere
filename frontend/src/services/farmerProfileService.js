import { apiRequest } from "./apiClient";

export function getOwnFarmerProfile() {
  return apiRequest("/api/farmer/profile");
}

export function updateFarmerProfileImage(file) {
  const formData = new FormData();
  formData.append("profileImage", file);

  return apiRequest("/api/farmer/profile/image", {
    method: "PUT",
    body: formData,
  });
}
