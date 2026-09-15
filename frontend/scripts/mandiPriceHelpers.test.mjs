import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NO_REPORT_MESSAGE, formatMandiDate, formatMandiPrice, getCommodities, getDistricts,
  getMandiFreshness, getMarkets, getSelectedRecords, initialMandiSelection, mandiRecordKey, quintalToKg,
} from "../src/utils/mandiPriceHelpers.js";

// Synthetic fixtures only; UI choices must come from the actual Node response.
const records = [
  { district: "A", market: "One", commodity: "Tomato", variety: "Round", grade: "Local" },
  { district: "A", market: "One", commodity: "Tomato", variety: "Other", grade: "FAQ" },
  { district: "A", market: "One", commodity: "Beans" },
  { district: "A", market: "Two", commodity: "Maize" },
  { district: "B", market: "One", commodity: "Groundnut" },
];

test("district options are unique and derived from records", () => {
  assert.deepEqual(getDistricts(records), ["A", "B"]);
});
test("market options are restricted to the selected district", () => {
  assert.deepEqual(getMarkets(records, "A"), ["One", "Two"]);
  assert.deepEqual(getMarkets(records, "B"), ["One"]);
});
test("commodity options respect district AND market, including repeated market names", () => {
  assert.deepEqual(getCommodities(records, "A", "One"), ["Beans", "Tomato"]);
  assert.deepEqual(getCommodities(records, "B", "One"), ["Groundnut"]);
});
test("all selected varieties and grades are retained as separate rows", () => {
  const selected = getSelectedRecords(records, { district: "A", market: "One", commodity: "Tomato" });
  assert.equal(selected.length, 2);
  assert.notEqual(mandiRecordKey(selected[0]), mandiRecordKey(selected[1]));
});
test("cascading changes reset stale market and commodity choices", () => {
  assert.deepEqual(initialMandiSelection(records), { district: "A", market: "One", commodity: "Beans" });
  assert.deepEqual(initialMandiSelection(records, "B"), { district: "B", market: "One", commodity: "Groundnut" });
  assert.deepEqual(initialMandiSelection(records, "A", "Two"), { district: "A", market: "Two", commodity: "Maize" });
});
test("empty snapshot and unknown selections do not manufacture options or zero prices", () => {
  assert.deepEqual(initialMandiSelection([]), { district: "", market: "", commodity: "" });
  assert.deepEqual(getSelectedRecords(records, { district: "Bidar", market: "Missing", commodity: "Tomato" }), []);
  assert.deepEqual(getDistricts([]), []);
  assert.equal(NO_REPORT_MESSAGE, "No current mandi report is available for this selection.");
});
test("calculated quintal to kilogram equivalent divides by 100", () => {
  assert.equal(quintalToKg(1600), 16);
  assert.equal(quintalToKg("1666.5"), 16.665);
  assert.equal(formatMandiPrice(quintalToKg(1600), true), "₹16.00");
  assert.equal(formatMandiPrice(1600), "₹1,600");
});
test("invalid conversion and formatting stay unavailable, never assumed zero", () => {
  for (const value of [null, undefined, "", " ", 0, "0", -1, "bad", NaN, Infinity, [], true]) {
    assert.equal(quintalToKg(value), null);
    assert.equal(formatMandiPrice(value), "Unavailable");
  }
});
test("date display is timezone-independent and rejects invalid dates", () => {
  assert.equal(formatMandiDate("2026-09-14"), "14 Sept 2026");
  for (const value of [null, "14/09/2026", "2026-02-30", "", "invalid"]) assert.equal(formatMandiDate(value), "Unavailable");
});
test("Reported today uses Asia/Kolkata and updates at Indian midnight", () => {
  assert.equal(getMandiFreshness("2026-09-14", new Date("2026-09-14T18:29:59Z")).label, "Reported today");
  const next = getMandiFreshness("2026-09-14", new Date("2026-09-14T18:30:00Z"));
  assert.equal(next.status, "RECENT");
  assert.equal(next.ageDays, 1);
  assert.match(next.label, /1 day since reported date/);
});
test("freshness thresholds and future dates remain truthful", () => {
  const now = new Date("2026-09-14T10:00:00Z");
  for (const [date, status] of [["2026-09-12", "RECENT"], ["2026-09-11", "OLDER"], ["2026-09-07", "OLDER"], ["2026-09-06", "STALE"], ["2026-09-15", "FUTURE"]]) {
    assert.equal(getMandiFreshness(date, now).status, status);
  }
  assert.equal(getMandiFreshness(null, now).status, "UNAVAILABLE");
});
test("new panel precedes historical form and preserves its service and archive caveat", () => {
  const page = readFileSync(new URL("../src/pages/farmer/MarketIntelligencePage.jsx", import.meta.url), "utf8");
  assert.ok(page.indexOf("<LatestMandiPricePanel />") < page.indexOf("<form onSubmit={handleSubmit}"));
  assert.match(page, /Historical Market Analysis/);
  assert.match(page, /Historical dataset through 30 June 2021/);
  assert.match(page, /await requestMarketIntelligence\(payload\)/);
});
test("frontend service targets credentialed Node client only; no provider key or direct request", () => {
  const service = readFileSync(new URL("../src/services/mandiPriceService.js", import.meta.url), "utf8");
  assert.match(service, /apiRequest/);
  assert.match(service, /\/api\/market\/mandi\/latest/);
  assert.doesNotMatch(service, /api\.data\.gov\.in|DATA_GOV_API_KEY|api-key/);
});
