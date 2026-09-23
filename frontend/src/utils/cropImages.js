export const MAX_CROP_IMAGES = 5;
export const MAX_CROP_IMAGE_BYTES = 5 * 1024 * 1024;

export function getCropImages(crop) {
  const seen = new Set();
  return [...(Array.isArray(crop?.images) ? crop.images : []), crop?.imageUrl, crop?.image]
    .flatMap((image) => {
      const value = typeof image === "string" ? image : image?.url;
      const url = typeof value === "string" ? value.trim() : "";
      if (!url || seen.has(url)) return [];
      seen.add(url);
      return [{ url }];
    });
}

export function selectCropImages(currentFiles, selectedFiles) {
  const selected = Array.from(selectedFiles || []);
  for (const file of selected) {
    if (!file.type.startsWith("image/")) {
      return { files: currentFiles, error: "Only image files are allowed." };
    }
    if (!file.size) {
      return { files: currentFiles, error: "Empty image files cannot be uploaded." };
    }
    if (file.size > MAX_CROP_IMAGE_BYTES) {
      return { files: currentFiles, error: "Each image must be 5 MB or smaller." };
    }
  }

  const files = [...currentFiles];
  for (const file of selected) {
    const alreadySelected = files.some((existing) =>
      existing.name === file.name && existing.size === file.size &&
      existing.type === file.type && existing.lastModified === file.lastModified
    );
    if (!alreadySelected) files.push(file);
  }
  if (files.length > MAX_CROP_IMAGES) {
    return { files: currentFiles, error: "A crop can have at most 5 images. Remove one before adding more." };
  }
  return { files, error: "" };
}
