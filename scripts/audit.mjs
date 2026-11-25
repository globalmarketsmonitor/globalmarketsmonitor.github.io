// Checks every data file the public site publishes, after each build, and writes the result to public/data/status.json.
// Three kinds of check, per feed:
//   fresh     the figures are as recent as their source publishes them (live NSE data in market hours: under 30 minutes;
//             daily prices: the last trading days; weekly, monthly and quarterly series: within their release lag);
//   sane      every figure is a number in a plausible range (a misread page shows up as an impossible value);
//   agree     where two independent sources publish the same thing, they match (Nifty 50 from NSE and from Yahoo).
// A feed whose source failed keeps its last good copy on the page; it is marked "Needs attention" with the reason.
import { INDICES, MARKETS } from '../lib/config.mjs';

const DAY = 864e5, MIN = 60e3, H = 60 * MIN;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
// Dates as the sources write them: ISO times, YYYY-MM-DD, YYYY-MM, or NSE's "25-Nov-2026 15:30:00" (Indian time).
function when(s) {
  if (s == null || s === '') return null;
  const t = String(s), nse = t.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (nse) return Date.UTC(+nse[3], MON.findIndex((m) => m.toLowerCase() === nse[2].toLowerCase()), +nse[1], +(nse[4] || 0), +(nse[5] || 0)) - 5.5 * H;
  if (/^\d{4}-\d{2}$/.test(t)) return Date.parse(t + '-01T00:00:00Z');
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return Date.parse(t + 'T00:00:00Z');
  const x = Date.parse(t); return Number.isFinite(x) ? x : null;
}
const age = (s) => { const t = when(s); return t == null ? null : (Date.now() - t) / DAY; };
const ageTxt = (d) => (d == null ? 'no date' : d < 1 / 24 ? `${Math.max(0, Math.round(d * 1440))} min old` : d < 2 ? `${Math.round(d * 24)} h old` : `${Math.round(d)} days old`);
// The way a person reads a date: "25 Nov 2026", "Oct 2026", or "25 Nov 2026 15:30 IST" when the source gives a time.
export function human(s) {
  if (s == null || s === '') return null;
  const t = String(s);
  if (/^\d{4}-\d{2}$/.test(t)) return `${MON[+t.slice(5, 7) - 1]} ${t.slice(0, 4)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${+t.slice(8, 10)} ${MON[+t.slice(5, 7) - 1]} ${t.slice(0, 4)}`;
  const x = when(t); if (x == null) return t;
  const d = new Date(x + 5.5 * H);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} IST`;
}
// Markets that close for a week or more (Golden Week, Lunar New Year, Eid) get 10 days; crypto trades every day.
const LONG_HOLIDAYS = new Set(['000001.SS', '^TWII', '^JKSE', '^KS11', '^HSI', '^N225']);
const heatLimit = (sym) => (/-USD$/.test(sym) ? 2 : LONG_HOLIDAYS.has(sym) ? 10 : 5);

export function audit(D, { meta = {} } = {}) {
  const ist = new Date(Date.now() + 5.5 * H), today = ist.toISOString().slice(0, 10), wd = ist.getUTCDay(), mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const nseHoliday = (D.macro?.calendar || []).some((e) => e.date === today && (e.k === 'in-hol' || e.k === 'gl-hol'));
  // NSE's feed starts moving a few minutes after the 09:15 open; give it until 09:25 before expecting fresh numbers.
  const nseOpen = wd >= 1 && wd <= 5 && !nseHoliday && mins >= 9 * 60 + 25 && mins <= 15 * 60 + 30;
  const feeds = [];
  function feed(id, name, source, file, fn) {
    const f = { id, name, source, file, state: 'ok', asOf: null, checks: [] };
    const err = meta.files?.[file]?.error, body = D[file];
    const add = (ok, detail, info) => f.checks.push(info ? { ok: true, info: true, detail } : { ok: !!ok, detail }); // info: shown, not counted
    if (!body || body.ok === false) { f.state = 'failed'; add(false, `No data: ${err || body?.error || 'not built yet'}`); }
    else {
      try { fn(body, add, f); } catch (e) { add(false, `Check could not run: ${String(e.message || e).slice(0, 120)}`); }
      if (err) add(false, `The latest attempt failed (${err.slice(0, 140)}); the last good copy is shown`);
      if (f.checks.some((c) => !c.ok && !c.info)) f.state = 'stale';
    }
    f.asOfText = human(f.asOf);
    feeds.push(f);
  }
  const within = (add, label, date, maxDays) => {
    const a = age(date);
    add(a != null && a <= maxDays, a == null ? `${label}: no date` : `${label}: ${human(date)} (${ageTxt(a)})${a > maxDays ? `; expected within ${maxDays} days` : ''}`);
  };
  const nseFresh = (add, label, stamp) => {
    const a = age(stamp);
    if (nseOpen) add(a != null && a <= 30 / 1440, `${label}: NSE is open; ${a == null ? 'the data has no time stamp' : `NSE time stamp ${human(stamp)} (${ageTxt(a)})`}${a != null && a > 30 / 1440 ? '; expected within 30 minutes' : ''}`);
    else add(a != null && a <= 4.5, `${label}: NSE is closed; last session ${stamp ? human(stamp) : 'unknown'}${a != null && a > 4.5 ? '; expected the most recent trading day' : ''}`);
  };
  const range = (add, label, v, lo, hi) => add(fin(v) && v >= lo && v <= hi, `${label} ${fin(v) ? +v.toFixed(4) : 'missing'}${fin(v) && (v < lo || v > hi) ? `, outside the plausible range ${lo}–${hi}` : ''}`);
  const fallback = (b, key) => (b.notes || []).find((n) => typeof n === 'string' && n.startsWith(`${key}: showing copy saved`));

  // India tab, Overview: index valuations, live from NSE.
  feed('live', 'Indian index valuations, live', 'NSE India', 'live', (b, add, f) => {
    f.asOf = b.timestamp;
    add(!b.stale, b.stale ? `NSE did not answer this update (${String(b.error || 'error').slice(0, 100)}); its last saved copy is shown` : 'Read from NSE in this update');
    nseFresh(add, 'Index data', b.timestamp);
    for (const ix of INDICES) {
      const x = b.indices?.[ix.id];
      if (!x) { add(false, `${ix.name}: missing`); continue; }
      const ok = fin(x.last) && x.last > 0 && fin(x.pe) && x.pe >= 5 && x.pe <= 100 && fin(x.pb) && x.pb >= 0.3 && x.pb <= 20 && fin(x.dy) && x.dy >= 0 && x.dy <= 10 && (!fin(x.changePct) || Math.abs(x.changePct) < 20);
      add(ok, `${ix.name}: level ${x.last}, PE ${x.pe}, P/B ${x.pb}, dividend yield ${x.dy}%${ok ? '' : ' — a value is outside its plausible range (PE 5–100, P/B 0.3–20, yield 0–10%)'}`);
    }
  });

  feed('history', 'Indian index valuation history', 'NSE data via indexpe.in', 'history', (b, add, f) => {
    const dates = [];
    for (const ix of INDICES) {
      const s = b.series?.[ix.id];
      if (!s?.d?.length) { add(false, `${ix.name}: no history`); continue; }
      const last = s.d.at(-1); dates.push(last);
      if (s.stale) add(false, `${ix.name}: ${s.source}${s.note ? ` (${String(s.note).slice(0, 80)})` : ''}`);
      const v = s.verify;
      if (v?.used) add(true, `${ix.name}: P/E, P/B and yield match NSE Indices (the publisher) on ${v.agree} of ${v.days} shared days; NSE Indices' figures are used (largest P/E difference ${v.maxDiff})`);
      else if (v && !v.error && v.days >= 20) add(false, `${ix.name}: indexpe.in and NSE Indices disagree on ${v.days - v.agree} of ${v.days} shared days (largest P/E difference ${v.maxDiff})`);
      else if (v) add(true, `${ix.name}: not checked against NSE Indices this time (${v.error || `only ${v.days} shared days`})`, true);
      within(add, `${ix.name}, latest daily valuation`, last, 5);
      range(add, `${ix.name}, latest PE`, s.pe?.filter(fin).at(-1), 5, 100);
    }
    f.asOf = dates.sort()[0] || null;
  });

  // Valuations tab.
  feed('global', 'Global valuations: ETF PE and month-end PE', 'Yahoo Finance; Siblis Research', 'global', (b, add, f) => {
    const ms = b.markets || [], live = ms.filter((m) => fin(m.livePE));
    add(!b.liveError, b.liveError ? `Yahoo did not answer this update (${String(b.liveError).slice(0, 80)}); ${b.quotesAsOf ? `quotes saved ${human(b.quotesAsOf)} are shown` : 'no earlier quotes are saved'}` : 'ETF quotes read from Yahoo in this update');
    add(live.length >= Math.ceil(MARKETS.length * 0.8), `${live.length} of ${MARKETS.length} markets have a live ETF PE`);
    const bad = live.filter((m) => m.livePE < 3 || m.livePE > 80);
    add(!bad.length, bad.length ? `Implausible ETF PE: ${bad.map((m) => `${m.market} ${m.livePE}`).join(', ')}` : 'Every ETF PE within 3–80');
    const times = ms.map((m) => m.quoteTime).filter(Boolean).sort();
    f.asOf = times.at(-1) || null;
    within(add, 'Newest ETF quote', times.at(-1), 4);
    // Month-end figures follow each month; the newest should be last month's once the month is two weeks old.
    within(add, 'Siblis month-end PE', b.siblisAsOf, 46);
  });

  // World markets tab.
  feed('heat', 'World markets: indices, sectors, commodities, currencies', 'Yahoo Finance', 'markets', (b, add, f) => {
    const fb = fallback(b, 'heat');
    add(!fb, fb ? `Yahoo did not answer this update; ${fb.replace(/^heat: /, '')}` : 'Read from Yahoo in this update');
    const items = (b.heat || []).flatMap((g) => (g.items || []).filter(Boolean));
    add(items.length >= 50, `${items.length} instruments`);
    const dates = items.map((x) => x.asOf).filter(Boolean).sort(); f.asOf = dates.at(-1) || null;
    const old = items.filter((x) => (age(x.asOf) ?? 99) > heatLimit(x.sym));
    add(!old.length, old.length ? `Not updated recently: ${old.slice(0, 6).map((x) => `${x.name} (${human(x.asOf)})`).join(', ')}${old.length > 6 ? ` and ${old.length - 6} more` : ''}` : 'Every instrument has its latest trading day (5 days at most; 10 for markets with week-long holidays; 2 for crypto)');
    const wild = items.filter((x) => fin(x.d1) && Math.abs(x.d1) > 0.3);
    add(!wild.length, wild.length ? `Implausible one-day moves: ${wild.map((x) => `${x.name} ${(x.d1 * 100).toFixed(1)}%`).join(', ')}` : 'Every one-day move within ±30%');
  });
  feed('nseSectors', 'Nifty sectors and factor indices', 'NSE India', 'markets', (b, add, f) => {
    const n = b.nse; if (!n) { add(false, 'Not available'); return; }
    const fb = fallback(b, 'nse');
    add(!fb, fb ? `NSE did not answer this update; ${fb.replace(/^nse: /, '')}` : 'Read from NSE in this update');
    f.asOf = n.timestamp; nseFresh(add, 'Sector and factor indices', n.timestamp);
    add((n.sectors?.length || 0) + (n.factors?.length || 0) >= 20, `${n.sectors?.length || 0} sector and ${n.factors?.length || 0} factor indices`);
    const bad = [...(n.sectors || []), ...(n.factors || [])].filter((x) => fin(x.pe) && (x.pe < 3 || x.pe > 150));
    add(!bad.length, bad.length ? `Implausible PE: ${bad.map((x) => `${x.name} ${x.pe}`).join(', ')}` : 'Every index PE within 3–150');
  });
  feed('fedPath', 'Fed path priced by futures', 'CME fed funds futures via Yahoo; New York Fed', 'markets', (b, add, f) => {
    const r = b.ratePath; if (!r) { add(false, 'Not available'); return; }
    const fb = fallback(b, 'ratePath');
    add(!fb, fb ? `The futures prices could not be read this update; ${fb.replace(/^ratePath: /, '')}` : 'Futures prices read in this update');
    f.asOf = r.asOf; within(add, 'Futures prices', r.asOf, 5); within(add, `Effective fed funds rate (${r.effrSrc || 'New York Fed'})`, r.effrAsOf, 5);
    const ms = r.meetings || [], ahead = ms.filter((m) => m.date >= today);
    add(ahead.length >= 4, `${ahead.length} upcoming FOMC meetings priced`);
    add(ms.every((m) => fin(m.rate) && m.rate >= 0 && m.rate <= 15), 'Every implied rate within 0–15%');
  });

  // Growth & inflation, Liquidity & risk, Overview: macro indicators, grouped by source. Each series is held to its own
  // publication cycle: daily prices within days, weekly data within about two weeks, monthly data within its release lag.
  const I = D.macro?.indicators || {};
  const groups = [
    ['px', 'Market prices and ratios (macro tabs)', 'Yahoo Finance', (s) => /^Yahoo/.test(s)],
    ['ust', 'US Treasury yields, real yields and breakevens', 'US Treasury', (s) => /^US Treasury/.test(s)],
    ['bis', 'Inflation and policy rates by country', "Bank for International Settlements; RBI for India's current rate", (s) => s === 'BIS' || /^RBI/.test(s)],
    ['oecd', 'OECD leading indicators', 'OECD (its own data service; DBnomics copy as fallback)', (s) => /^OECD/.test(s)],
    ['fed', 'Fed balance sheet (H.4.1)', 'Federal Reserve (FRED, St. Louis Fed; DBnomics copy as fallback)', (s) => /^Federal Reserve/.test(s)],
    ['fred', 'Credit spreads, financial conditions, GDPNow', 'FRED (St. Louis Fed)', (s) => s === 'FRED'],
  ];
  const maxAge = (id, x) => {
    if (id === 'gdpnow') return 125; // dated to the quarter it estimates
    if (/^cpi_/.test(id)) return 100; // monthly, published 2–6 weeks after the month
    if (/^pol_/.test(id)) return 21; // daily, posted by BIS with a lag
    if (/^OECD/.test(x.src)) return 130; // monthly, published about two months after
    return x.freq === 'monthly' ? 75 : x.freq === 'weekly' ? 16 : 6;
  };
  for (const [gid, name, source, test] of groups) {
    const ids = Object.keys(I).filter((k) => test(I[k].src || ''));
    if (gid === 'fred' && !ids.length && !process.env.FRED_API_KEY) {
      // Optional, switched on by a free key. Listed anyway, so the table names every source the site can use.
      feeds.push({ id: 'macro-fred', name, source, file: 'macro', state: 'off', asOf: null, asOfText: null, checks: [{ ok: true, info: true, detail: 'Switched off: needs the free FRED_API_KEY secret (see README). Until then the Liquidity & risk tab says so, and credit appetite is read from the HYG/IEF ratio.' }] });
      continue;
    }
    feed('macro-' + gid, name, source, 'macro', (b, add, f) => {
      if (!ids.length) { add(false, 'No indicators from this source in this update'); return; }
      if (b.stale) add(false, `Too many sources failed at once; the copy saved ${human(b.savedAt) || 'earlier'} is shown`);
      const late = [], odd = [];
      for (const k of ids) {
        const x = I[k], a = age(x.asOf), lim = maxAge(k, x);
        if (a == null || a > lim) late.push(`${x.name} ${human(x.asOf) || 'no date'} (limit ${lim} days)`);
        if (!fin(x.last) || (x.unit === '%' && Math.abs(x.last) > 100)) odd.push(`${x.name} ${x.last}`);
      }
      f.asOf = ids.map((k) => I[k].asOf).filter(Boolean).sort().at(-1) || null;
      const used = [...new Set(ids.map((k) => I[k].src))];
      if (gid === 'oecd' || gid === 'fed' || gid === 'bis') add(true, `Read from: ${used.join('; ')}`, true);
      add(!late.length, late.length ? `Out of date: ${late.slice(0, 5).join('; ')}${late.length > 5 ? `; and ${late.length - 5} more` : ''}` : `${ids.length} indicators, each within its release cycle`);
      add(!odd.length, odd.length ? `Implausible values: ${odd.slice(0, 5).join('; ')}` : 'Every value a number in a plausible range');
    });
  }
  feed('curve', 'US Treasury yield curve', 'US Treasury', 'macro', (b, add, f) => {
    const c = b.curve; if (!c) { add(false, 'Not available'); return; }
    f.asOf = c.asOf; within(add, 'Curve', c.asOf, 6);
    const pts = c.now || [];
    add(pts.length >= 8 && pts.every(([, v]) => fin(v) && v > -2 && v < 25), `${pts.length} maturities, all within −2–25%`);
  });
  feed('flows', 'FII and DII cash-market flows', 'NSE India', 'macro', (b, add, f) => {
    const fl = b.flows; if (!fl || typeof fl !== 'object') { add(false, 'Not available'); return; }
    const d = Object.keys(fl).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort().at(-1); // day-by-day record kept since the site started
    f.asOf = d || null; within(add, 'Latest trading day', d, 5);
    const x = d && fl[d];
    add(x && fin(x.fii) && fin(x.dii) && Math.abs(x.fii) < 1e5 && Math.abs(x.dii) < 1e5, `${human(d) || 'no day'}: FII ${x?.fii ?? 'missing'}, DII ${x?.dii ?? 'missing'} (₹ crore)`);
  });
  feed('in10y', 'India 10-year government bond yield', 'CNBC quote feed', 'macro', (b, add, f) => {
    const y = b.manual?.india10y; if (!y) { add(false, 'Not available'); return; }
    f.asOf = y.asOf;
    add(y.auto, y.auto ? 'Read from the quote feed in this update' : `Hand-entered value shown (${y.note || 'feed unavailable'})`);
    within(add, 'Yield', y.asOf, 5); range(add, 'Yield %', y.value, 2, 15);
  });

  // Liquidity & risk: positioning (rebuilt every 3 hours).
  feed('yields10', 'Global 10-year yields', 'US Treasury, Bundesbank, Bank of England, Japan MoF, CNBC', 'positioning', (b, add, f) => {
    const rows = b.yields || [];
    add(rows.length >= 5, `${rows.length} of 5 countries`);
    within(add, 'Last complete update (every 3 hours)', b.savedAt || b.fetchedAt, 0.3);
    for (const r of rows) { within(add, `${r.name}`, r.asOf, r.code === 'JP' ? 7 : 5); range(add, `${r.name} yield %`, r.last, -2, 25); }
    f.asOf = rows.map((r) => r.asOf).filter(Boolean).sort()[0] || null;
  });
  feed('cftc', 'CFTC futures positioning', 'CFTC Commitments of Traders', 'positioning', (b, add, f) => {
    const c = b.cftc || []; add(c.length >= 6, `${c.length} markets`);
    const d = c.map((x) => x.asOf).filter(Boolean).sort(); f.asOf = d.at(-1) || null;
    within(add, 'Latest weekly report (positions on Tuesday, published Friday)', d.at(-1), 14);
  });
  feed('corr', 'Cross-asset correlations and volatility', 'Yahoo Finance', 'positioning', (b, add, f) => {
    const c = b.corr; if (!c) { add(false, 'Not available'); return; }
    f.asOf = c.stockBond?.asOf || null; within(add, 'Stock–bond correlation', c.stockBond?.asOf, 10);
    add(fin(c.stockBond?.last) && Math.abs(c.stockBond.last) <= 1, `Stock–bond correlation ${fin(c.stockBond?.last) ? c.stockBond.last.toFixed(2) : 'missing'} (must be within −1 and 1)`);
  });

  // Beyond Equities and Investment view (rebuilt every 3 hours).
  feed('research', 'Beyond Equities and Investment view data', 'Yahoo Finance, CFTC, BIS, IMF', 'research', (b, add, f) => {
    f.asOf = b.asOfWeek;
    const n = Object.keys(b.assets || {}).length; add(n >= 40, `${n} assets with 10 years of weekly data`);
    add(!b.stale, b.stale ? `Last rebuilt ${human(b.savedAt)}; expected every 3 hours` : `Rebuilt ${human(b.savedAt || b.builtAt)}`);
    within(add, 'Latest week', b.asOfWeek, 10);
  });

  // Calendar tab, and the reference data other tabs use (central bank meetings, holidays, IMF forecasts, Siblis).
  feed('refdata', 'Calendar and reference sources', 'Central banks, statistics offices, exchanges, IMF, regulators', 'refdata', (b, add, f) => {
    const rows = b.status?.rows || []; f.asOf = b.builtAt;
    const bad = rows.filter((r) => r.state === 'failed' || r.state === 'last-good');
    add(!bad.length, bad.length ? `Not reachable at the last check: ${bad.map((r) => `${r.name}${r.checked ? ` (last read ${human(r.checked)})` : ''}`).join('; ')}` : `${rows.filter((r) => r.state === 'live').length} sources read directly from the issuer`);
    within(add, 'Reference data checked', b.builtAt, 1);
  });

  // Mutual funds tab: the engine's own sources and checks.
  feed('mf', 'Mutual funds and institutional flows', 'AMFI, SEBI, NSDL, NSE and BSE', 'mf', (b, add, f) => {
    f.asOf = b.latest;
    within(add, 'Latest AMFI monthly report (published around the 10th of the next month)', b.latest, 77);
    for (const s of b.status || []) {
      const gates = (s.checks || []).filter((c) => !c.info), failed = gates.filter((c) => !c.ok);
      const up = s.state === 'live' || s.state === 'pending';
      add(up && !failed.length, `${s.name}: ${s.state === 'live' ? 'read at the last check' : s.state === 'pending' ? 'not checked yet' : s.state === 'last-good' ? 'not reachable at the last check; last good data shown' : 'not reachable'}${s.latest ? `, latest ${s.latest}` : ''}${gates.length ? `, ${gates.length - failed.length} of ${gates.length} checks passed` : ''}${s.error && !up ? ` (${String(s.error).slice(0, 80)})` : ''}`);
    }
  });

  feed('brief', 'Daily brief', 'Built from the feeds above', 'brief', (b, add, f) => { f.asOf = b.generatedAt; within(add, 'Brief', b.generatedAt, 0.1); });

  // Cross-check: Nifty 50 from NSE's feed and from Yahoo, when both are from the same trading day.
  const n = D.live?.indices?.n50, y = I.nifty, liveDay = D.live?.timestamp ? new Date(when(D.live.timestamp) + 5.5 * H).toISOString().slice(0, 10) : null;
  if (n && y && liveDay && y.asOf === liveDay && fin(n.last) && fin(y.last)) {
    const gap = Math.abs(n.last / y.last - 1), lf = feeds.find((x) => x.id === 'live');
    lf.checks.push({ ok: gap < 0.02, detail: `Cross-check: Nifty 50 ${n.last} from NSE and ${y.last.toFixed(2)} from Yahoo, ${(gap * 100).toFixed(2)}% apart${gap >= 0.02 ? ' — expected within 2%' : ''}` });
    if (gap >= 0.02) lf.state = 'stale';
  }

  const checks = feeds.flatMap((f) => f.checks).filter((c) => !c.info);
  const on = feeds.filter((f) => f.state !== 'off');
  return { at: new Date().toISOString(), nseOpen, totals: { feeds: on.length, ok: on.filter((f) => f.state === 'ok').length, checks: checks.length, passed: checks.filter((c) => c.ok).length }, feeds };
}
