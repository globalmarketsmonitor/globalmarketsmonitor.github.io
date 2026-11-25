// GET /api/mf — the Mutual funds tab: AMFI category flows and SIP data, SEBI SIP split by category, NSDL foreign flows,
// fund houses, and the checks.
// GET /api/mf?refresh=1 — re-check sources past their short (click) time-to-live first, within ~8.5 s.
import { getMF, refreshMF } from '../../lib/mf/engine.mjs';
import { json } from '../../lib/http.mjs';

export default async (req) => {
  const refresh = new URL(req.url).searchParams.get('refresh') === '1';
  try {
    let out = refresh ? null : await getMF();
    if (!out?.latest) out = await refreshMF({ mode: 'click', budgetMs: 8500 }); // while the tab is empty, every visit tries again
    return json(out, refresh || !out?.latest ? { cdn: 0, swr: 0 } : { cdn: 300, swr: 3600 }); // never cache an empty tab
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, { cdn: 0, swr: 0 });
  }
};
export const config = { path: '/api/mf' };
