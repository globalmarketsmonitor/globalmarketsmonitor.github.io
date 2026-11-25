// Reference-data engine: refreshes official sources on a schedule (and on Refresh), keeps the last good copy of each,
// and assembles the calendar, Fed meeting list, IMF forecasts, Siblis P/E and regulator watch from them.
// Precedence for every calendar item: live official source > verified seed (lib/events.mjs) > issuer's published rule.
import { EVENTS as SEED, HORIZON as SEED_HORIZON, FOMC_SEED } from '../events.mjs';
import { saveLastGood, loadLastGood } from '../sources.mjs';
import * as SRC from './sources.mjs';
import { ruleEvents } from './rules.mjs';
import { MON, parts, addDays, today, fmtDM, usTime, ecbTime, boeTime, BOJ_TIME } from './util.mjs';
import { SIBLIS_ASOF } from '../config.mjs';
const fmtMY = (s) => `${MON[parts(s).m]} ${parts(s).y}`, fmtDMY = (s) => `${fmtDM(s)} ${parts(s).y}`;

const H = 3600e3;
const env = (k) => (typeof process !== 'undefined' && process.env?.[k]) || '';
// ttl: [scheduled refresh, refresh on click]
export const REG = {
  fed: { name: 'Federal Reserve: FOMC calendar', how: 'Official site', ttl: [12 * H, H], run: () => SRC.fed() },
  ecb: { name: 'ECB: Governing Council calendar', how: 'Official site', ttl: [12 * H, H], run: () => SRC.ecb() },
  boe: { name: 'Bank of England: MPC dates', how: 'Official site', ttl: [12 * H, H], run: () => SRC.boe() },
  boj: { name: 'Bank of Japan: policy meeting schedule', how: 'Official site', ttl: [12 * H, H], run: () => SRC.boj() },
  rbi: { name: 'RBI: MPC schedule', how: 'Official press release + RBI feed', ttl: [6 * H, H], run: (p) => SRC.rbi(p?.data?.urls) },
  bea: { name: 'BEA: GDP and PCE release dates', how: 'Official calendar feed', ttl: [12 * H, H], run: () => SRC.bea() },
  census: { name: 'Census Bureau: retail sales dates', how: 'Official site', ttl: [12 * H, H], run: () => SRC.census() },
  fred: { name: 'BLS: CPI, jobs and PPI dates (via FRED)', how: 'Official API (St. Louis Fed)', key: 'FRED_API_KEY', ttl: [12 * H, H], run: () => SRC.fredReleases(env('FRED_API_KEY')) },
  nse: { name: 'NSE: trading holidays', how: 'Exchange API', ttl: [12 * H, H], run: () => SRC.nseHolidays() },
  imf: { name: 'IMF: GDP growth forecasts', how: 'Official IMF data API', ttl: [7 * 24 * H, 24 * H], run: () => SRC.imf() },
  siblis: { name: 'Siblis Research: trailing P/E', how: env('SIBLIS_API_KEY') ? 'Siblis API (subscriber: daily)' : 'Siblis free API (quarter-end snapshots)', key: 'SIBLIS_API_KEY', optionalKey: true, ttl: [24 * H, 6 * H], run: () => SRC.siblis(env('SIBLIS_API_KEY')) },
  watch: { name: 'RBI and SEBI: new rules watch', how: 'Official feeds', ttl: [6 * H, H], run: () => SRC.regWatch() },
};

