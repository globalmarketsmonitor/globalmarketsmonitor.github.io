// GET /api/brief — the daily brief as it would be sent now (JSON: text, html, regime, alerts, delivery status).
// GET /api/brief?send=1&key=<BRIEF_SECRET> — send it now to the configured Telegram chat / email (for testing).
import { composeBrief, sendBrief } from '../../lib/brief.mjs';
import { json } from '../../lib/http.mjs';

export default async (req) => {
  const u = new URL(req.url);
  try {
    if (u.searchParams.get('send')) {
      if (!process.env.BRIEF_SECRET || u.searchParams.get('key') !== process.env.BRIEF_SECRET) return json({ ok: false, error: 'Sending needs ?key= matching the BRIEF_SECRET environment variable.' }, { cdn: 0, swr: 0, status: 403 });
      const b = await sendBrief();
      return json({ ok: true, sent: b.sent, subject: b.subject }, { cdn: 0, swr: 0 });
    }
    return json(await composeBrief(), { cdn: 600, swr: 3600 });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, { cdn: 30, swr: 60 });
  }
};
export const config = { path: '/api/brief' };
