// Match actual reported names only. Never invent a market or substitute another district.
const same = (left, right) => Boolean(right) && String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
export function contextualMandiSelection(records, location = {}, crop = "") {
  const local = records.filter((row) => same(row.district, location.district) && same(row.state, location.state));
  const district = local[0]?.district || "";
  const matching = local.filter((row) => same(row.commodity, crop));
  const candidates = matching.length ? matching : local;
  const markets = [...new Set(candidates.map((row) => row.market))];
  const market = markets.length === 1 ? markets[0] : "";
  return { district, market, commodity: matching[0]?.commodity || "" };
}
