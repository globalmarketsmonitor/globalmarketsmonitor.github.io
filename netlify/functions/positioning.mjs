// GET /api/positioning — global 10-year yields, CFTC positioning, stock–bond correlation and volatility regime.
// The full build (~10 s of upstream calls) runs every 3 hours in positioning-refresh; this returns the stored copy.
import { positioningFast } from '../../lib/positioning.mjs';
import { json } from '../../lib/http.mjs';

export default async () => {
  try { return json(await positioningFast(), { cdn: 900, swr: 43200 }); }
  catch (e) { return json({ ok: false, error: String(e.message || e), fetchedAt: new Date().toISOString() }, { cdn: 60, swr: 300 }); }
};
export const config = { path: '/api/positioning' };
