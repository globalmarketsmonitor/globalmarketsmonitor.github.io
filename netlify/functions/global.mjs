// GET /api/global — live ETF trailing PE (Yahoo Finance) beside Siblis Research month-end and year-end PE.
// Siblis readings come from its API through the reference-data engine; the verified bundled figures in lib/config.mjs
// are used where they are newer (or where the API tier does not cover a market). The newest reading always wins.
import { MARKETS, SIBLIS_ASOF } from '../../lib/config.mjs';
import { etfQuotes, saveLastGood, loadLastGood } from '../../lib/sources.mjs';
import { getReference } from '../../lib/refdata/build.mjs';
import { json } from '../../lib/http.mjs';

const BUNDLED_YEARS = [2021, 2022, 2023, 2024, 2025]; // years of the bundled `ye` arrays

export default async () => {
  let quotes = {}, liveError = null, quotesAsOf = null;
  const [q, ref] = await Promise.all([etfQuotes().then((x) => ({ x })).catch((e) => ({ e })), getReference().catch(() => null)]);
  if (q.x) { quotes = q.x; await saveLastGood('etf', quotes); }
  else {
    liveError = String(q.e?.message || q.e);
    const last = await loadLastGood('etf');
    if (last?.value) { quotes = last.value; quotesAsOf = last.savedAt; }
  }
  const api = ref?.siblis?.markets || {}, tier = ref?.siblis?.tier || null;
  // Five year-ends ending at the latest December the world index has (API or bundled).
  const worldYE = Object.keys(api['Global (All-country)']?.yearEnds || {}).map(Number);
  const last = Math.max(BUNDLED_YEARS.at(-1), ...worldYE), years = [last - 4, last - 3, last - 2, last - 1, last];
  const markets = MARKETS.map((m) => {
    const q = quotes[m.etf] || {}, a = api[m.market];
    const useApi = a && a.asOf > SIBLIS_ASOF;
    const pe = useApi ? a.pe : m.siblis, asOf = useApi ? a.asOf : m.siblis != null ? SIBLIS_ASOF : null;
    const ye = years.map((y) => a?.yearEnds?.[y] ?? (m.ye && BUNDLED_YEARS.includes(y) ? m.ye[BUNDLED_YEARS.indexOf(y)] : null));
    const avg5 = ye.every((v) => v != null) ? ye.reduce((s, v) => s + v, 0) / ye.length : null;
    return {
      market: m.market, group: m.group, etf: m.etf,
      livePE: q.pe ?? null, etfPrice: q.price ?? null, etfChangePct: q.changePct ?? null, quoteTime: q.time ?? null, marketState: q.state ?? null,
      siblisPE: pe, siblisAsOf: asOf, siblisFrom: useApi ? `Siblis API (${tier})` : 'Verified month-end (bundled)',
      yearEnds: ye, avg5, vsAvg5: avg5 && pe != null ? pe / avg5 - 1 : null,
    };
  });
  const dates = markets.map((m) => m.siblisAsOf).filter(Boolean).sort();
  return json({ ok: true, fetchedAt: new Date().toISOString(), liveError, quotesAsOf, siblisAsOf: dates.at(-1) || SIBLIS_ASOF, siblisOldest: dates[0] || null, siblisTier: tier, yearEnds: years.map((y) => `Dec-${String(y).slice(2)}`), yearEndYears: years, markets }, { cdn: 120, swr: 600 });
};
export const config = { path: '/api/global' };
