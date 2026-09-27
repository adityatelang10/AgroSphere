import { apiRequest } from "./apiClient";

export function getOwnFarmerProfile() {
  return apiRequest("/api/farmer/profile");
}

export function updateFarmerBio(bio) {
  return apiRequest("/api/farmer/profile", { method: "PATCH", body: { bio } });
}

export function getPublicFarmerProfile(id) {
  return apiRequest(`/api/farmer/public/${id}`);
}

export function addFarmGalleryImages(files) {
  const body = new FormData();
  files.forEach((file) => body.append("images", file));
  return apiRequest("/api/farmer/profile/gallery", { method: "POST", body });
}

export function removeFarmGalleryImage(imageId) {
  return apiRequest(`/api/farmer/profile/gallery/${imageId}`, { method: "DELETE" });
}

export function updateFarmerProfileImage(file) {
  const formData = new FormData();
  formData.append("profileImage", file);

  return apiRequest("/api/farmer/profile/image", {
    method: "PUT",
    body: formData,
  });
}
