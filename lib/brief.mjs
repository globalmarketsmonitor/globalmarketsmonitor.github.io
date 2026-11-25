// Daily brief and alert delivery (Telegram and/or email). Uses the same rules as the dashboard (public/rules.js).
import '../public/rules.js';
import '../public/view.js';
import { saveLastGood, loadLastGood } from './sources.mjs';
import { get } from './http.mjs';

const R = globalThis.PERules, H = R.helpers, PV = globalThis.PEView;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LIGHT = { good: '🟢', neutral: '🟡', bad: '🔴' };

/* ---------------- data ---------------- */
// On Netlify, read the site's own (CDN-cached) endpoints; locally, call the builders directly.
async function load() {
  // The public site's build fetches every endpoint once and hands the results over here.
  const D = globalThis.__GMM_DATA;
  if (D) return { macro: D.macro, history: D.history, global: D.global, live: D.live, markets: D.markets, pos: D.positioning, research: D.research, base: null };
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (base) {
    // When the site is password-protected (SITE_USERS), the brief signs in with the first login.
    const first = (process.env.SITE_USERS || '').split(',').map((x) => x.trim()).find((x) => x.includes(':'));
    const auth = first ? { Authorization: 'Basic ' + Buffer.from(first).toString('base64') } : {};
    const j = (p) => get(`${base}/api/${p}`, { headers: { Accept: 'application/json', ...auth }, timeout: 20000 }).then((r) => r.json()).catch(() => null);
    const [macro, history, global, live, markets, pos, research] = await Promise.all(['macro', 'history', 'global', 'live', 'markets', 'positioning', 'research'].map(j));
    return { macro, history, global, live, markets, pos, research, base };
  }
  const call = async (n) => { try { const m = await import(`../netlify/functions/${n}.mjs`); return await (await m.default(new Request('http://local/api/' + n))).json(); } catch { return null; } };
  const [macro, history, global, live, markets, pos, research] = await Promise.all(['macro', 'history', 'global', 'live', 'markets', 'positioning', 'research'].map(call));
  return { macro, history, global, live, markets, pos, research, base: null };
}

