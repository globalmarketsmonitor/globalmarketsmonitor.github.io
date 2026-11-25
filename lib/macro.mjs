import { YAHOO, RATIOS, TREASURY, DERIVED, COUNTRIES, DBNOMICS, FRED, MANUAL, CALENDAR, HORIZON } from './macro-config.mjs';
import { get, num } from './http.mjs';
import { saveLastGood, loadLastGood, nseFetch , india10y } from './sources.mjs';
import { getReference } from './refdata/build.mjs';

const DAY = 864e5;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

/* ---------------- statistics ---------------- */
// hist: ascending [[isoDate, value]]. Returns summary stats used by every indicator card.
export function summarize(hist, { chg = 'diff', last: lastOverride, lastDate } = {}) {
  const h = hist.filter(([, v]) => v != null && isFinite(v));
  if (!h.length) return null;
  const last = lastOverride ?? h.at(-1)[1];
  const asOf = lastDate ?? h.at(-1)[0];
  const t0 = Date.parse(asOf);
  const at = (days) => { const cut = iso(t0 - days * DAY); let v = null; for (const [d, x] of h) { if (d <= cut) v = x; else break; } return v; };
  const delta = (prev) => (prev == null ? null : chg === 'pct' ? (prev ? last / prev - 1 : null) : last - prev);
  const ten = h.filter(([d]) => d >= iso(t0 - 3653 * DAY)).map(([, v]) => v);
  const mean = ten.reduce((a, b) => a + b, 0) / ten.length;
  const sd = Math.sqrt(ten.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, ten.length - 1));
  // Volatility of 7-day changes over 10 years, to rank "what changed this week".
  const weekly = []; let j = 0;
  for (let i = 0; i < h.length; i++) {
    const ti = Date.parse(h[i][0]); if (ti < t0 - 3653 * DAY) continue;
    while (j < i && Date.parse(h[j + 1][0]) <= ti - 7 * DAY) j++;
    if (Date.parse(h[j][0]) <= ti - 6 * DAY) weekly.push(chg === 'pct' ? h[i][1] / h[j][1] - 1 : h[i][1] - h[j][1]);
  }
  const wsd = weekly.length > 20 ? Math.sqrt(weekly.reduce((a, b) => a + b * b, 0) / weekly.length) : null;
  // Frequency from the typical gap between recent points: monthly series get no weekly change.
  const gaps = h.slice(-13).map(([d], i, a) => (i ? (Date.parse(d) - Date.parse(a[i - 1][0])) / DAY : null)).filter((g) => g != null).sort((a, b) => a - b);
  const gap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 1;
  const freq = gap > 20 ? 'monthly' : gap > 3 ? 'weekly' : 'daily';
  const w = freq === 'monthly' ? null : delta(at(7));
  // Sparkline: about two years, at most ~120 points.
  const sp = h.filter(([d]) => d >= iso(t0 - 730 * DAY));
  const step = Math.max(1, Math.ceil(sp.length / 120));
  const spark = sp.filter((_, i) => i % step === 0 || i === sp.length - 1).map(([d, v]) => [d, +v.toFixed(4)]);
  if (spark.length && spark.at(-1)[0] !== asOf) spark.push([asOf, +last.toFixed(4)]);
  return {
    last, asOf, chgType: chg,
    chg: { w, m: delta(at(30)), q: delta(at(91)), y: delta(at(365)) },
    pct10: ten.length > 10 ? ten.filter((v) => v < last).length / ten.length : null,
    z10: sd ? (last - mean) / sd : null, mean10: mean, min10: Math.min(...ten), max10: Math.max(...ten),
    zw: freq !== 'monthly' && wsd && w != null ? w / wsd : null, freq,
    n: ten.length, spark,
  };
}

