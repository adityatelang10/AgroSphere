export const MAX_FARM_IMAGES = 8;
export const MAX_FARM_IMAGE_BYTES = 5 * 1024 * 1024;

export function selectFarmImages(current, incoming, savedCount) {
  const files = [...current];
  for (const file of incoming) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size) {
      return { files: current, error: "Choose non-empty JPEG, PNG, or WEBP images." };
    }
    if (file.size > MAX_FARM_IMAGE_BYTES) {
      return { files: current, error: "Each farm photo must be 5 MB or smaller." };
    }
    if (!files.some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) files.push(file);
  }
  if (savedCount + files.length > MAX_FARM_IMAGES) {
    return { files: current, error: "Your farm gallery can contain at most 8 photos. Remove a photo to make room." };
  }
  return { files, error: "" };
}
