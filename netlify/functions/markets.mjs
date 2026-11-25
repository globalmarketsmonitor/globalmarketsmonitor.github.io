// GET /api/markets — world markets heatmap, Nifty sectors and factors, market-implied Fed path.
import { buildMarkets } from '../../lib/markets.mjs';
import { json } from '../../lib/http.mjs';

export default async () => {
  try { return json(await buildMarkets(), { cdn: 120, swr: 900 }); }
  catch (e) { return json({ ok: false, error: String(e.message || e), fetchedAt: new Date().toISOString() }, { cdn: 30, swr: 120 }); }
};
export const config = { path: '/api/markets' };
