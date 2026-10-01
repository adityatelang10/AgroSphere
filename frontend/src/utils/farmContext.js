// Exact names only: a listing called "Tomato seedlings" is not silently a Tomato crop.
export const cropKey = (name) => String(name || "").trim().toLowerCase().replace(/[ -]+/g, "_");
export const localDate = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const supportedCrop = (listing, values) => {
  const key = cropKey(listing?.name);
  return values.includes(key) ? key : "";
};
export const listingQuantity = (listing) => typeof listing?.stockQuantity === "number" &&
  Number.isFinite(listing.stockQuantity) && listing.stockQuantity >= 0 ? String(listing.stockQuantity) : "";
export const listingQuintals = (listing) => {
  const quantity = listingQuantity(listing);
  const factor = { kg: .01, gram: .00001, quintal: 1 }[listing?.unit];
  return quantity !== "" && factor ? String(Number((Number(quantity) * factor).toFixed(8))) : "";
};
// A farmer edit (including clearing an input) always wins over a late response.
export function mergePrefill(current, values, dirty = {}) {
  let changed = false;
  const next = { ...current };
  for (const [key, value] of Object.entries(values)) {
    if (!dirty[key] && value !== undefined && value !== null && value !== "" && next[key] !== value) {
      next[key] = value; changed = true;
    }
  }
  return changed ? next : current;
}

export function requestDeviceLocation(geolocation = navigator.geolocation) {
  return new Promise((resolve, reject) => {
    if (!geolocation) return reject(new Error("Location is unavailable. Enter coordinates manually."));
    geolocation.getCurrentPosition(({ coords }) => resolve({
      latitude: Number(coords.latitude.toFixed(6)), longitude: Number(coords.longitude.toFixed(6)),
    }), () => reject(new Error("Location permission was denied or location is unavailable. Retry or enter coordinates manually.")),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 });
  });
}
