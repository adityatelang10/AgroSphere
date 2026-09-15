const PROVIDER_URL = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";
const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const CACHE_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const PAGE_SIZE = 100;
const MAX_RECORDS = 2000;
const MAX_CACHE_ENTRIES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const QUERY_FIELDS = ["state", "district", "market", "commodity"];

class MandiPriceServiceError extends Error {
  constructor(code, message, statusCode = 503) {
    super(message);
    this.name = "MandiPriceServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const invalidResponse = () => new MandiPriceServiceError(
  "MANDI_INVALID_RESPONSE", "The mandi price provider returned an invalid response. Please try again later.", 502
);
const providerAuthError = () => new MandiPriceServiceError(
  "MANDI_PROVIDER_AUTH", "The mandi price provider could not authorize this service. Please contact the project administrator."
);

const normalizeQuery = (input = {}) => {
  const query = {};
  for (const field of QUERY_FIELDS) {
    const value = input[field];
    if (field !== "state" && (value === undefined || value === "")) continue;
    if (typeof value !== "string" || !value.trim() || value.trim().length > 120 ||
        /[\u0000-\u001f\u007f*?]/u.test(value)) {
      throw new MandiPriceServiceError("MANDI_INVALID_QUERY", `Provide a valid ${field} (up to 120 characters; no wildcards).`, 400);
    }
    // Preserve provider spelling/case. Do not map crop aliases or market names.
    query[field] = value.trim();
  }
  return query;
};

const parseReportedDate = (value) => {
  if (typeof value !== "string") return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  if (Number(year) < 1000) return null;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 ||
      date.getUTCDate() !== Number(day)) return null;
  return `${year}-${month}-${day}`;
};

const indiaDate = (now) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
};

const getFreshness = (reportedDate, now) => {
  const ageDays = Math.round((Date.parse(`${indiaDate(now)}T00:00:00Z`) -
    Date.parse(`${reportedDate}T00:00:00Z`)) / DAY_MS);
  // AgroSphere display policy only, not a Government freshness standard.
  const status = ageDays < 0 ? "FUTURE" : ageDays === 0 ? "TODAY" :
    ageDays <= 2 ? "RECENT" : ageDays <= 7 ? "OLDER" : "STALE";
  return { ageDays, status };
};

const positivePrice = (value) => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
const usableText = (value) => typeof value === "string" && value.trim() &&
  value.trim().length <= 200 && !/[\u0000-\u001f\u007f]/u.test(value) ? value.trim() : null;

const normalizeRecord = (row, now) => {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const record = {};
  for (const field of QUERY_FIELDS) {
    record[field] = usableText(row[field]);
    if (!record[field]) return null;
  }
  const reportedDate = parseReportedDate(row.arrival_date);
  const minPrice = positivePrice(row.min_price);
  const modalPrice = positivePrice(row.modal_price);
  const maxPrice = positivePrice(row.max_price);
  if (!reportedDate || minPrice === null || modalPrice === null || maxPrice === null ||
      minPrice > modalPrice || modalPrice > maxPrice) return null;
  const freshness = getFreshness(reportedDate, now);
  if (freshness.status === "FUTURE") return null;
  return {
    ...record, variety: usableText(row.variety), grade: usableText(row.grade),
    reportedDate, reportedDateRaw: row.arrival_date,
    minPrice, modalPrice, maxPrice, priceUnit: "INR_PER_QUINTAL", freshness,
  };
};

const recordKey = (row) => JSON.stringify([
  ...QUERY_FIELDS.map((field) => row[field]), row.variety, row.grade, row.reportedDate,
  row.minPrice, row.modalPrice, row.maxPrice,
]);

const integer = (value) => {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};

