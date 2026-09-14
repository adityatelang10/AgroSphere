export function toFiniteWeatherNumber(value) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function formatWeatherNumber(value, digits = 1, unit = "") {
  const numericValue = toFiniteWeatherNumber(value);
  if (numericValue === null) {
    return "Not available";
  }

  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: digits,
  }).format(numericValue) + unit;
}
