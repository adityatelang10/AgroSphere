export const NO_REPORT_MESSAGE = "No current mandi report is available for this selection.";

const unique = (records, field) => [...new Set(records.map((record) => record[field])
  .filter((value) => typeof value === "string" && value.trim()))].sort((a, b) => a.localeCompare(b));

export const getDistricts = (records) => unique(records, "district");
export const getMarkets = (records, district) => unique(records.filter((record) => record.district === district), "market");
export const getCommodities = (records, district, market) => unique(records.filter((record) =>
  record.district === district && record.market === market), "commodity");
export const getSelectedRecords = (records, { district, market, commodity }) => records.filter((record) =>
  record.district === district && record.market === market && record.commodity === commodity);

export const initialMandiSelection = (records, district = getDistricts(records)[0] || "", market) => {
  const selectedMarket = market ?? getMarkets(records, district)[0] ?? "";
  return { district, market: selectedMarket, commodity: getCommodities(records, district, selectedMarket)[0] || "" };
};

const positiveNumber = (value) => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export const quintalToKg = (value) => {
  const number = positiveNumber(value);
  return number === null ? null : number / 100;
};

export const formatMandiPrice = (value, fixedDecimals = false) => {
  const number = positiveNumber(value);
  return number === null ? "Unavailable" : new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2,
    minimumFractionDigits: fixedDecimals ? 2 : 0,
  }).format(number);
};

const validIsoDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
};

export const formatMandiDate = (value) => {
  const date = validIsoDate(value);
  return date ? new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  }).format(date) : "Unavailable";
};

export const getMandiFreshness = (reportedDate, now = new Date()) => {
  const date = validIsoDate(reportedDate);
  if (!date || !Number.isFinite(now.getTime())) return { status: "UNAVAILABLE", label: "Reporting date unavailable" };
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  const today = Date.parse(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`);
  const ageDays = Math.round((today - date.getTime()) / 86400000);
  if (ageDays < 0) return { ageDays, status: "FUTURE", label: "Future reporting date — not current data" };
  const status = ageDays === 0 ? "TODAY" : ageDays <= 2 ? "RECENT" : ageDays <= 7 ? "OLDER" : "STALE";
  return { ageDays, status, label: ageDays === 0 ? "Reported today" :
    `Reported ${formatMandiDate(reportedDate)} · ${ageDays} ${ageDays === 1 ? "day" : "days"} since reported date` };
};

export const mandiRecordKey = (record) => JSON.stringify([
  record.state, record.district, record.market, record.commodity, record.variety, record.grade,
  record.reportedDate, record.minPrice, record.modalPrice, record.maxPrice,
]);
