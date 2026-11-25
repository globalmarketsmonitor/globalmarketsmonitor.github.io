// GET /api/live — intraday PE, P/B, dividend yield and price for the four Nifty indices (NSE).
import { nseLive, saveLastGood, loadLastGood } from '../../lib/sources.mjs';
import { json } from '../../lib/http.mjs';

export default async () => {
  try {
    const live = await nseLive();
    await saveLastGood('live', live);
    return json({ ok: true, source: 'NSE India (allIndices)', fetchedAt: new Date().toISOString(), ...live }, { cdn: 30, swr: 120 });
  } catch (e) {
    const last = await loadLastGood('live');
    if (last?.value) return json({ ok: true, stale: true, source: `NSE India (last saved ${last.savedAt})`, error: String(e.message || e), fetchedAt: new Date().toISOString(), ...last.value }, { cdn: 15, swr: 60 });
    // Front end falls back to the latest daily close from /api/history.
    return json({ ok: false, error: String(e.message || e), fetchedAt: new Date().toISOString() }, { cdn: 15, swr: 60 });
  }
};
export const config = { path: '/api/live' };
