import { INDICES, MARKETS } from './config.mjs';
import { get, cookiesFrom, num } from './http.mjs';
import SEED, { SEED_ASOF } from './seed-india.mjs';

/* ---------------- NSE live (intraday PE / PB / DY) ---------------- */
// NSE's site answers on www.nseindia.in for some visitors (GitHub's servers among them): www.nseindia.com redirects
// there. Its API needs the cookies its pages set, and a cookie never follows a redirect to another host, so the host
// that actually answers is found first and the API is called on it directly.
let nseSess = null; // { origin, cookie, at }
export async function nseFetch(path) {
  if (!nseSess || Date.now() - nseSess.at > 10 * 60e3) {
    const home = await get('https://www.nseindia.com/', { headers: { Accept: 'text/html' }, timeout: 7000 });
    const origin = new URL(home.url || 'https://www.nseindia.com/').origin;
    if (!/^https:\/\/www\.nseindia\.(com|in)$/.test(origin)) throw new Error('NSE: unexpected host ' + origin);
    nseSess = { origin, cookie: cookiesFrom(home), at: Date.now() };
  }
  const { origin, cookie } = nseSess;
  const res = await get(origin + path, { headers: { Accept: 'application/json', Referer: origin + '/market-data/live-market-indices', ...(cookie ? { Cookie: cookie } : {}) } });
  if (!res.ok) throw new Error(`NSE ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('json')) throw new Error('NSE returned non-JSON');
  return res.json();
}

export async function nseLive() {
  const d = await nseFetch('/api/allIndices');
  const rows = Array.isArray(d?.data) ? d.data : [];
  const out = {};
  for (const ix of INDICES) {
    const r = rows.find((x) => x.index === ix.nse);
    if (!r) continue;
    out[ix.id] = {
      last: num(r.last), change: num(r.variation), changePct: num(r.percentChange),
      pe: num(r.pe), pb: num(r.pb), dy: num(r.dy),
      yearHigh: num(r.yearHigh), yearLow: num(r.yearLow), chg30d: num(r.perChange30d), chg365d: num(r.perChange365d),
      advances: num(r.advances), declines: num(r.declines),
    };
  }
  if (!Object.keys(out).length) throw new Error('NSE: indices not found');
  return { timestamp: d.timestamp || null, indices: out };
}

/* ---------------- Daily valuation history ---------------- */
// Primary: indexpe.in daily NSE series (PE, PB, DY, EPS) embedded in its page payload.
async function indexpeSeries(slug) {
  const res = await get(`https://indexpe.in/${slug}`, { headers: { Accept: 'text/html' }, timeout: 12000 });
  if (!res.ok) throw new Error(`indexpe ${res.status}`);
  const html = await res.text();
  const re = /\{\\"pe\\":[^{}]*?\\"timestamp\\":\\"\d{4}-\d\d-\d\dT[^{}]*?\}/g;
  const by = new Map();
  for (const m of html.match(re) || []) {
    try { const o = JSON.parse(m.replaceAll('\\"', '"')); by.set(o.timestamp.slice(0, 10), o); } catch { /* skip */ }
  }
  if (by.size < 200) throw new Error(`indexpe: only ${by.size} rows`);
  const d = [...by.keys()].sort();
  // Long-window medians and percentiles (1y … 15y and full history since the 1990s).
  const flat = html.replaceAll('\\"', '"');
  const grab = (key) => {
    const i = flat.indexOf(`"${key}":{`); if (i < 0) return null;
    let depth = 0, j = i + key.length + 3;
    for (let k = j; k < flat.length; k++) { if (flat[k] === '{') depth++; else if (flat[k] === '}') { depth--; if (depth === 0) { try { return JSON.parse(flat.slice(j, k + 1)); } catch { return null; } } } }
    return null;
  };
  const medians = grab('medians'), pct = grab('percentiles');
  const long = medians || pct ? {
    medians: medians && { pe: { '1y': medians.pe1y, '3y': medians.pe3y, '5y': medians.pe5y, '7y': medians.pe7y, '10y': medians.pe10y, '15y': medians.pe15y, max: medians.peMax }, pb: { '10y': medians.pb10y }, dy: { '10y': medians.divYield10y } },
    percentiles: pct?.pe ? Object.fromEntries(Object.entries(pct.pe).map(([k, v]) => [k, { p: v.p / 100, n: v.n }])) : null,
  } : null;
  return { d, pe: d.map((k) => num(by.get(k).pe)), pb: d.map((k) => num(by.get(k).pb)), dy: d.map((k) => num(by.get(k).divYield)), eps: d.map((k) => num(by.get(k).eps)), long };
}
// Last good results are kept in Netlify Blobs, so an outage serves yesterday's data rather than the bundled snapshot.
// With STATE_DIR set (the public site, built on GitHub), they are kept as JSON files in that folder instead.
async function blobStore() {
  if (process.env.STATE_DIR) return fileStore();
  try { const { getStore } = await import('@netlify/blobs'); return getStore('pe-monitor'); } catch { return null; }
}
let FILES = null;
async function fileStore() {
  if (FILES) return FILES;
  const { mkdir, readFile, writeFile, rename } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const dir = process.env.STATE_DIR, file = (k) => join(dir, String(k).replace(/[^A-Za-z0-9._-]/g, '_') + '.json');
  return (FILES = {
    async get(k) {
      try { return JSON.parse(await readFile(file(k), 'utf8')); }
      catch (e) { if (e.code !== 'ENOENT') console.warn(`::warning::Stored copy "${k}" could not be read; it is rebuilt from its source.`); return null; }
    },
    async setJSON(k, v) { await mkdir(dir, { recursive: true }); const f = file(k); await writeFile(f + '.tmp', JSON.stringify(v)); await rename(f + '.tmp', f); }, // never half-written
  });
}
export async function saveLastGood(key, value) {
  try { const st = await blobStore(); if (st) await st.setJSON(key, { savedAt: new Date().toISOString(), value }); } catch { /* not on Netlify, or Blobs unavailable */ }
}
export async function loadLastGood(key) {
  try { const st = await blobStore(); return st ? await st.get(key, { type: 'json' }) : null; } catch { return null; }
}

// Full history since inception (Nifty 50 from 1999, Nifty 500 from 1996): weekly in early years, daily recently.
async function indexpeFull(slug) {
  const res = await get(`https://indexpe.in/api/indices/${slug}/history`, { headers: { Accept: 'application/json', Referer: `https://indexpe.in/${slug}` }, timeout: 12000 });
  if (!res.ok) throw new Error(`indexpe history ${res.status}`);
  const h = (await res.json())?.history;
  if (!Array.isArray(h) || h.length < 200) throw new Error('indexpe history: too short');
  const by = new Map(h.filter((o) => o?.timestamp).map((o) => [o.timestamp.slice(0, 10), o]));
  const d = [...by.keys()].sort();
  return { d, pe: d.map((k) => num(by.get(k).pe)), pb: d.map((k) => num(by.get(k).pb)), dy: d.map((k) => num(by.get(k).divYield)), eps: d.map((k) => num(by.get(k).eps)) };
}

/* ---------------- NSE Indices (niftyindices.com): publisher of the daily index P/E, P/B and dividend yield ---------------- */
// The indexpe.in history is checked against NSE Indices' own figures every time it is built. Where both have a day and
// they agree (as they should: indexpe republishes NSE's numbers), NSE Indices' values are the ones kept.
const MON3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad2 = (n) => String(n).padStart(2, '0');
export function niDate(v) {
  const t = String(v ?? '').trim(); let m;
  if ((m = t.match(/(\d{1,2})[\s\-/]([A-Za-z]{3})[A-Za-z]*[\s\-/,]+(\d{4})/))) { const i = MON3.indexOf(m[2].toLowerCase()); return i < 0 ? null : `${m[3]}-${pad2(i + 1)}-${pad2(+m[1])}`; }
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/))) return `${m[3]}-${pad2(+m[2])}-${pad2(+m[1])}`;
  return null;
}
export function niftyIndicesRows(payload) {
  let rows = payload && typeof payload === 'object' && 'd' in payload ? payload.d : payload;
  if (typeof rows === 'string') rows = JSON.parse(rows);
  if (!Array.isArray(rows)) return [];
  const by = new Map();
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const k = Object.keys(r), flat = (x) => x.replace(/[\s%_]/g, '').toLowerCase();
    const dk = k.find((x) => /date/i.test(x)), pe = k.find((x) => ['pe', 'p/e'].includes(flat(x))), pb = k.find((x) => ['pb', 'p/b'].includes(flat(x))), dy = k.find((x) => /^div/.test(flat(x)));
    const d = dk ? niDate(r[dk]) : null; if (!d || !pe) continue;
    by.set(d, { d, pe: num(r[pe]), pb: pb ? num(r[pb]) : null, dy: dy ? num(r[dy]) : null });
  }
  return [...by.values()].sort((a, b) => (a.d < b.d ? -1 : 1));
}
async function niftyIndices(name, from, to) {
  // The service has taken dates as 01-Jan-2026 and as 01012026 at different times; both are tried.
  const asText = (d) => `${d.slice(8, 10)}-${MON3[+d.slice(5, 7) - 1].replace(/^./, (c) => c.toUpperCase())}-${d.slice(0, 4)}`, asDigits = (d) => d.slice(8, 10) + d.slice(5, 7) + d.slice(0, 4);
  let err;
  // The bare niftyindices.com redirects to www., and a redirect turns this POST into a plain page load; so www. first.
  for (const [host, f] of [['https://www.niftyindices.com', asText], ['https://www.niftyindices.com', asDigits], ['https://niftyindices.com', asText]]) {
    try {
      const cinfo = `{'name':'${name}','startDate':'${f(from)}','endDate':'${f(to)}','indexName':'${name}'}`;
      const r = await get(host + '/Backpage.aspx/getpepbHistoricaldataDBtoString', {
        method: 'POST', body: JSON.stringify({ cinfo }), timeout: 15000,
        headers: { 'Content-Type': 'application/json; charset=UTF-8', Accept: 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest', Origin: host, Referer: host + '/reports/historical-data' },
      });
      if (!r.ok) throw new Error(`NSE Indices ${r.status}`);
      if (!/json/i.test(r.headers.get('content-type') || '')) throw new Error(`NSE Indices answered with a web page, not data (${new URL(r.url || host).host})`);
      const rows = niftyIndicesRows(await r.json());
      if (rows.length) return rows;
      throw new Error('NSE Indices: no rows');
    } catch (e) { err = e; }
  }
  throw err;
}
// Compare the last ~13 months day by day; adopt NSE Indices' values only if at least 90% of shared days agree.
export function verifyWithNse(s, rows) {
  const at = new Map(s.d.map((d, i) => [d, i]));
  let n = 0, agree = 0, max = 0;
  for (const r of rows) { const i = at.get(r.d); if (i == null || r.pe == null || s.pe[i] == null) continue; n++; const diff = Math.abs(r.pe - s.pe[i]); if (diff > max) max = diff; if (diff <= 0.06) agree++; }
  const used = n >= 20 && agree / n >= 0.9;
  if (used) for (const r of rows) { const i = at.get(r.d); if (i == null) continue; if (r.pe != null) s.pe[i] = r.pe; if (r.pb != null) s.pb[i] = r.pb; if (r.dy != null) s.dy[i] = r.dy; }
  return { source: 'NSE Indices', days: n, agree, maxDiff: Math.round(max * 1000) / 1000, used, latest: rows.at(-1)?.d || null };
}

export async function indexHistory(ix) {
  try {
    // Page: 5 years daily + long-window stats. API: full history. Merge, preferring the daily page rows.
    const [page, full] = await Promise.allSettled([indexpeSeries(ix.slug), indexpeFull(ix.slug)]);
    if (page.status !== 'fulfilled' && full.status !== 'fulfilled') throw page.reason;
    let s = page.status === 'fulfilled' ? page.value : { ...full.value, long: null };
    if (page.status === 'fulfilled' && full.status === 'fulfilled') {
      const first = s.d[0], f = full.value, keep = f.d.map((d, i) => [d, i]).filter(([d]) => d < first);
      s = { d: [...keep.map(([d]) => d), ...s.d], pe: [...keep.map(([, i]) => f.pe[i]), ...s.pe], pb: [...keep.map(([, i]) => f.pb[i]), ...s.pb], dy: [...keep.map(([, i]) => f.dy[i]), ...s.dy], eps: [...keep.map(([, i]) => f.eps[i]), ...s.eps], long: s.long };
    }
    let verify;
    try { verify = verifyWithNse(s, await niftyIndices(ix.nse, new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10))); }
    catch (e) { verify = { source: 'NSE Indices', error: String(e.message || e).slice(0, 120) }; }
    await saveLastGood('history-' + ix.id, s);
    const base = full.status === 'fulfilled' ? 'NSE via indexpe.in (daily for 5 years, weekly before)' : 'NSE daily via indexpe.in (5 years)';
    return { ...s, source: verify.used ? `${base}; last 13 months checked against NSE Indices` : base, freq: 'daily', inception: s.d[0], verify };
  } catch (e1) {
    const last = await loadLastGood('history-' + ix.id);
    if (last?.value?.d?.length) return { ...last.value, source: `Last saved copy (${last.savedAt.slice(0, 10)})`, freq: 'daily', stale: true, note: String(e1.message) };
    return { ...SEED[ix.slug], source: `Bundled snapshot to ${SEED_ASOF}`, freq: 'daily', stale: true, note: String(e1.message) };
  }
}

