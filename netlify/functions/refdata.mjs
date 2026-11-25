// GET /api/refdata — status of every reference-data source (what was checked, when, and how).
// GET /api/refdata?refresh=1 — re-check any source older than its click time-to-live (1 h for calendars), within ~8 s.
import { buildRefdata, loadRefdata, assemble } from '../../lib/refdata/build.mjs';
import { json } from '../../lib/http.mjs';

export default async (req) => {
  try {
    const refresh = new URL(req.url).searchParams.get('refresh') === '1';
    const ref = refresh ? await buildRefdata({ mode: 'click', budgetMs: 8000 }) : await loadRefdata();
    const out = assemble(ref);
    return json({ ok: true, builtAt: ref?.builtAt || null, refreshed: ref?.refreshed || [], status: out.status, counts: { events: out.calendar.length, watch: out.watch.length } }, { cdn: 0, swr: 0 });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, { cdn: 0, swr: 0 });
  }
};
export const config = { path: '/api/refdata' };
