import { apiRequest } from "./apiClient";

export function requestDiseaseDetection(imageFile) {
  const formData = new FormData();
  formData.append("image", imageFile);

  return apiRequest("/api/ai/disease-detection", {
    method: "POST",
    body: formData,
  });
}