const createMandiPriceService = ({
  fetchImplementation = (...args) => global.fetch(...args),
  getApiKey = () => process.env.DATA_GOV_API_KEY,
  now = () => new Date(),
  cache = new Map(),
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) => {
  const pending = new Map();

  const collect = async (query, apiKey, signal) => {
    const records = [];
    const seen = new Set();
    const pages = new Set();
    let providerTotal = null;
    let offset = 0;
    let invalidRecordCount = 0;
    let duplicateRecordCount = 0;
    let truncated = false;
    const normalizationTime = now();

    do {
      const url = new URL(PROVIDER_URL);
      url.searchParams.set("api-key", apiKey);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("offset", String(offset));
      for (const [field, value] of Object.entries(query)) url.searchParams.set(`filters[${field}]`, value);

      // Never log this URL, provider bodies, exceptions or their causes (key-bearing).
      const response = await fetchImplementation(url, {
        headers: { Accept: "application/json" }, signal, redirect: "error",
      });
      if ([400, 401, 403].includes(response.status)) throw providerAuthError();
      if (!response.ok) throw new MandiPriceServiceError(
        "MANDI_PROVIDER_UNAVAILABLE", "The mandi price provider is temporarily unavailable. Please try again later."
      );
      if (!response.headers?.get("content-type")?.toLowerCase().includes("application/json")) throw invalidResponse();
      let payload;
      try { payload = await response.json(); } catch { throw invalidResponse(); }
      if (payload?.error || (payload?.status !== undefined && !["ok", "success", 200, "200"].includes(payload.status))) {
        if (/authoriz|api.?key|authentication/i.test(String(payload?.error || payload?.message || ""))) throw providerAuthError();
        throw invalidResponse();
      }
      const total = integer(payload?.total);
      const count = integer(payload?.count);
      const pageOffset = integer(payload?.offset);
      const limit = integer(payload?.limit);
      if (!Array.isArray(payload?.records) || total === null || count === null || limit === null ||
          limit < 1 || limit > PAGE_SIZE || count !== payload.records.length || count > limit ||
          pageOffset !== offset || offset + count > total) throw invalidResponse();
      if (providerTotal !== null && providerTotal !== total) throw invalidResponse();
      providerTotal = total;
      if (!count) {
        if (offset < total) throw invalidResponse();
        break;
      }
      // Detect an upstream offset being ignored instead of silently claiming completeness.
      const pageKey = JSON.stringify(payload.records);
      if (pages.has(pageKey)) { truncated = true; break; }
      pages.add(pageKey);
      for (const row of payload.records) {
        const normalized = normalizeRecord(row, normalizationTime);
        if (!normalized || Object.entries(query).some(([field, value]) => normalized[field] !== value) ||
            JSON.stringify(normalized).includes(apiKey)) {
          invalidRecordCount += 1;
          continue;
        }
        const key = recordKey(normalized);
        if (seen.has(key)) { duplicateRecordCount += 1; continue; }
        seen.add(key);
        records.push(normalized);
      }
      offset += count;
      if (offset >= MAX_RECORDS || pages.size >= MAX_RECORDS / PAGE_SIZE) {
        truncated = offset < total;
        break;
      }
    } while (offset < providerTotal);

    return {
      success: true,
      status: records.length ? "OK" : providerTotal === 0 ? "NO_REPORT" : "NO_VALID_REPORTS",
      source: {
        provider: "data.gov.in", dataset: "AGMARKNET daily mandi prices", resourceId: RESOURCE_ID,
        attribution: "AGMARKNET / Directorate of Marketing and Inspection, Ministry of Agriculture and Farmers Welfare, via data.gov.in",
        priceUnit: "INR_PER_QUINTAL", fetchedAt: now().toISOString(), cached: false,
      },
      query, providerTotal, fetchedRecordCount: offset, validRecordCount: records.length,
      invalidRecordCount, duplicateRecordCount, truncated,
      records: records.sort((a, b) => b.reportedDate.localeCompare(a.reportedDate) || recordKey(a).localeCompare(recordKey(b))),
    };
  };

  const getLatestMandiPrices = async (input) => {
    const query = normalizeQuery(input);
    const apiKey = getApiKey()?.trim();
    if (!apiKey) throw new MandiPriceServiceError("MANDI_NOT_CONFIGURED", "Current mandi price service is not configured.");
    const cacheKey = JSON.stringify(query);
    const currentTime = now();
    for (const [key, entry] of cache) {
      if (currentTime.getTime() - entry.cachedAt >= CACHE_TTL_MS) cache.delete(key);
    }
    const cached = cache.get(cacheKey);
    if (cached) {
      const result = structuredClone(cached.value);
      result.source.cached = true;
      // A cache hit spanning midnight must not keep yesterday's TODAY badge.
      result.records = result.records.map((record) => ({ ...record, freshness: getFreshness(record.reportedDate, currentTime) }));
      return result;
    }
    if (pending.has(cacheKey)) return structuredClone(await pending.get(cacheKey));
    if (pending.size >= MAX_CACHE_ENTRIES) throw new MandiPriceServiceError("MANDI_BUSY", "Mandi price service is busy. Please try again shortly.");

    const request = (async () => {
      const controller = new AbortController();
      let timeout;
      const deadline = new Promise((resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new MandiPriceServiceError("MANDI_TIMEOUT", "The mandi price provider took too long to respond. Please try again later.", 504));
          controller.abort();
        }, timeoutMs);
      });
      try {
        // Eight seconds for the complete paginated lookup, including JSON decoding.
        const value = await Promise.race([collect(query, apiKey, controller.signal), deadline]);
        if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
        cache.set(cacheKey, { cachedAt: now().getTime(), value });
        return value;
      } catch (error) {
        if (error instanceof MandiPriceServiceError) throw error;
        throw new MandiPriceServiceError("MANDI_PROVIDER_UNAVAILABLE", "The mandi price provider is temporarily unavailable. Please try again later.");
      } finally { clearTimeout(timeout); }
    })();
    pending.set(cacheKey, request);
    try { return structuredClone(await request); } finally { pending.delete(cacheKey); }
  };
  return { getLatestMandiPrices };
};

const { getLatestMandiPrices } = createMandiPriceService();
module.exports = {
  CACHE_TTL_MS, MAX_CACHE_ENTRIES, MAX_RECORDS, PAGE_SIZE, REQUEST_TIMEOUT_MS,
  MandiPriceServiceError, createMandiPriceService, getLatestMandiPrices,
  getFreshness, normalizeQuery, normalizeRecord, parseReportedDate,
};
