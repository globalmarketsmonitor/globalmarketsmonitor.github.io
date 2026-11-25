// GET /api/history — 5 years of daily PE / P/B / dividend yield / EPS for each Nifty index.
import { INDICES } from '../../lib/config.mjs';
import { indexHistory } from '../../lib/sources.mjs';
import { json } from '../../lib/http.mjs';

export default async () => {
  const results = await Promise.all(INDICES.map(async (ix) => [ix.id, { ...ix, ...(await indexHistory(ix)) }]));
  const series = Object.fromEntries(results);
  const anyStale = results.some(([, s]) => s.stale);
  // Daily series update once per evening, so cache for 3h at the CDN (less if serving the snapshot).
  return json({ ok: true, fetchedAt: new Date().toISOString(), series }, { cdn: anyStale ? 600 : 10800, swr: 86400 });
};
export const config = { path: '/api/history' };