/* ---------------- Yahoo Finance ETF trailing PE (global live proxy) ---------------- */
let yCookie = '', yCrumb = '', yAt = 0;
export async function yahooAuth() {
  if (yCrumb && Date.now() - yAt < 30 * 60e3) return;
  const r1 = await get('https://fc.yahoo.com', { timeout: 6000 });
  yCookie = cookiesFrom(r1);
  const r2 = await get('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { Cookie: yCookie } });
  const crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || crumb.length > 40 || crumb.includes('<')) throw new Error('Yahoo crumb failed');
  yCrumb = crumb; yAt = Date.now();
}
export async function etfQuotes() {
  await yahooAuth();
  const syms = MARKETS.map((m) => m.etf).join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}&crumb=${encodeURIComponent(yCrumb)}`;
  let res = await get(url, { headers: { Cookie: yCookie, Accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) { yCrumb = ''; await yahooAuth(); res = await get(url.replace(/crumb=[^&]+/, 'crumb=' + encodeURIComponent(yCrumb)), { headers: { Cookie: yCookie } }); }
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const list = (await res.json())?.quoteResponse?.result || [];
  const out = {};
  for (const q of list) out[q.symbol] = { pe: num(q.trailingPE), price: num(q.regularMarketPrice), changePct: num(q.regularMarketChangePercent), time: q.regularMarketTime ? new Date(q.regularMarketTime * 1000).toISOString() : null, state: q.marketState || null, name: q.shortName || q.longName || q.symbol };
  if (!Object.keys(out).length) throw new Error('Yahoo: no quotes');
  return out;
}

// Raw Yahoo quotes for any symbols (crumb flow), in batches of 40.
export async function yahooQuote(symbols) {
  await yahooAuth();
  const out = {};
  for (let i = 0; i < symbols.length; i += 40) {
    const syms = symbols.slice(i, i + 40).map(encodeURIComponent).join(',');
    const url = () => `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}&crumb=${encodeURIComponent(yCrumb)}`;
    let res = await get(url(), { headers: { Cookie: yCookie, Accept: 'application/json' } });
    if (res.status === 401 || res.status === 403) { yCrumb = ''; await yahooAuth(); res = await get(url(), { headers: { Cookie: yCookie, Accept: 'application/json' } }); }
    if (!res.ok) throw new Error(`Yahoo quote ${res.status}`);
    for (const q of (await res.json())?.quoteResponse?.result || []) out[q.symbol] = q;
  }
  return out;
}

/* ---------------- India 10-year G-sec yield ----------------
   Daily from CNBC's public quote feed (symbol IN10Y). If that fails: the last value it returned (up to 10 days old),
   then the hand-entered value in lib/macro-config.mjs. Older than 7 days = flagged stale. */
export async function india10y() {
  const { MANUAL } = await import('./macro-config.mjs');
  const age = (d) => (Date.now() - Date.parse(d)) / 864e5;
  try {
    const r = await get('https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=IN10Y&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json', { headers: { Accept: 'application/json' }, timeout: 8000 });
    const q = (await r.json())?.FormattedQuoteResult?.FormattedQuote?.[0];
    const v = num(String(q?.last ?? '').replace('%', ''));
    if (v == null || v < 2 || v > 15 || !q.last_time) throw new Error('no quote');
    const out = { value: v, asOf: new Date(q.last_time).toISOString().slice(0, 10), name: 'India 10-year G-sec yield', source: 'CNBC quote feed', auto: true, stale: false };
    await saveLastGood('india10y', out);
    return out;
  } catch (e) {
    const last = await loadLastGood('india10y');
    if (last?.value && age(last.value.asOf) <= 10) return { ...last.value, stale: age(last.value.asOf) > 7, note: 'Last live value (feed unavailable)' };
    return { ...MANUAL.india10y, auto: false, stale: age(MANUAL.india10y.asOf) > 7, note: `Feed unavailable (${e.message}); hand-entered value` };
  }
}