/* ---------------- Yahoo Finance (weekly 10y history + live quote) ---------------- */
async function yahooChart(sym) {
  for (const host of ['query1', 'query2']) {
    try {
      const r = await get(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10y&interval=1wk&includePrePost=false`, { headers: { Accept: 'application/json' }, timeout: 9000 });
      if (!r.ok) continue;
      const res = (await r.json())?.chart?.result?.[0]; if (!res) continue;
      const ts = res.timestamp || [], cl = res.indicators?.quote?.[0]?.close || [];
      const hist = ts.map((t, i) => [iso(t * 1000), num(cl[i])]).filter(([, v]) => v != null);
      // Keep the last point per date (Yahoo repeats the current week).
      const m = new Map(hist); const out = [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1));
      const meta = res.meta || {};
      if (meta.regularMarketPrice != null && meta.regularMarketTime) out.push([iso(meta.regularMarketTime * 1000), meta.regularMarketPrice]);
      return { hist: [...new Map(out)].sort((a, b) => (a[0] < b[0] ? -1 : 1)), price: meta.regularMarketPrice, time: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null };
    } catch { /* try next host */ }
  }
  throw new Error('Yahoo chart ' + sym);
}

/* ---------------- US Treasury par yield curves ---------------- */
async function treasuryYear(curve, year) {
  const type = curve === 'real' ? 'daily_treasury_real_yield_curve' : 'daily_treasury_yield_curve';
  const r = await get(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=${type}&field_tdr_date_value=${year}&page&_format=csv`, { timeout: 12000 });
  if (!r.ok) throw new Error('Treasury ' + r.status);
  const [head, ...rows] = (await r.text()).trim().split(/\r?\n/);
  const cols = head.split(',').map((c) => c.replace(/"/g, '').trim().toUpperCase());
  return rows.map((line) => { const c = line.split(','); const [m, d, y] = c[0].split('/'); const o = { d: `${y}-${m}-${d}` }; cols.slice(1).forEach((k, i) => (o[k] = num(c[i + 1]))); return o; });
}
async function treasuryCurves() {
  const now = new Date().getUTCFullYear(), years = Array.from({ length: 11 }, (_, i) => now - 10 + i);
  const out = {};
  for (const curve of ['nominal', 'real']) {
    const parts = await Promise.allSettled(years.map((y) => treasuryYear(curve, y)));
    const rows = parts.flatMap((p) => (p.status === 'fulfilled' ? p.value : []));
    if (!rows.length) throw new Error('Treasury ' + curve + ' empty');
    out[curve] = rows.sort((a, b) => (a.d < b.d ? -1 : 1));
  }
  return out;
}

/* ---------------- BIS: CPI and policy rates ---------------- */
export async function bisCsv(flow, key, extra) {
  const r = await get(`https://stats.bis.org/api/v2/data/dataflow/BIS/${flow}/1.0/${key}?${extra}&format=csv`, { timeout: 12000 });
  if (!r.ok) throw new Error('BIS ' + r.status);
  const [head, ...rows] = (await r.text()).trim().split(/\r?\n/);
  const cols = head.split(','), ra = cols.indexOf('REF_AREA'), tp = cols.indexOf('TIME_PERIOD'), ov = cols.indexOf('OBS_VALUE');
  // Quoted fields can hold commas; parse properly.
  const split = (line) => { const o = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(cur); cur = ''; } else cur += ch; } o.push(cur); return o; };
  const by = {};
  for (const line of rows) { const c = split(line); const v = num(c[ov]); if (v == null) continue; (by[c[ra]] ||= []).push([c[tp].length === 7 ? c[tp] + '-15' : c[tp], v]); }
  for (const k in by) by[k].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return by;
}

/* ---------------- CSV (SDMX-CSV from the OECD and BIS) ---------------- */
// Quote-aware split; returns { [REF_AREA]: [[date, value], …] } using the named columns, whatever their order.
export function csvByArea(text) {
  const lines = String(text).replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const split = (line) => { const o = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === ',' && !q) { o.push(cur); cur = ''; } else cur += ch; } o.push(cur); return o.map((x) => x.trim()); };
  const head = split(lines.shift() || ''), col = (n) => head.findIndex((h) => h === n || h.startsWith(n + ':'));
  const ra = col('REF_AREA'), tp = col('TIME_PERIOD'), ov = col('OBS_VALUE');
  if (ra < 0 || tp < 0 || ov < 0) throw new Error('CSV without REF_AREA/TIME_PERIOD/OBS_VALUE columns');
  const by = {};
  for (const line of lines) {
    const c = split(line), v = num(c[ov]), t = c[tp];
    if (v == null || !/^\d{4}-\d\d(-\d\d)?$/.test(t)) continue;
    (by[c[ra]] ||= []).push([t.length === 7 ? t + '-15' : t, v]);
  }
  for (const k in by) by[k] = [...new Map(by[k].sort((a, b) => (a[0] < b[0] ? -1 : 1)))];
  return by;
}