let MEM = null; // same-process cache (also lets local scripts build once and serve everything from memory)
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${Math.round(ms / 1000)} s`)), ms))]);

export async function loadRefdata() {
  if (MEM) return MEM;
  const b = await loadLastGood('refdata');
  return (MEM = b?.value || null);
}

// Re-fetch every source older than its time-to-live (mode 'click' uses the shorter TTL). Failed sources keep their last good data.
export async function buildRefdata({ mode = 'scheduled', budgetMs = 24000, only = null } = {}) {
  const t0 = Date.now(), prev = (await loadRefdata()) || { v: 1, sources: {} };
  const next = { v: 1, sources: { ...prev.sources } };
  const due = Object.entries(REG).filter(([id, r]) => {
    if (only && !only.includes(id)) return false;
    const s = prev.sources[id], age = s?.at ? Date.now() - Date.parse(s.at) : Infinity, ttl = r.ttl[mode === 'click' ? 1 : 0];
    // A source that failed at its last check is tried again within the hour, not after its full interval.
    return age > (s && s.ok === false ? Math.min(ttl, H) : ttl);
  });
  await Promise.all(due.map(async ([id, r]) => {
    const at = new Date().toISOString(), old = prev.sources[id];
    try {
      const data = await withTimeout(r.run(old), Math.max(1500, budgetMs - (Date.now() - t0) - 400));
      next.sources[id] = { ok: true, at, okAt: at, data };
    } catch (e) {
      next.sources[id] = { ok: false, at, okAt: old?.okAt || null, error: String(e.message || e).slice(0, 160), data: old?.data || null };
    }
  }));
  next.builtAt = new Date().toISOString(); next.ms = Date.now() - t0; next.refreshed = due.map(([id]) => id);
  MEM = next;
  await saveLastGood('refdata', next);
  return next;
}

/* ---------------- calendar assembly ---------------- */
const KINDS = [
  [/^FOMC minutes/, 'fomc-min'], [/^FOMC strategy/, 'fomc-strat'], [/^FOMC decision/, 'fomc'], [/^RBI monetary policy/, 'rbi'], [/^ECB monetary policy/, 'ecb'],
  [/^Bank of England/, 'boe'], [/^Bank of Japan/, 'boj'], [/^China loan prime/, 'cn-lpr'], [/^China official PMIs/, 'cn-pmi'], [/^US (PCE|GDP)/, 'us-bea'],
  [/^US CPI/, 'us-cpi'], [/^US jobs report/, 'us-jobs'], [/^US producer prices/, 'us-ppi'], [/^US retail sales/, 'us-retail'], [/^ISM manufacturing/, 'ism-m'],
  [/^ISM services/, 'ism-s'], [/^US quarterly options/, 'quad'], [/^US markets closed/, 'us-hol'], [/^NSE \/ BSE closed/, 'in-hol'], [/^Nifty monthly F&O/, 'fno'],
  [/^India CPI/, 'in-cpi'], [/^India industrial production/, 'in-iip'], [/^India jobs: PLFS/, 'in-plfs'], [/^India WPI/, 'in-wpi'], [/^India GDP/, 'in-gdp'],
  [/^India GST/, 'in-gst'], [/^Union Budget/, 'budget'], [/^MSCI .*announced/, 'msci-ann'], [/^MSCI .*rebalance/, 'msci-reb'], [/^OPEC/, 'opec'],
  [/results season begins/, 'res-in'], [/earnings season begins/, 'res-us'], [/^India fiscal year-end/, 'fy-end'],
];
export const kindOf = (title) => (KINDS.find(([re]) => re.test(title)) || [null, 'other'])[1];
const holName = (t) => (t.match(/\(([^)]+)\)/) || [])[1]?.replace(/’s Day| Day$/, '').trim().toLowerCase() || '';

function seedEvents() {
  const out = [];
  for (const e of SEED) {
    const m = e.title.match(/^US and Indian markets closed \((.+)\)$/);
    if (m) { // split so each half can be confirmed by its own source, then re-joined below
      out.push({ ...e, country: 'US', k: 'us-hol', title: `US markets closed (${m[1]})`, via: 'verified' });
      out.push({ ...e, country: 'IN', k: 'in-hol', title: `NSE / BSE closed (${m[1]})`, via: 'verified' });
    } else out.push({ ...e, k: kindOf(e.title), via: 'verified' });
  }
  return out;
}

function liveEvents(src) {
  const out = [], d = (id) => src[id]?.data, at = (id) => src[id]?.okAt;
  const live = (id, e, s) => ({ cat: 'cb', time: '', detail: '', ind: null, ...e, status: 'official', src: s[0], url: s[1], via: 'live', checked: at(id) });
  if (d('fed')) for (const m of d('fed').meetings) {
    const s = ['Federal Reserve', SRC.FED_URL];
    if (m.strategy) out.push(live('fed', { date: m.date, country: 'US', imp: 1, k: 'fomc-strat', title: 'FOMC strategy meeting (no rate decision)', detail: 'Set aside for monetary policy strategy. No rate vote or policy statement is expected.' }, s));
    else out.push(live('fed', { date: m.date, country: 'US', imp: 3, k: 'fomc', title: m.sep ? 'FOMC decision + projections (dot plot)' : 'FOMC decision', time: usTime(m.date, '14:00'), detail: `Meeting ${parts(m.start).d}–${fmtDM(m.date)}${m.note ? ' (announced in a note on the Fed’s calendar)' : ''}. Tentative until confirmed at the preceding meeting.`, ind: 'pol_US' }, s));
  }
  if (d('ecb')) for (const m of d('ecb').meetings) out.push(live('ecb', { date: m.date, country: 'XM', imp: 2, k: 'ecb', title: 'ECB monetary policy decision', time: ecbTime(m.date), ind: 'pol_XM' }, ['ECB', SRC.ECB_URL]));
  if (d('boe')) for (const m of d('boe').meetings) out.push(live('boe', { date: m.date, country: 'GB', imp: 2, k: 'boe', title: 'Bank of England decision', time: boeTime(m.date), detail: m.mpr ? 'With the Monetary Policy Report.' : '', ind: 'pol_GB' }, ['Bank of England', SRC.BOE_URL]));
  if (d('boj')) for (const m of d('boj').meetings) out.push(live('boj', { date: m.date, country: 'JP', imp: 2, k: 'boj', title: m.outlook ? 'Bank of Japan decision + Outlook Report' : 'Bank of Japan decision', time: BOJ_TIME, detail: `Meeting ${fmtDM(m.start)}–${fmtDM(m.date)}.`, ind: 'pol_JP' }, ['Bank of Japan', SRC.BOJ_URL]));
  if (d('rbi')) for (const m of d('rbi').meetings) out.push(live('rbi', { date: m.date, country: 'IN', imp: 3, k: 'rbi', title: 'RBI monetary policy decision', time: '10:00 IST', detail: `MPC meets ${parts(m.start).d}–${fmtDM(m.date)}.`, ind: 'pol_IN' }, ['RBI', m.url]));
  if (d('bea')) {
    const by = new Map();
    for (const r of d('bea').releases) (by.get(r.date) || by.set(r.date, []).get(r.date)).push(r);
    for (const [date, rs] of by) {
      const g = rs.find((r) => r.type === 'gdp'), p = rs.find((r) => r.type === 'pce');
      const title = g && p ? `US GDP Q${g.q} (${g.est === 'advance' ? 'advance' : g.est + ' estimate'}) + PCE inflation (${MON[p.m]})` : g ? `US GDP Q${g.q} (${g.est === 'advance' ? 'advance' : g.est + ' estimate'})` : `US PCE inflation (${MON[p.m]})`;
      out.push(live('bea', { date, country: 'US', cat: 'data', imp: g?.est === 'advance' || (!g && p) ? 3 : 2, k: 'us-bea', title, time: usTime(date, '08:30'), detail: p ? 'PCE is the Fed’s preferred inflation gauge. Watch core PCE month on month.' : '', ind: 'cpi_US' }, ['BEA release schedule', d('bea').url]));
    }
  }
  if (d('census')) for (const r of d('census').releases) out.push(live('census', { date: r.date, country: 'US', cat: 'data', imp: 2, k: 'us-retail', title: `US retail sales (${MON[r.m]})`, time: usTime(r.date, '08:30') }, ['Census Bureau release schedule', SRC.CENSUS_URL]));
  if (d('fred')) {
    const f = d('fred').releases, ref = (date) => MON[(parts(date).m + 11) % 12];
    for (const date of f.cpi || []) out.push(live('fred', { date, country: 'US', cat: 'data', imp: 3, k: 'us-cpi', title: `US CPI inflation (${ref(date)})`, time: usTime(date, '08:30'), ind: 'cpi_US' }, ['BLS schedule via FRED', d('fred').url]));
    for (const date of f.jobs || []) out.push(live('fred', { date, country: 'US', cat: 'data', imp: 3, k: 'us-jobs', title: `US jobs report — non-farm payrolls (${ref(date)})`, time: usTime(date, '08:30'), detail: 'Payrolls, unemployment rate and wage growth.' }, ['BLS schedule via FRED', d('fred').url]));
    for (const date of f.ppi || []) out.push(live('fred', { date, country: 'US', cat: 'data', imp: 1, k: 'us-ppi', title: `US producer prices, PPI (${ref(date)})`, time: usTime(date, '08:30') }, ['BLS schedule via FRED', d('fred').url]));
  }
  if (d('nse')) for (const h of d('nse').cm) out.push(live('nse', { date: h.date, country: 'IN', cat: 'holiday', imp: 1, k: 'in-hol', title: `NSE / BSE closed (${h.name})` }, ['NSE holiday list', d('nse').url]));
  return out;
}

function nseContext(src) {
  const n = src.nse?.data, inHol = new Set(), foHol = new Set(), years = new Set();
  const fixed = (y) => [`${y}-01-26`, `${y}-08-15`, `${y}-10-02`];
  if (n) {
    for (const h of n.cm) { years.add(parts(h.date).y); if (!/maharashtra|municipal/i.test(h.name)) inHol.add(h.date); }
    for (const h of n.fo?.length ? n.fo : n.cm) foHol.add(h.date);
  } else for (const e of SEED) if (/NSE \/ BSE closed|US and Indian markets closed/.test(e.title)) { inHol.add(e.date); foHol.add(e.date); }
  for (let y = parts(today()).y - 1; y <= parts(today()).y + 2; y++) fixed(y).forEach((x) => inHol.add(x));
  return { inHolidays: inHol, foHolidays: foHol, nseYears: years };
}

export function assembleCalendar(ref, { from = addDays(today(), -7), to = addDays(today(), 400) } = {}) {
  const src = ref?.sources || {};
  const seed = seedEvents(), live = liveEvents(src), rules = ruleEvents(addDays(from, -40), to, nseContext(src));
  // FOMC minutes follow each rate decision by three weeks (estimated).
  const fomcDates = [...live, ...seed].filter((e) => e.k === 'fomc').map((e) => e.date);
  for (const d of [...new Set(fomcDates)]) rules.push({ date: addDays(d, 21), country: 'US', cat: 'cb', imp: 2, k: 'fomc-min', title: `FOMC minutes (${fmtDM(addDays(d, -1))}–${fmtDM(d)} meeting)`, time: usTime(addDays(d, 21), '14:00'), detail: 'Three weeks after the meeting.', status: 'estimated', src: 'Fed practice: three weeks after each decision', url: null, ind: null, via: 'rule' });
  const kinds = new Set([...seed, ...live, ...rules].map((e) => e.k)), out = [];
  for (const k of kinds) {
    const L = live.filter((e) => e.k === k), S = seed.filter((e) => e.k === k), Ru = rules.filter((e) => e.k === k);
    const span = (xs) => (xs.length ? [xs.reduce((a, e) => (e.date < a ? e.date : a), xs[0].date), xs.reduce((a, e) => (e.date > a ? e.date : a), xs[0].date)] : null);
    const lc = span(L), sc = span(S);
    const inLive = (d) => lc && d >= lc[0] && d <= lc[1];
    for (const e of L) {
      const s = S.find((x) => x.date === e.date);
      out.push(s ? { ...s, status: 'official', src: e.src, url: e.url, via: 'live', checked: e.checked, title: k === 'in-hol' || k === 'us-hol' ? s.title : s.title, time: s.time || e.time } : e);
    }
    for (const s of S) {
      if (!inLive(s.date)) { out.push(s); continue; }
      if (L.some((e) => e.date === s.date)) continue;
      // The live source no longer lists this date: say so on the nearest live date in the same month (if any).
      const moved = L.filter((e) => Math.abs(Date.parse(e.date) - Date.parse(s.date)) < 45 * 864e5).sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(s.date)) - Math.abs(Date.parse(b.date) - Date.parse(s.date)))[0];
      if (moved) { const o = out.find((x) => x === moved || (x.k === k && x.date === moved.date)); if (o && !/previously/.test(o.detail)) o.detail = `${o.detail ? o.detail + ' ' : ''}Previously listed for ${fmtDM(s.date)}; the issuer’s calendar now shows ${fmtDM(moved.date)}.`.trim(); }
    }
    const lastKnown = [lc?.[1], sc?.[1]].filter(Boolean).sort().at(-1) || '';
    for (const r of Ru) if (r.date > lastKnown && !out.some((x) => x.k === k && x.date === r.date)) out.push(r);
  }
  // Re-join holidays shared by US and Indian markets.
  const joined = [];
  for (const e of out) {
    if (e.k !== 'us-hol') { joined.push(e); continue; }
    const twin = out.find((x) => x.k === 'in-hol' && x.date === e.date && holName(x.title) && holName(x.title) === holName(e.title));
    if (twin && twin.status === e.status) { twin._merged = true; joined.push({ ...e, country: 'GL', k: 'gl-hol', title: `US and Indian markets closed (${(e.title.match(/\(([^)]+)\)/) || [])[1]})`, detail: [e.detail, twin.status === 'official' ? 'On both the NSE and NYSE holiday lists.' : 'On the NYSE holiday list; NSE’s list for this year is not yet published.'].filter(Boolean).join(' '), status: twin.status === 'official' && e.status !== 'estimated' ? 'official' : e.status, src: twin.via === 'live' ? twin.src : e.src, url: twin.via === 'live' ? twin.url : e.url }); }
    else joined.push(e);
  }
  return joined.filter((e) => !e._merged && e.date >= from && e.date <= to).map(({ _merged, ...e }) => e).sort((a, b) => a.date.localeCompare(b.date) || b.imp - a.imp);
}

/* ---------------- everything consumers need ---------------- */
export function assemble(ref) {
  const src = ref?.sources || {}, t = today();
  const calendar = assembleCalendar(ref);
  // Fed rate-decision days for the futures path (strategy meetings excluded).
  const fedLive = src.fed?.data?.meetings?.filter((m) => !m.strategy).map((m) => m.date) || [];
  const fomc = (fedLive.length ? fedLive : FOMC_SEED).filter((d) => d >= addDays(t, -40)).sort();
  // Horizon: editorial items until they expire, plus what the engine can detect itself.
  const horizon = SEED_HORIZON.filter((h) => !h.until || h.until >= t).map(({ until, ...h }) => h);
  const nseYears = new Set((src.nse?.data?.cm || []).map((h) => parts(h.date).y)), y = parts(t).y;
  if (parts(t).m >= 10 && !nseYears.has(y + 1)) horizon.push({ country: 'IN', title: `NSE / BSE ${y + 1} holiday list`, when: 'Usually published in December', detail: `Confirms ${y + 1} market holidays and any shifts to F&O expiry days; the calendar picks it up automatically.` });
  const rbiLast = (src.rbi?.data?.meetings || []).map((m) => m.date).sort().at(-1);
  if (rbiLast && rbiLast < addDays(t, 150)) horizon.push({ country: 'IN', title: 'RBI MPC meeting dates for the next financial year', when: 'Usually announced in March', detail: 'Added to the calendar automatically when the RBI publishes them.' });
  // IMF growth: [this year, next year, five years out] from the latest WEO.
  let imf = null;
  if (src.imf?.data?.series) {
    const { series, vintage, updated } = src.imf.data, Y = parts(updated || t).y, yrs = [Y, Y + 1, Y + 5];
    const pick = (c) => (series[c] ? yrs.map((yy) => (Number.isFinite(series[c][yy]) ? Math.round(series[c][yy] * 10) / 10 : null)) : null);
    imf = { vintage, updated, years: yrs, checked: src.imf.okAt, countries: Object.fromEntries(Object.entries(SRC.IMF_CODES).map(([k, c]) => [k, pick(c)])) };
  }
  const siblis = src.siblis?.data ? { ...src.siblis.data, checked: src.siblis.okAt } : null;
  const watch = (src.watch?.data?.items || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8);
  // RBI decision days (past and future) from the RBI's published schedule: used to date a rate move BIS has not posted.
  const rbiDecisions = (src.rbi?.data?.meetings || []).map((m) => m.date).filter(Boolean).sort();
  return { calendar, horizon, fomc, imf, siblis, watch, rbiDecisions, status: status(ref, calendar) };
}

function status(ref, calendar) {
  const src = ref?.sources || {}, rows = [];
  const last = (k) => calendar.filter((e) => e.k === k).map((e) => e.date).sort().at(-1);
  const sib = () => { const l = Object.values(src.siblis.data.markets).map((m) => m.asOf).sort().at(-1); return `${Object.keys(src.siblis.data.markets).length} markets, latest reading ${fmtDMY(l)}${l < SIBLIS_ASOF ? `; the verified ${fmtDMY(SIBLIS_ASOF)} figures are newer and stay in use` : ''}`; };
  const cover = { fed: () => `Meetings to ${fmtDMY(src.fed.data.meetings.at(-1).date)}`, ecb: () => `Meetings to ${fmtMY(src.ecb.data.meetings.at(-1).date)}`, boe: () => `Meetings to ${fmtMY(src.boe.data.meetings.at(-1).date)}`, boj: () => `Meetings to ${fmtMY(src.boj.data.meetings.at(-1).date)}`, rbi: () => `Meetings to ${fmtMY(src.rbi.data.meetings.at(-1).date)}`, bea: () => `Releases to ${fmtMY(src.bea.data.releases.map((r) => r.date).sort().at(-1))}`, census: () => `Releases to ${fmtMY(src.census.data.releases.at(-1).date)}`, fred: () => `CPI, jobs and PPI to ${fmtMY(last('us-cpi'))}`, nse: () => `Holidays for ${[...new Set(src.nse.data.cm.map((h) => h.date.slice(0, 4)))].join(', ')}`, imf: () => src.imf.data.vintage, siblis: sib, watch: () => `${src.watch.data.items.length} relevant of ${src.watch.data.scanned} recent items` };
  for (const [id, r] of Object.entries(REG)) {
    const s = src[id];
    let state = 'pending', note = '';
    if (s?.ok) state = 'live';
    else if (s && /needs .*API_KEY/.test(s.error || '')) state = 'needs-key';
    else if (s?.data) state = 'last-good';
    else if (s) state = 'failed';
    try { if (s?.data) note = cover[id](); } catch { note = ''; }
    rows.push({ id, name: r.name, how: r.how, state, checked: s?.okAt || null, tried: s?.at || null, error: s && !s.ok ? s.error : null, note, key: r.key || null });
  }
  rows.push({ id: 'rules', name: 'Issuers’ fixed-date rules', how: 'MoSPI, OEA, ISM, NSE expiry, NYSE holidays, PBoC, NBS', state: 'rule', note: 'Extend the calendar beyond published lists; each event names its rule' });
  rows.push({ id: 'msci', name: 'MSCI review dates', how: 'Official notice (11 Nov 2026)', state: 'static', note: 'Dates published to Nov 2028' });
  rows.push({ id: 'opec', name: 'OPEC+ meetings', how: 'Verified press release', state: 'manual', note: 'OPEC’s site blocks automated access; next meeting from the 1 Nov 2026 release' });
  return { builtAt: ref?.builtAt || null, refreshed: ref?.refreshed || [], rows };
}

// Consumers call this: last good engine data if any, else the verified seed and rules alone.
export async function getReference() {
  const ref = await loadRefdata();
  return assemble(ref);
}
