// GET /api/macro — growth, inflation, policy, liquidity and risk indicators with 10-year context.
import { macroWithFallback } from '../../lib/macro.mjs';
import { json } from '../../lib/http.mjs';

export default async () => {
  try {
    const m = await macroWithFallback();
    return json(m, { cdn: 1800, swr: 86400 }); // macro data moves slowly: cache 30 min at the CDN
  } catch (e) {
    return json({ ok: false, error: String(e.message || e), fetchedAt: new Date().toISOString() }, { cdn: 60, swr: 300 });
  }
};
export const config = { path: '/api/macro' };