/* ---------------- OECD (the publisher's own data service) ---------------- */
// Composite leading indicators straight from sdmx.oecd.org, every area in one request (the OECD allows 60 downloads
// an hour). DBnomics' copy of this dataset stopped updating in June 2026; it is kept only as a fallback.
async function oecdCli(keys) {
  const tail = keys[0].split('.').slice(1).join('.'), areas = keys.map((k) => k.split('.')[0]);
  const url = `https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_CLI/${areas.join('+')}.${tail}?startPeriod=${new Date().getUTCFullYear() - 11}-01&dimensionAtObservation=AllDimensions&format=csvfile`;
  const r = await get(url, { headers: { Accept: 'text/csv, application/vnd.sdmx.data+csv;q=0.9, */*;q=0.5' }, timeout: 20000 });
  if (!r.ok) throw new Error('OECD ' + r.status);
  const by = csvByArea(await r.text());
  for (const a of Object.keys(by)) if (!by[a].every(([, v]) => v > 80 && v < 120)) delete by[a]; // an index around 100
  if (!Object.keys(by).length) throw new Error('OECD: no leading-indicator readings');
  return by;
}

/* ---------------- RBI: policy repo rate (the publisher) ---------------- */
// BIS posts India's policy rate several weeks late; the RBI's home page states the rate in force today.
export function rbiRepoFromHtml(html) {
  const text = String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
  const m = text.match(/Policy Repo Rate\s*[:\-–]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%/i);
  const v = m ? num(m[1]) : null;
  return v != null && v >= 2 && v <= 15 ? v : null;
}
async function rbiRepo() {
  const r = await get('https://www.rbi.org.in/', { headers: { Accept: 'text/html,application/xhtml+xml' }, timeout: 12000 });
  if (!r.ok) throw new Error('RBI ' + r.status);
  const v = rbiRepoFromHtml(await r.text());
  if (v == null) throw new Error('RBI: policy repo rate not found on the home page');
  return { value: v, asOf: iso(Date.now() + 5.5 * 3600e3) }; // the rate in force on today's date in India
}

/* ---------------- DBnomics (fallback copies) ---------------- */
async function dbnomics(path) {
  const r = await get(`https://api.db.nomics.world/v22/series/${path}?observations=1&format=json`, { headers: { Accept: 'application/json' }, timeout: 12000 });
  if (!r.ok) throw new Error('DBnomics ' + r.status);
  const s = (await r.json())?.series?.docs?.[0]; if (!s) throw new Error('DBnomics empty');
  return s.period.map((p, i) => [/^\d{4}-\d\d$/.test(p) ? p + '-15' : p, num(s.value[i])]).filter(([, v]) => v != null);
}

