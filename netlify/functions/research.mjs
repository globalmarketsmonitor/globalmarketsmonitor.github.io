// GET /api/research — data for the Beyond Equities and Investment View tabs: 10-year weekly statistics for 60 markets,
// futures-curve carry, CFTC flows, policy rates, CPI, real exchange rates and the signal backtest.
// The full build runs every 3 hours in research-refresh; this returns the stored copy plus the current reference data:
// IMF forecasts from the IMF's data API, MSCI ACWI weights rolled forward from the last factsheet, and the regulator watch.
import { researchFast } from '../../lib/research.mjs';
import { ALTS, EQUITY, POLICY, IMF, MSCI, INDIA_LIMITS, LIMITS_VERIFIED, SOURCES } from '../../lib/research-config.mjs';
import { getReference } from '../../lib/refdata/build.mjs';
import { json } from '../../lib/http.mjs';

export const CONFIG = { alts: ALTS, equity: EQUITY, policy: POLICY, imf: IMF, msci: MSCI, limits: INDIA_LIMITS, sources: SOURCES };

// Index weights move with each market's price. Roll the factsheet weights forward with country-ETF USD price moves,
// using the ACWI ETF for the total so the rest of the world absorbs the difference.
function driftWeights(R) {
  const A = R?.assets || {}, t0 = R?.sparkFrom ? Date.parse(R.sparkFrom) : null;
  const at = (a, d) => { if (!t0 || !a?.spark) return null; const t = Date.parse(d), dw = (new Date(t).getUTCDay() + 6) % 7, i = Math.round((t - dw * 864e5 - t0) / (7 * 864e5)); return i >= 0 && i < a.spark.length ? a.spark[i] : null; };
  const ratio = (a) => { const x0 = at(a, MSCI.asOf), x1 = a?.spark?.at(-1); if (!(x0 > 0 && x1 > 0)) return null; const yrs = (Date.parse(R.asOfWeek) - Date.parse(MSCI.asOf)) / (365 * 864e5); return x1 / x0 / (1 + (Number.isFinite(a.dist) ? a.dist : 0) * Math.max(0, yrs)); };
  const rAll = ratio(A.acwi); if (!rAll) return null;
  const w = {}; for (const e of EQUITY) { const r = ratio(A['eq_' + e.code]); if (!r) return null; w[e.code] = Math.round(((e.acwi * r) / rAll) * 100) / 100; }
  return { weights: w, from: MSCI.asOf, to: R.asOfWeek };
}

export function withReference(R, ref) {
  const imf = ref?.imf, drift = driftWeights(R);
  const equity = EQUITY.map((e) => {
    const g = imf?.countries?.[e.code]?.every((x) => Number.isFinite(x)) ? imf.countries[e.code] : null;
    return { ...e, ...(g ? { g, old: undefined } : {}), acwiAnchor: e.acwi, ...(drift ? { acwi: drift.weights[e.code] } : {}) };
  });
  return {
    ...CONFIG, equity,
    imf: imf ? { ...IMF, vintage: imf.vintage, updated: imf.updated, checked: imf.checked, world: imf.countries.world, dm: imf.countries.dm, em: imf.countries.em, auto: true } : { ...IMF, auto: false },
    imfYears: imf?.years || [2026, 2027, 2031],
    msci: { ...MSCI, drift: drift ? { from: drift.from, to: drift.to } : null },
    limitsVerified: LIMITS_VERIFIED, watch: ref?.watch || [],
  };
}

export default async () => {
  try {
    const [R, ref] = await Promise.all([researchFast(), getReference().catch(() => null)]);
    return json({ ...R, config: withReference(R, ref) }, { cdn: 1800, swr: 43200 });
  } catch (e) { return json({ ok: false, error: String(e.message || e), fetchedAt: new Date().toISOString() }, { cdn: 60, swr: 300 }); }
};
export const config = { path: '/api/research' };
