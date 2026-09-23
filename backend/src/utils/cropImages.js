// Read-only compatibility for older single-image records. Public callers get
// only URLs; never spread stored image metadata into a public response.
const publicCropImages = (crop) => {
  const source = crop?.toObject ? crop.toObject() : crop || {};
  const candidates = [
    ...(Array.isArray(source.images) ? source.images : []),
    source.imageUrl,
    source.image,
  ];
  const seen = new Set();

  return candidates.flatMap((image) => {
    const value = typeof image === "string" ? image : image?.url;
    const url = typeof value === "string" ? value.trim() : "";
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{ url }];
  });
};

module.exports = { publicCropImages };