/* ---------------- compose ---------------- */
export async function composeBrief({ viewLogWrite = false } = {}) {
  const d = await load();
  const n500pe = d.live?.ok ? d.live.indices?.n500?.pe : d.history?.series?.n500?.pe?.at(-1);
  const rules = R.create({ macro: d.macro, hist: d.history, global: d.global, markets: d.markets, pos: d.pos, n500pe });
  const I = d.macro?.indicators || {};
  const now = new Date();
  const dateIST = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(now);
  const sections = [];

  // Regime
  const regime = R.PILLARS.map((P) => { const p = rules.pillar(P.k); return { name: P.name, label: p.label, cls: p.cls }; });
  sections.push({ title: 'Regime', lines: [regime.map((r) => `${LIGHT[r.cls]} ${r.name}: <b>${esc(r.label)}</b>`).join('\n')] });

  // Alerts
  const alerts = rules.alerts(), on = alerts.filter((a) => a.on);
  sections.push({ title: `Alerts (${on.length} of ${alerts.length})`, lines: on.length ? on.map((a) => `⚠️ <b>${esc(a.name)}</b> — ${esc(a.now)}`) : ['None triggered.'] });

  // Investment view (same engine as the dashboard tab)
  let views = null;
  if (d.research?.ok && d.macro?.ok) {
    try {
      const inp = { research: d.research, macro: d.macro, markets: d.markets, pos: d.pos, global: d.global, hist: d.history, live: d.live?.ok ? d.live : null, n500pe };
      const Vf = PV.create(inp, 'fii'), Vi = PV.create(inp, 'inr'), sf = Vf.summary(), si = Vi.summary();
      const eqi = Vi.classes.find((r) => r.id === 'eq');
      views = { fii: Vf, inr: Vi };
      sections.push({ title: 'Investment view (rules-based signals)', lines: [
        esc(sf.lines[0]), esc(sf.lines[1]), esc(sf.lines[2]),
        esc(`${sf.deploy.howMuch} ${sf.deploy.howFast}`),
        ...(sf.sens ? [esc(`3–5 year equity call under other inflation assumptions: ${sf.sens}.`)] : []),
        esc(`Indian institutions (INR): equities ${eqi?.tac.view.toLowerCase() ?? '—'} for 3–12 months, ${eqi?.strat.view.toLowerCase() ?? '—'} for 3–5 years. ${si.deploy.howMuch} ${si.deploy.howFast}`),
      ] });
    } catch (e) { console.error('investment view', e); }
  }

  // Markets
  const heat = Object.fromEntries((d.markets?.heat || []).flatMap((g) => g.items.map((x) => [x.sym, x])));
  const mk = (sym, name, dp = 0) => { const x = heat[sym]; return x ? `${name} ${x.last.toLocaleString('en-US', { maximumFractionDigits: dp })} (${H.pctS(x.d1, 1)})` : null; };
  const yl = (id, name) => { const x = I[id]; return x ? `${name} ${H.f2(x.last)}% (${H.bp(x.chg.w)} w/w)` : null; };
  sections.push({ title: 'Markets (last close, 1-day change)', lines: [
    [mk('^GSPC', 'S&P 500'), mk('^NDX', 'Nasdaq 100'), mk('^STOXX50E', 'Euro Stoxx 50'), mk('^N225', 'Nikkei')].filter(Boolean).join(' · '),
    [mk('^NSEI', 'Nifty 50'), mk('^HSI', 'Hang Seng'), mk('EEM', 'MSCI EM', 2)].filter(Boolean).join(' · '),
    [yl('us10y', 'US 10Y'), yl('us10r', 'US real 10Y'), mk('DX-Y.NYB', 'DXY', 1)].filter(Boolean).join(' · '),
    [mk('BZ=F', 'Brent', 1), mk('GC=F', 'Gold'), mk('BTC-USD', 'Bitcoin'), I.vix ? `VIX ${H.f1(I.vix.last)}` : null].filter(Boolean).join(' · '),
  ].filter(Boolean).map(esc) });

  // Fed
  const rp = d.markets?.ratePath;
  if (rp?.meetings?.length) {
    const nx = rp.meetings[0];
    sections.push({ title: 'Fed path (futures)', lines: [esc(`Effective fed funds ${H.f2(rp.effr)}%. Next FOMC ${H.fmtD(nx.date)}: ${H.bp(nx.change)} priced. Over 12 months: ${H.bp(rp.horizon?.cum)} (${((rp.horizon?.cum ?? 0) / 0.25).toFixed(1)} moves of 25bp)${rp.chg1m != null ? `, ${H.bp(rp.chg1m)} vs a month ago` : ''}.`)] });
  }

  // India
  const hs = d.history?.series || {}, lp = (id) => rules.longPct(id);
  const liveI = d.live?.ok ? d.live.indices : {};
  const pe = (id) => liveI[id]?.pe ?? hs[id]?.pe?.at(-1);
  const flows = d.macro?.flows ? Object.entries(d.macro.flows).sort().at(-1) : null;
  sections.push({ title: 'India', lines: [
    ['n50', 'n500', 'small'].filter((id) => hs[id]).map((id) => `${hs[id].name} PE ${H.f1(pe(id))}x (${lp(id) != null ? H.ord(Math.round(lp(id) * 100)) + ' pctl of 10y' : '—'})`).join(' · '),
    [I.usdinr ? `USD/INR ${H.f2(I.usdinr.last)} (${H.pp(I.usdinr.chg.w)} w/w)` : null, I.indiavix ? `India VIX ${H.f1(I.indiavix.last)}` : null, flows ? `FII ${flows[1].fii >= 0 ? '+' : '−'}₹${Math.abs(Math.round(flows[1].fii)).toLocaleString('en-IN')} cr, DII ${flows[1].dii >= 0 ? '+' : '−'}₹${Math.abs(Math.round(flows[1].dii)).toLocaleString('en-IN')} cr (${H.fmtD(flows[0])})` : null].filter(Boolean).join(' · '),
  ].filter(Boolean).map(esc) });

  // Next 7 days
  const today = new Date().toISOString().slice(0, 10), wk = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const ev = (d.macro?.calendar || []).filter((e) => e.date >= today && e.date <= wk && e.imp >= 2).sort((a, b) => (a.date < b.date ? -1 : 1));
  sections.push({ title: 'Next 7 days', lines: ev.length ? ev.map((e) => `${e.imp >= 3 ? '🔺' : '•'} ${esc(H.fmtD(e.date).replace(/ \d{4}$/, ''))} — ${esc(e.title)}${e.time ? ` <i>(${esc(e.time)})</i>` : ''}`) : ['No major scheduled events.'] });

  // Daily log of the view: drives "changed since last week" and the live track record.
  let viewLog = null, viewChanges = null;
  if (views) {
    const log = (await loadLastGood('view-log'))?.value || {};
    const days = Object.keys(log).sort(), today = now.toISOString().slice(0, 10), cut = new Date(now - 7 * 864e5).toISOString().slice(0, 10);
    viewLog = { since: days[0] || null, days: days.length };
    const base = days.filter((x) => x <= cut).at(-1);
    if (base) {
      viewChanges = { basis: base };
      for (const lens of ['fii', 'inr']) if (log[base]?.[lens]) viewChanges[lens] = diffViews(log[base][lens], views[lens]);
    }
    if (views && viewLogWrite) { log[today] = { fii: views.fii.snapshot(), inr: views.inr.snapshot() }; for (const k of Object.keys(log).sort().slice(0, -400)) delete log[k]; await saveLastGood('view-log', log); viewLog = { since: Object.keys(log).sort()[0], days: Object.keys(log).length }; }
  }

  const title = `Global Markets Monitor — ${dateIST}`;
  const link = d.base ? `${d.base}/#overview` : null;
  const telegram = `<b>${esc(title)}</b>\n\n` + sections.map((s) => `<b>${esc(s.title)}</b>\n${s.lines.join('\n')}`).join('\n\n') + (link ? `\n\n<a href="${link}">Open dashboard</a>` : '') + '\n\n<i>For information only; not investment advice.</i>';
  const html = `<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:640px;color:#111827;line-height:1.5">
<h2 style="margin:0 0 12px;font-size:18px">${esc(title)}</h2>
${sections.map((s) => `<h3 style="margin:18px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#6B7280">${esc(s.title)}</h3><p style="margin:0;font-size:14px">${s.lines.join('<br>').replace(/\n/g, '<br>')}</p>`).join('\n')}
${link ? `<p style="margin-top:20px"><a href="${link}" style="color:#2563EB">Open the dashboard</a></p>` : ''}
<p style="margin-top:16px;font-size:12px;color:#6B7280">For information only; not investment advice.</p></div>`;
  return { ok: true, generatedAt: now.toISOString(), viewLog, viewChanges, title, subject: `${title}${on.length ? ` · ${on.length} alert${on.length > 1 ? 's' : ''}` : ''}`, sections, telegram, html, regime, alertsOn: on, alerts, channels: channels() };
}