/* ---------------- FRED (optional) ---------------- */
async function fred(series) {
  const start = iso(Date.now() - 3700 * DAY), key = process.env.FRED_API_KEY;
  if (key) {
    const r = await get(`https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${key}&file_type=json&observation_start=${start}`, { timeout: 9000 });
    if (!r.ok) throw new Error('FRED ' + r.status);
    return (await r.json()).observations.map((o) => [o.date, num(o.value)]).filter(([, v]) => v != null);
  }
  const r = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series}&cosd=${start}`, { timeout: 6000 });
  if (!r.ok) throw new Error('FRED csv ' + r.status);
  return (await r.text()).trim().split(/\r?\n/).slice(1).map((l) => { const [d, v] = l.split(','); return [d, num(v)]; }).filter(([, v]) => v != null);
}

/* ---------------- NSE FII / DII cash-market flows ---------------- */
async function flows() {
  const rows = await nseFetch('/api/fiidiiTradeReact');
  const day = {};
  for (const r of rows || []) { const k = /FII|FPI/i.test(r.category) ? 'fii' : /DII/i.test(r.category) ? 'dii' : null; if (k) { day[k] = num(r.netValue); day.date = r.date; } }
  if (!day.date) throw new Error('NSE flows empty');
  const d = new Date(day.date + ' UTC'); const key = isNaN(d) ? day.date : iso(d);
  // Accumulate a daily history in Netlify Blobs (builds up from the day the site goes live).
  const prev = (await loadLastGood('flows'))?.value || {};
  prev[key] = { fii: day.fii, dii: day.dii };
  const keys = Object.keys(prev).sort().slice(-260); const hist = Object.fromEntries(keys.map((k) => [k, prev[k]]));
  await saveLastGood('flows', hist);
  return hist;
}

/* ---------------- assemble ---------------- */
const meta = (o) => ({ name: o.name, pillar: o.pillar, unit: o.unit || '', dp: o.dp ?? 2, note: o.note || '' });

export async function buildMacro() {
  const notes = [], ind = {};
  const settle = async (label, p) => { try { return await p; } catch (e) { notes.push(`${label}: ${e.message}`); return null; } };

  const oecdKeys = DBNOMICS.filter((d) => d.path.startsWith('OECD/')).map((d) => d.path.split('/')[2]);
  const [yh, tsy, cpi, pol, dbn, fr, fl, in10, oecd, walcl, rbi] = await Promise.all([
    Promise.all(YAHOO.map((y) => settle(y.sym, yahooChart(y.sym)))),
    settle('US Treasury', treasuryCurves()),
    settle('BIS CPI', bisCsv('WS_LONG_CPI', `M.${COUNTRIES.map((c) => c.code).join('+')}.771`, `startPeriod=${new Date().getUTCFullYear() - 11}-01`)),
    settle('BIS policy rates', bisCsv('WS_CBPOL', `D.${COUNTRIES.map((c) => c.code).join('+')}`, `startPeriod=${new Date().getUTCFullYear() - 3}-01-01`)),
    Promise.all(DBNOMICS.map((d) => settle(d.id, dbnomics(d.path)))),
    Promise.all(FRED.map((f) => settle('FRED ' + f.series, fred(f.series)))),
    settle('NSE flows', flows()),
    india10y(),
    settle('OECD', oecdCli(oecdKeys)),
    settle('Federal Reserve H.4.1 (FRED)', fred('WALCL')),
    settle('RBI', rbiRepo()),
  ]);

  // Yahoo
  const series = {};
  YAHOO.forEach((y, i) => {
    const r = yh[i]; if (!r) return; series[y.id] = r.hist;
    if (y.peOnly) return;
    const s = summarize(r.hist, { chg: y.chg }); if (s) ind[y.id] = { ...meta(y), src: 'Yahoo Finance', sym: y.sym, ...s };
  });
  for (const q of RATIOS) {
    const A = new Map(series[q.a] || []), B = series[q.b] || [];
    const hist = B.filter(([d]) => A.has(d)).map(([d, v]) => [d, (A.get(d) / v) * q.scale]);
    const s = summarize(hist, { chg: q.chg }); if (s) ind[q.id] = { ...meta(q), src: 'Yahoo Finance (computed)', ...s };
  }
  // Treasury
  let curve = null;
  if (tsy) {
    const pick = (c, tenor) => tsy[c].map((r) => [r.d, r[tenor.toUpperCase()]]).filter(([, v]) => v != null);
    const tser = {};
    for (const t of TREASURY) { tser[t.id] = pick(t.curve, t.tenor); if (!t.hidden) { const s = summarize(tser[t.id], { chg: 'diff' }); if (s) ind[t.id] = { ...meta({ ...t, unit: '%', dp: 2 }), src: 'US Treasury', ...s }; } }
    for (const dv of DERIVED) {
      const maps = dv.of.map((k) => new Map(tser[k]));
      const hist = tser[dv.of[0]].filter(([d]) => maps.every((m) => m.has(d))).map(([d]) => [d, dv.f(...maps.map((m) => m.get(d)))]);
      const s = summarize(hist, { chg: 'diff' }); if (s) ind[dv.id] = { ...meta({ ...dv, unit: dv.pillar === 'inflation' ? '%' : 'pp', dp: 2 }), src: 'US Treasury (computed)', ...s };
    }
    const tenors = ['1 MO', '3 MO', '6 MO', '1 YR', '2 YR', '3 YR', '5 YR', '7 YR', '10 YR', '20 YR', '30 YR'];
    const nom = tsy.nominal, lastRow = nom.at(-1), yAgo = [...nom].reverse().find((r) => r.d <= iso(Date.parse(lastRow.d) - 365 * DAY));
    const mAgo = [...nom].reverse().find((r) => r.d <= iso(Date.parse(lastRow.d) - 30 * DAY));
    const pt = (r) => r && tenors.filter((t) => r[t] != null).map((t) => [t.replace(' MO', 'M').replace(' YR', 'Y'), r[t]]);
    curve = { asOf: lastRow.d, now: pt(lastRow), monthAgo: mAgo && { d: mAgo.d, pts: pt(mAgo) }, yearAgo: yAgo && { d: yAgo.d, pts: pt(yAgo) } };
  }
  // BIS CPI + policy. India's latest policy rate comes from the RBI itself when its site answers.
  const rbiPrev = rbi && pol?.IN?.length && rbi.asOf > pol.IN.at(-1)[0] ? pol.IN.at(-1) : null;
  if (rbiPrev) pol.IN = [...pol.IN, [rbi.asOf, rbi.value]];
  const countries = COUNTRIES.map((c) => {
    const ch = cpi?.[c.code], ph = pol?.[c.code];
    const cs = ch ? summarize(ch, { chg: 'diff' }) : null, ps = ph ? summarize(ph, { chg: 'diff' }) : null;
    let lastChange = null;
    if (ph) for (let i = ph.length - 1; i > 0; i--) if (ph[i][1] !== ph[i - 1][1]) { lastChange = { date: ph[i][0], from: ph[i - 1][1], to: ph[i][1] }; break; }
    if (cs) ind['cpi_' + c.code] = { ...meta({ name: `CPI inflation — ${c.name}`, pillar: 'inflation', unit: '%', dp: 1 }), src: 'BIS', ...cs };
    if (ps) ind['pol_' + c.code] = { ...meta({ name: `Policy rate — ${c.cb}`, pillar: 'liquidity', unit: '%', dp: 2 }), src: c.code === 'IN' && rbi && ph?.at(-1)?.[0] === rbi.asOf ? 'RBI (today), BIS (history)' : 'BIS', ...ps, spark: ps.spark };
    return { ...c, cpi: cs && { last: cs.last, asOf: cs.asOf, chg3m: cs.chg.q, chg1y: cs.chg.y, spark: cs.spark }, policy: ps && { last: ps.last, asOf: ps.asOf, chg1y: ps.chg.y, lastChange }, real: cs && ps ? ps.last - cs.last : null };
  });
  // A new RBI rate that BIS has not posted yet: date the move by the RBI's decision day (from its published schedule).
  if (rbiPrev && rbi.value !== rbiPrev[1]) {
    const ref = await getReference().catch(() => null);
    const day = (ref?.rbiDecisions || []).filter((x) => x > rbiPrev[0] && x <= rbi.asOf).at(-1) || null;
    const c = countries.find((x) => x.code === 'IN');
    if (c?.policy) c.policy.lastChange = { date: day, after: day ? undefined : rbiPrev[0], from: rbiPrev[1], to: rbi.value };
    notes.push(`RBI: repo rate ${rbi.value}% on the RBI's site; BIS's latest reading was ${rbiPrev[1]}% (${rbiPrev[0]})`);
  }
  // Which areas the OECD's own service returned, and how recent each is (shown in notes; India's indicator has lagged).
  if (oecd) notes.push(`OECD direct: ${oecdKeys.map((k) => { const a = k.split('.')[0], o = oecd[a]; return `${a} ${o?.length ? o.at(-1)[0].slice(0, 7) : 'not returned'}`; }).join(', ')}`);
  // OECD and Federal Reserve series: the publisher's own data when it answers; DBnomics' copy only when it is newer.
  const newer = (a, b) => (a?.length && (!b?.length || a.at(-1)[0] >= b.at(-1)[0]));
  DBNOMICS.forEach((d, i) => {
    let h = dbn[i], src = d.path.startsWith('OECD') ? 'OECD via DBnomics' : 'Federal Reserve H.4.1 via DBnomics';
    if (d.path.startsWith('OECD/')) {
      const o = oecd?.[d.path.split('/')[2].split('.')[0]];
      if (newer(o, h)) { h = o; src = 'OECD'; }
    } else if (d.id === 'fedassets' && walcl?.length) {
      // FRED (St. Louis Fed) republishes the H.4.1 total the evening it is released. Used only if it matches DBnomics'
      // copy of the Fed's own series on a shared date, so a different series can never slip in.
      const m = new Map(h || []), same = walcl.filter(([t]) => m.has(t)).at(-1);
      const agrees = same ? Math.abs(same[1] / m.get(same[0]) - 1) < 0.005 : !h?.length && walcl.at(-1)[1] > 3e6 && walcl.at(-1)[1] < 15e6;
      if (agrees && newer(walcl, h)) { h = walcl; src = 'Federal Reserve H.4.1 (FRED, St. Louis Fed)'; }
      else if (!agrees) notes.push(`Fed balance sheet: FRED ${same ? `${same[1]} differs from ${m.get(same[0])} on ${same[0]}` : 'shares no date with the Fed copy to compare'}; DBnomics' copy kept`);
    }
    if (!h) return;
    const hist = d.scale ? h.map(([t, v]) => [t, v * d.scale]) : h;
    const s = summarize(hist, { chg: d.chg }); if (s) ind[d.id] = { ...meta(d), src, ...s };
  });
  // FRED (optional)
  FRED.forEach((f, i) => { const h = fr[i]; if (!h) return; const s = summarize(h, { chg: f.chg }); if (s) ind[f.id] = { ...meta(f), src: 'FRED', ...s }; });
  const fredOn = FRED.some((f) => ind[f.id]);
  if (fredOn) notes.splice(0, notes.length, ...notes.filter((n) => !n.startsWith('FRED')));

  const out = {
    ok: true, fetchedAt: new Date().toISOString(), indicators: ind, curve, countries,
    flows: fl, manual: { ...MANUAL, india10y: in10 }, calendar: CALENDAR, horizon: HORIZON, fredEnabled: fredOn, notes,
  };
  return out;
}

export async function macroWithFallback() {
  const [m, ref] = await Promise.all([buildMacro(), getReference().catch(() => null)]);
  // The calendar always comes from the reference-data engine (official sources, verified seed, issuers' rules).
  const withRef = (x) => ({ ...x, calendar: ref?.calendar || CALENDAR, horizon: ref?.horizon || HORIZON, refdata: ref?.status || null });
  const have = Object.keys(m.indicators).length;
  if (have >= 25) { await saveLastGood('macro', m); return withRef(m); }
  // Too many sources failed at once: serve the last complete build, flagged.
  const last = await loadLastGood('macro');
  if (last?.value) return withRef({ ...last.value, stale: true, savedAt: last.savedAt, notes: [...m.notes, `Serving copy saved ${last.savedAt}`] });
  return withRef(m);
}
