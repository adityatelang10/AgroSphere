export function getPublicTraceUrl(traceabilityId) {
  if (!traceabilityId || typeof window === "undefined") {
    return "";
  }

  return new URL(
    `/trace/${encodeURIComponent(traceabilityId)}`,
    window.location.origin
  ).toString();
}