// Tactical calls whose notch changed between a logged snapshot and the current view.
export function diffViews(old, V) {
  const names = { alts: Object.fromEntries(V.alts.map((x) => [x.id, x.name])), eq: Object.fromEntries(V.equity.map((x) => [x.id, x.name + ' equities'])), classes: Object.fromEntries(V.classes.map((x) => [x.id, x.name])) }, cur = V.snapshot(), out = [];
  for (const k of ['classes', 'eq', 'alts']) for (const [id, v] of Object.entries(cur[k] || {})) {
    const o = old?.[k]?.[id]; if (!o || o[0] == null || v[0] == null) continue;
    const a = PV.helpers.notchOf(o[0]), b = PV.helpers.notchOf(v[0]);
    if (a !== b && !out.some((x) => x.name === names[k][id])) out.push({ name: names[k][id], from: PV.helpers.ARROWS[a + 2], to: PV.helpers.ARROWS[b + 2], up: b > a });
  }
  return out;
}

/* ---------------- delivery (shared with the mutual fund alert: lib/notify.mjs) ---------------- */
export { channels, deliver } from './notify.mjs';
import { channels, deliver } from './notify.mjs'; // channels() is also used by composeBrief

export async function sendBrief() {
  const b = await composeBrief({ viewLogWrite: true });
  const sent = await deliver(b.subject, b.telegram, b.html);
  await saveLastGood('brief-last', { generatedAt: b.generatedAt, sent });
  return { ...b, sent };
}

// Sends only alerts that switched on (or off) since the last check.
export async function watchAlerts() {
  const b = await composeBrief();
  const prev = new Set((await loadLastGood('alerts-state'))?.value?.on || []);
  const nowOn = new Set(b.alertsOn.map((a) => a.id));
  const fresh = b.alertsOn.filter((a) => !prev.has(a.id));
  const cleared = b.alerts.filter((a) => prev.has(a.id) && !nowOn.has(a.id));
  await saveLastGood('alerts-state', { on: [...nowOn] });
  if (!fresh.length && !cleared.length) return { changed: false };
  const lines = [...fresh.map((a) => `⚠️ <b>${esc(a.name)}</b> — ${esc(a.now)}\n<i>${esc(a.rule)}</i>`), ...cleared.map((a) => `✅ Cleared: <b>${esc(a.name)}</b> — ${esc(a.now)}`)];
  const subject = `Alert: ${[...fresh, ...cleared].map((a) => a.name).join(', ')}`;
  const text = `<b>Global Markets Monitor — alert update</b>\n\n${lines.join('\n\n')}`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:640px"><h2 style="font-size:17px">Alert update</h2><p>${lines.join('<br><br>').replace(/\n/g, '<br>')}</p></div>`;
  return { changed: true, fresh: fresh.map((a) => a.id), cleared: cleared.map((a) => a.id), sent: await deliver(subject, text, html) };
}
