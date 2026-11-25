// Research data for the Beyond Equities and Investment View tabs.
// Built by the scheduled job (research-refresh) and stored in Netlify Blobs; /api/research serves the stored copy.
// Everything here is measured from market data: returns, trend, volatility, real-price valuation, carry from futures curves,
// correlations, behaviour in past stress weeks, CFTC flows, policy rates, CPI and real exchange rates, and a 10-year backtest.
import { get, num } from './http.mjs';
import { saveLastGood, loadLastGood, yahooQuote } from './sources.mjs';
import { bisCsv } from './macro.mjs';
import { ALTS, CORE, EQUITY } from './research-config.mjs';

const DAY = 864e5;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const wk = (ms) => { const d = new Date(ms + 12 * 3600e3); const dow = (d.getUTCDay() + 6) % 7; return iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)); };
const r4 = (v) => (v == null || !isFinite(v) ? null : +(+v).toPrecision(4));
const r3 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 1e4) / 1e4);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const sd = (a) => { if (a.length < 3) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y); if (!s.length) return null; const p = (s.length - 1) * q, lo = Math.floor(p); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (p - lo); };
const pool = async (items, n, fn) => { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- Yahoo weekly history (10 years, dividend-adjusted) ---------------- */
async function chart(sym) {
  for (let a = 0; a < 4; a++) {
    try {
      const host = a % 2 ? 'query2' : 'query1';
      const r = await get(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10y&interval=1wk&events=div`, { headers: { Accept: 'application/json' }, timeout: 9000 });
      if (r.status === 429 || r.status >= 500) { await sleep(400 * (a + 1)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const res = (await r.json())?.chart?.result?.[0];
      if (!res?.timestamp) throw new Error('no data');
      const cl = res.indicators?.quote?.[0]?.close || [], adj = res.indicators?.adjclose?.[0]?.adjclose || cl;
      const m = new Map();
      res.timestamp.forEach((t, i) => { const c = num(cl[i]), j = num(adj[i]); if (c != null && c > 0) m.set(wk(t * 1000), [c, j ?? c]); });
      const meta = res.meta || {};
      if (meta.regularMarketPrice != null && meta.regularMarketTime) {
        const k = wk(meta.regularMarketTime * 1000), prev = m.get(k);
        // Keep the adjusted/close ratio of the bar when replacing its close with the latest trade.
        m.set(k, [meta.regularMarketPrice, prev ? meta.regularMarketPrice * (prev[1] / prev[0]) : meta.regularMarketPrice]);
      }
      const divs = Object.values(res.events?.dividends || {}).map((d) => [iso(d.date * 1000), d.amount]).sort();
      return { sym, cur: meta.currency || null, time: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null, pts: [...m].map(([k, [c, j]]) => [k, c, j]).sort((x, y) => (x[0] < y[0] ? -1 : 1)), divs };
    } catch (e) { if (a === 3) return { sym, error: e.message }; await sleep(300); }
  }
  return { sym, error: 'rate limited' };
}

/* ---------------- futures curves: carry (roll yield) ---------------- */
const MCODE = 'FGHJKMNQUVXZ';
async function curves() {
  const now = new Date(), cands = [];
  for (const a of ALTS.filter((x) => x.fut)) {
    const [root, ex, months] = a.fut;
    for (let k = 0; k <= 17; k++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 1)), m = MCODE[d.getUTCMonth()];
      if (months.includes(m)) cands.push({ id: a.id, sym: `${root}${m}${String(d.getUTCFullYear()).slice(2)}.${ex}`, ym: d.getUTCFullYear() * 12 + d.getUTCMonth(), label: d.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }) });
    }
  }
  const px = {};
  const chunks = []; for (let i = 0; i < cands.length; i += 20) chunks.push(cands.slice(i, i + 20));
  await pool(chunks, 3, async (c) => {
    for (const host of ['query1', 'query2']) {
      try {
        const r = await get(`https://${host}.finance.yahoo.com/v7/finance/spark?symbols=${c.map((x) => encodeURIComponent(x.sym)).join(',')}&range=5d&interval=1d`, { headers: { Accept: 'application/json' }, timeout: 9000 });
        if (!r.ok) continue;
        for (const s of (await r.json())?.spark?.result || []) { const m = s.response?.[0]?.meta; if (m?.regularMarketPrice && m.regularMarketTime && Date.now() - m.regularMarketTime * 1000 < 10 * DAY) px[s.symbol] = m.regularMarketPrice; }
        return;
      } catch { /* other host */ }
    }
  });
  const out = {};
  for (const a of ALTS.filter((x) => x.fut)) {
    const live = cands.filter((c) => c.id === a.id && px[c.sym] != null);
    if (live.length < 2) continue;
    const front = live[0];
    const far = live.filter((c) => c.ym - front.ym >= 9).sort((x, y) => Math.abs(x.ym - front.ym - 12) - Math.abs(y.ym - front.ym - 12))[0];
    if (!far) continue;
    const months = far.ym - front.ym, pf = px[front.sym], pl = px[far.sym];
    out[a.id] = { front: front.label, far: far.label, frontPx: pf, farPx: pl, months, roll: r3((Math.log(pf / pl) * 12) / months), curve: live.slice(0, 8).map((c) => [c.label, px[c.sym]]) };
  }
  return out;
}

/* ---------------- CFTC: speculative positioning and 4-week flows ---------------- */
async function cotFlows(prices) {
  const list = ALTS.filter((a) => a.cot);
  const res = await pool(list, 5, async (a) => {
    const [code, rep, mult] = a.cot;
    const ds = rep === 'tff' ? 'gpe5-46if' : '72hh-3qpy';
    const L = rep === 'tff' ? 'lev_money_positions_long' : 'm_money_positions_long_all', S = rep === 'tff' ? 'lev_money_positions_short' : 'm_money_positions_short_all';
    try {
      const since = iso(Date.now() - 3 * 365 * DAY);
      const r = await get(`https://publicreporting.cftc.gov/resource/${ds}.json?$select=report_date_as_yyyy_mm_dd,open_interest_all,${L},${S}&$where=${encodeURIComponent(`cftc_contract_market_code='${code}' AND report_date_as_yyyy_mm_dd > '${since}T00:00:00'`)}&$order=report_date_as_yyyy_mm_dd&$limit=200`, { headers: { Accept: 'application/json' }, timeout: 9000 });
      if (!r.ok) throw new Error('CFTC ' + r.status);
      const rows = (await r.json()).map((x) => ({ d: x.report_date_as_yyyy_mm_dd.slice(0, 10), oi: num(x.open_interest_all), net: num(x[L]) - num(x[S]) })).filter((x) => x.oi && isFinite(x.net));
      if (rows.length < 20) throw new Error('short history');
      const last = rows.at(-1), pcts = rows.map((x) => x.net / x.oi), cur = last.net / last.oi;
      const p = prices[a.id] ?? null, unit = p != null ? (a.cents ? p / 100 : p) * mult : null;
      const back = rows.length > 4 ? rows.at(-5) : null;
      return [a.id, {
        asOf: last.d, who: rep === 'tff' ? 'Leveraged funds' : 'Managed money', netPct: r3(cur), pct3y: r3(pcts.filter((v) => v < cur).length / pcts.length),
        netContracts: last.net, oi: last.oi, oiUSD: unit ? Math.round(last.oi * unit) : null, netUSD: unit ? Math.round(last.net * unit) : null,
        chg4wPct: back ? r3(cur - back.net / back.oi) : null, chg4wUSD: back && unit ? Math.round((last.net - back.net) * unit) : null,
        chg1wUSD: rows.length > 1 && unit ? Math.round((last.net - rows.at(-2).net) * unit) : null,
        series: rows.slice(-52).map((x) => [x.d, r3(x.net / x.oi)]),
      }];
    } catch (e) { return [a.id, { error: e.message }]; }
  });
  return Object.fromEntries(res);
}

/* ---------------- BIS: policy rates, CPI, real effective exchange rates ---------------- */
const BIS_CODES = ['US', 'XM', 'GB', 'JP', 'CN', 'IN', 'BR', 'KR', 'MX', 'ZA', 'ID', 'CA', 'AU', 'CH'];
async function bis() {
  const y = new Date().getUTCFullYear();
  const [pol, cpi, cpiIdx, eer] = await Promise.allSettled([
    bisCsv('WS_CBPOL', `D.${BIS_CODES.join('+')}`, `startPeriod=${y - 2}-01-01`),
    bisCsv('WS_LONG_CPI', `M.${BIS_CODES.join('+')}.771`, `startPeriod=${y - 2}-01`),
    bisCsv('WS_LONG_CPI', 'M.US.628', `startPeriod=${y - 11}-01`),
    bisCsv('WS_EER', `M.R.B.${[...BIS_CODES, 'TW'].join('+')}`, `startPeriod=${y - 11}-01`),
  ]);
  const at = (pts, days) => { const cut = iso(Date.parse(pts.at(-1)[0]) - days * DAY); let v = null; for (const [d, x] of pts) { if (d <= cut) v = x; else break; } return v; };
  const policy = {}, infl = {}, reer = {};
  if (pol.status === 'fulfilled') for (const [k, pts] of Object.entries(pol.value)) {
    const last = pts.at(-1); let change = null;
    for (let i = pts.length - 1; i > 0; i--) if (pts[i][1] !== pts[i - 1][1]) { change = { date: pts[i][0], from: pts[i - 1][1], to: pts[i][1] }; break; }
    const p6 = at(pts, 182), p12 = at(pts, 365);
    policy[k] = { last: last[1], asOf: last[0], chg6m: p6 == null ? null : r3(last[1] - p6), chg1y: p12 == null ? null : r3(last[1] - p12), change };
  }
  if (cpi.status === 'fulfilled') for (const [k, pts] of Object.entries(cpi.value)) { const p = pts.at(-1), q = pts.length > 3 ? pts.at(-4) : null; infl[k] = { last: r3(p[1]), asOf: p[0].slice(0, 7), chg3m: q ? r3(p[1] - q[1]) : null }; }
  if (eer.status === 'fulfilled') for (const [k, pts] of Object.entries(eer.value)) {
    const v = pts.map((x) => x[1]), last = v.at(-1), m = mean(v), s = sd(v);
    reer[k] = { last: r3(last), asOf: pts.at(-1)[0].slice(0, 7), avg10: r3(m), z10: s ? r3((last - m) / s) : null, pct10: r3(v.filter((x) => x < last).length / v.length), chg1y: v.length > 12 ? r3(last / v.at(-13) - 1) : null };
  }
  const usCpi = cpiIdx.status === 'fulfilled' ? cpiIdx.value.US || [] : [];
  const notes = [pol, cpi, cpiIdx, eer].filter((p) => p.status === 'rejected').map((p) => 'BIS: ' + p.reason?.message);
  return { policy, cpi: infl, reer, usCpi, notes };
}

/* ---------------- statistics on an aligned weekly series ---------------- */
function stats(v, W) {
  const n = v.length; const last = v[n - 1]; if (last == null) return null;
  const at = (k) => (n - 1 - k >= 0 ? v[n - 1 - k] : null);
  const ch = (k) => (at(k) ? last / at(k) - 1 : null);
  const ann = (k) => (at(k) ? (last / at(k)) ** (52 / k) - 1 : null);
  const y = W[n - 1].slice(0, 4); let base = null;
  for (let i = n - 1; i >= 0; i--) if (W[i] <= `${+y - 1}-12-28` && v[i] != null) { base = v[i]; break; }
  const first = v.findIndex((x) => x != null), span = n - 1 - first;
  const lr = []; for (let i = Math.max(1, n - 52); i < n; i++) if (v[i] && v[i - 1]) lr.push(Math.log(v[i] / v[i - 1]));
  const lr3 = []; for (let i = Math.max(1, n - 156); i < n; i++) if (v[i] && v[i - 1]) lr3.push(Math.log(v[i] / v[i - 1]));
  const w40 = v.slice(-40).filter((x) => x != null), ma40 = w40.length >= 30 ? mean(w40) : null;
  // Weeks since the price last crossed its 40-week average.
  let cross = null;
  if (n > 60) {
    const side = (i) => { const w = v.slice(i - 39, i + 1).filter((x) => x != null); return w.length >= 30 && v[i] != null ? Math.sign(v[i] - mean(w)) : 0; };
    const now = side(n - 1);
    for (let k = 1; k <= 26; k++) if (side(n - 1 - k) !== now) { cross = { weeks: k, dir: now }; break; }
    if (!cross) cross = { weeks: 27, dir: now };
  }
  const max52 = Math.max(...v.slice(-52).filter((x) => x != null)), maxAll = Math.max(...v.filter((x) => x != null));
  return {
    last: r4(last), r1w: r3(ch(1)), r1m: r3(ch(4)), r3m: r3(ch(13)), r6m: r3(ch(26)), ytd: base ? r3(last / base - 1) : null, r1y: r3(ch(52)),
    r3y: r3(ann(156)), r5y: r3(ann(260)), r10y: span >= 490 ? r3((last / v[first]) ** (52 / span) - 1) : null,
    mom: at(4) && at(52) ? r3(at(4) / at(52) - 1) : null, trend: ma40 ? r3(last / ma40 - 1) : null, ma40: r4(ma40), cross,
    vol1y: lr.length > 30 ? r3(sd(lr) * Math.sqrt(52)) : null, vol3y: lr3.length > 100 ? r3(sd(lr3) * Math.sqrt(52)) : null,
    dd52: r3(last / max52 - 1), ddMax: r3(last / maxAll - 1),
  };
}
const rets = (v) => v.map((x, i) => (i && x && v[i - 1] ? x / v[i - 1] - 1 : null));
// Least-squares trend through the log series; z of the latest residual and its percentile.
function detrend(ys) {
  const pts = []; ys.forEach((y, i) => { if (y != null) pts.push([i, y]); });
  if (pts.length < 150) return null;
  const n = pts.length, mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1]));
  let sxy = 0, sxx = 0; for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  const b = sxy / sxx, a = my - b * mx, res = pts.map(([x, y]) => y - a - b * x), sdr = sd(res);
  const last = res.at(-1), prev = res.at(-2);
  return { z: last / sdr, zPrev: prev / sdr, res: last, pct: res.filter((v) => v < last).length / n, slope: b };
}
function corr(a, b, n = 156) {
  const xs = [], ys = [];
  for (let i = Math.max(0, a.length - n); i < a.length; i++) if (a[i] != null && b[i] != null) { xs.push(a[i]); ys.push(b[i]); }
  if (xs.length < 60) return null;
  const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return { c: r3(sxy / Math.sqrt(sxx * syy)), beta: r3(sxy / syy) };
}

/* ---------------- build ---------------- */
export async function buildResearch() {
  const t0 = Date.now(), notes = [];
  const fxSyms = [...new Set(EQUITY.filter((e) => e.fx).map((e) => e.fx[0]))];
  const series = [
    ...ALTS.map((a) => ({ id: a.id, sym: a.sym, kind: 'alt', inr: !!a.inr, cents: !!a.cents })),
    ...CORE.map((c) => ({ id: c.id, sym: c.sym, kind: 'core' })),
    ...EQUITY.map((e) => ({ id: 'eq_' + e.code, sym: e.etf, kind: 'eq' })),
    ...fxSyms.map((s) => ({ id: 'fx_' + s, sym: s, kind: 'fx' })),
  ];
  const [charts, curve, bisData, quotes] = await Promise.all([
    pool(series, 6, (s) => chart(s.sym)),
    curves().catch((e) => { notes.push('Futures curves: ' + e.message); return {}; }),
    bis().catch((e) => { notes.push('BIS: ' + e.message); return { policy: {}, cpi: {}, reer: {}, usCpi: [], notes: [] }; }),
    yahooQuote([...new Set([...ALTS.flatMap((a) => [a.sym, a.etf]), ...CORE.map((c) => c.sym), ...EQUITY.map((e) => e.etf)])]).catch((e) => { notes.push('Yahoo quotes: ' + e.message); return {}; }),
  ]);
  notes.push(...(bisData.notes || []));
  charts.forEach((c, i) => { if (c.error) notes.push(`${series[i].sym}: ${c.error}`); });

  // Align every series on one weekly calendar.
  const keys = new Set(); for (const c of charts) for (const [d] of c.pts || []) keys.add(d);
  const W = [...keys].sort().filter((d) => d <= iso(Date.now()));
  const align = (pts, k) => { const m = new Map(pts.map((p) => [p[0], p[k]])); let cur = null, started = false; return W.map((d) => { if (m.has(d)) { cur = m.get(d); started = true; } return started ? cur : null; }); };
  const S = {};
  series.forEach((s, i) => { const c = charts[i]; if (!c.pts?.length) return; S[s.id] = { ...s, cur: c.cur, time: c.time, close: align(c.pts, 1), adj: align(c.pts, 2), divs: c.divs }; });
  const inr = S['fx_INR=X']?.close; if (!inr) throw new Error('USD/INR history unavailable');
  const toUSD = (s, v) => v.map((x, i) => (x == null ? null : (s.cents ? x / 100 : x) / (s.inr ? inr[i] : 1)));
  const toINR = (s, v) => v.map((x, i) => (x == null || inr[i] == null ? null : (s.cents ? x / 100 : x) * (s.inr ? 1 : inr[i])));

  // US CPI index for real (inflation-adjusted) prices.
  const cpiM = new Map((bisData.usCpi || []).map(([d, v]) => [d.slice(0, 7), v])), cpiLast = bisData.usCpi?.at(-1)?.[1];
  let cpiRun = null; const deflator = W.map((d) => { const m = cpiM.get(d.slice(0, 7)); if (m != null) cpiRun = m; return cpiRun && cpiLast ? cpiLast / cpiRun : null; });

  // Factor returns for correlations and stress behaviour.
  const R = (id) => (S[id] ? rets(toUSD(S[id], S[id].adj)) : null);
  const fac = { acwi: R('acwi'), ust: R('ust'), tip: R('tips'), dxy: S.dxy ? rets(S.dxy.close) : null, inr: rets(inr), oil: R('brent') };
  const thr = (a, q) => quantile(a.filter((x) => x != null), q);
  const tEq = thr(fac.acwi, 0.1), tRates = thr(fac.ust, 0.1), tUsd = thr(fac.dxy, 0.9), tInr = thr(fac.inr, 0.9), tOil = thr(fac.oil, 0.9);
  const infl = fac.tip.map((x, i) => (x == null || fac.ust[i] == null ? null : x - fac.ust[i])), tInfl = thr(infl, 0.9);
  const masks = {
    eqDown: fac.acwi.map((x) => x != null && x <= tEq), ratesUp: fac.ust.map((x) => x != null && x <= tRates), inflUp: infl.map((x) => x != null && x >= tInfl),
    usdUp: fac.dxy.map((x) => x != null && x >= tUsd), inrDown: fac.inr.map((x) => x != null && x >= tInr), oilUp: fac.oil.map((x) => x != null && x >= tOil),
  };
  const condOf = (r) => Object.fromEntries(Object.entries(masks).map(([k, m]) => { const xs = r.filter((x, i) => m[i] && x != null); return [k, xs.length >= 15 ? { avg: r3(mean(xs)), hit: r3(xs.filter((x) => x > 0).length / xs.length), n: xs.length } : null]; }));

  const qt = (sym) => quotes[sym] || {};
  const assets = {};
  for (const s of Object.values(S)) {
    const usdP = toUSD(s, s.close), usdA = toUSD(s, s.adj), inrA = toINR(s, s.adj);
    const st = { usd: stats(usdA, W), inr: stats(inrA, W), price: stats(usdP, W) };
    const prev = { usd: stats(usdA.slice(0, -1), W.slice(0, -1)), inr: stats(inrA.slice(0, -1), W.slice(0, -1)) };
    // Real price valuation (USD price deflated by US CPI): z-score and percentile against its own 10-year history.
    let real = null;
    if (s.kind !== 'fx' && deflator.some((x) => x != null)) {
      const rp = usdP.map((x, i) => (x == null || deflator[i] == null ? null : Math.log(x * deflator[i]))).filter((x) => x != null);
      if (rp.length > 150) {
        const m = mean(rp), sdv = sd(rp), lastv = rp.at(-1), prevv = rp.at(-2);
        real = { z: r3((lastv - m) / sdv), pct: r3(rp.filter((x) => x < lastv).length / rp.length), vsAvg: r3(Math.exp(lastv - m) - 1), zPrev: r3((prevv - m) / sdv), years: r3(rp.length / 52) };
      }
    }
    // Detrended value for assets that pay income or grow (equities, REITs, infrastructure, listed PE):
    // log real total return measured against its own 10-year trend line.
    if (real && s.kind !== 'fx') {
      const ys = usdA.map((x, i) => (x == null || deflator[i] == null ? null : Math.log(x * deflator[i])));
      const det = detrend(ys);
      if (det) Object.assign(real, { zDet: r3(det.z), pctDet: r3(det.pct), vsTrend: r3(Math.exp(det.res) - 1), zDetPrev: r3(det.zPrev), trendGrowth: r3(Math.exp(det.slope * 52) - 1) });
    }
    const r = rets(usdA);
    const a = { id: s.id, sym: s.sym, kind: s.kind, cur: s.cur, time: s.time, ...st, prev, real };
    if (s.kind !== 'fx') {
      a.corr = { acwi: s.id === 'acwi' ? { c: 1, beta: 1 } : corr(r, fac.acwi), ust: corr(r, fac.ust) };
      a.cond = condOf(r);
      a.condInr = { inrDown: condOf(rets(inrA)).inrDown };
      // Trailing 12-month distributions as a yield on today's price.
      const cut = iso(Date.now() - 365 * DAY), d12 = (s.divs || []).filter(([d]) => d >= cut).reduce((t, [, x]) => t + x, 0);
      const lastClose = s.close.at(-1);
      a.dist = d12 && lastClose ? r3(d12 / lastClose) : null;
      a.spark = usdA.slice(-104).map(r4);
    }
    assets[s.id] = a;
  }
  // Quote details: size, trading volume, open interest.
  for (const al of ALTS) {
    const e = qt(al.etf), f = qt(al.sym), A = assets[al.id]; if (!A) continue;
    const px = num(e.regularMarketPrice), fx = s0(inr);
    const usdPx = al.inr ? px / fx : px;
    A.etf = { sym: al.etf, aum: num(e.netAssets) ?? (num(e.marketCap) && al.inr ? num(e.marketCap) / fx : null), advUSD: num(e.averageDailyVolume3Month) && usdPx ? Math.round(num(e.averageDailyVolume3Month) * usdPx) : null, yield: num(e.dividendYield) != null ? num(e.dividendYield) / 100 : num(e.trailingAnnualDividendYield), expense: num(e.netExpenseRatio) != null ? num(e.netExpenseRatio) / 100 : null };
    if (al.fut) {
      const mult = al.cot?.[2] || { BZ: 1000 }[al.fut[0]] || null, fp = num(f.regularMarketPrice), unit = fp && mult ? (al.cents ? fp / 100 : fp) * mult : null;
      A.fut = { sym: al.sym, oi: num(f.openInterest), adv: num(f.averageDailyVolume3Month), oiUSD: unit && num(f.openInterest) ? Math.round(num(f.openInterest) * unit) : null, advUSD: unit && num(f.averageDailyVolume3Month) ? Math.round(num(f.averageDailyVolume3Month) * unit) : null };
    }
    if (al.id === 'btc' || al.id === 'eth') A.mcap = num(f.marketCap);
    if (curve[al.id]) A.carry = curve[al.id];
  }
  for (const e of EQUITY) { const A = assets['eq_' + e.code], q = qt(e.etf); if (A) A.etf = { sym: e.etf, aum: num(q.netAssets), yield: num(q.dividendYield) != null ? num(q.dividendYield) / 100 : null, pe: num(q.trailingPE) }; }
  for (const c of CORE) { const A = assets[c.id], q = qt(c.sym); if (A) A.etf = { sym: c.sym, yield: num(q.dividendYield) != null ? num(q.dividendYield) / 100 : null, aum: num(q.netAssets) }; }

  // CFTC flows need the latest futures prices.
  const lastPx = Object.fromEntries(ALTS.map((a) => [a.id, S[a.id]?.close?.at(-1)]));
  const cot = await cotFlows(lastPx).catch((e) => { notes.push('CFTC: ' + e.message); return {}; });

  // Backtest (2017 onwards, weekly): how well the price-based parts of the tactical signal predicted the next 3, 6 and 12 months.
  // value = real price vs its own history so far (no look-ahead); trend = 12-1 month momentum and price vs 40-week average.
  const cash = S.cash ? S.cash.adj : null;
  const NOVAL = new Set(['btc', 'eth', 'mf', 'tips', 'hy', 'emd', 'pcredit']);
  const PLAIN = new Set(ALTS.filter((a) => ['gold', 'cmdty', 'bcom'].includes(a.model)).map((a) => a.id));
  const panel = (id) => {
    const s = S[id]; if (!s || !cash) return null;
    const v = toUSD(s, s.adj), p = toUSD(s, s.close), out = [];
    // Rolling sums keep this linear in the number of weeks.
    const lr = v.map((x, i) => (i && x && v[i - 1] ? Math.log(x / v[i - 1]) : null));
    let n = 0, sum = 0, sum2 = 0, ws = 0, wn = 0, ls = 0, ls2 = 0, ln = 0;
    let dn = 0, St = 0, Stt = 0, Sy = 0, Sty = 0, Syy = 0; // running sums for the expanding trend line
    const plain = PLAIN.has(id);
    for (let t = 0; t < W.length; t++) {
      const lp = p[t] != null && deflator[t] != null ? Math.log(p[t] * deflator[t]) : null;
      if (lp != null) { n++; sum += lp; sum2 += lp * lp; }
      const lt = v[t] != null && deflator[t] != null ? Math.log(v[t] * deflator[t]) : null;
      if (lt != null) { dn++; St += t; Stt += t * t; Sy += lt; Sty += t * lt; Syy += lt * lt; }
      if (v[t] != null) { ws += v[t]; wn++; } if (t >= 40 && v[t - 40] != null) { ws -= v[t - 40]; wn--; }
      if (lr[t] != null) { ls += lr[t]; ls2 += lr[t] ** 2; ln++; } if (t >= 52 && lr[t - 52] != null) { ls -= lr[t - 52]; ls2 -= lr[t - 52] ** 2; ln--; }
      if (t < 52 || v[t] == null || v[t - 52] == null || v[t - 4] == null || wn < 30 || ln < 30) { out.push(null); continue; }
      const vol = Math.sqrt(Math.max(1e-12, (ls2 - (ls * ls) / ln) / (ln - 1)) * 52);
      const tm = 0.5 * Math.tanh((v[t - 4] / v[t - 52] - 1) / 0.15) + 0.5 * Math.tanh((v[t] / (ws / wn) - 1) / 0.05);
      let val = null;
      if (!NOVAL.has(id) && plain && n >= 156 && lp != null) { const m = sum / n, sdv = Math.sqrt(Math.max(1e-12, sum2 / n - m * m)); val = -Math.tanh((lp - m) / sdv / 1.5); }
      if (!NOVAL.has(id) && !plain && dn >= 156 && lt != null) {
        const den = dn * Stt - St * St, b = (dn * Sty - St * Sy) / den, a0 = (Sy - b * St) / dn;
        const ssr = Math.max(1e-12, Syy - a0 * Sy - b * Sty), z = (lt - a0 - b * t) / Math.sqrt(ssr / (dn - 2));
        val = -Math.tanh(z / 1.5);
      }
      out.push({ tm, val, blend: val == null ? tm : 0.5 * tm + 0.5 * val, vol });
    }
    return { v, sig: out };
  };
  const icOf = (pairs) => { if (pairs.length < 200) return null; const xs = pairs.map((x) => x[0]), ys = pairs.map((x) => x[1]); const mx = mean(xs), my = mean(ys); let a = 0, b = 0, c = 0; for (let i = 0; i < xs.length; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; c += (ys[i] - my) ** 2; } return r3(a / Math.sqrt(b * c)); };
  const backtest = { method: 'Weekly. IC = correlation between the signal and the next period’s volatility-scaled return over T-bills (0.05 is useful, 0.10 strong). Ranking = assets in the top third by the blended signal minus the bottom third, rebalanced every 4 weeks.' };
  for (const [grp, ids] of [['alts', ALTS.map((a) => a.id)], ['eq', EQUITY.map((e) => 'eq_' + e.code)]]) {
    const P = Object.fromEntries(ids.map((id) => [id, panel(id)]).filter(([, x]) => x));
    const g = { ic: {}, rank: {}, from: null, to: W.at(-1) };
    for (const H of [13, 26, 52]) {
      const pr = { tm: [], val: [], blend: [] }, pr20 = { tm: [], val: [], blend: [] };
      for (const { v, sig } of Object.values(P)) {
        for (let t = 156; t + H < W.length; t++) {
          const x = sig[t]; if (!x || v[t + H] == null || cash[t] == null || cash[t + H] == null || !x.vol) continue;
          const ex = (v[t + H] / v[t] - cash[t + H] / cash[t]) / x.vol;
          g.from ||= W[t];
          for (const k of ['tm', 'val', 'blend']) if (x[k] != null) { pr[k].push([x[k], ex]); if (W[t] < '2020-01-01' || W[t] > '2020-12-31') pr20[k].push([x[k], ex]); }
        }
      }
      g.ic['h' + H] = { trend: icOf(pr.tm), value: icOf(pr.val), blend: icOf(pr.blend), blendEx2020: icOf(pr20.blend) };
    }
    // Cross-sectional ranking skill, 26-week horizon.
    const spreads = [];
    for (let t = 156; t + 26 < W.length; t += 4) {
      const row = Object.values(P).map(({ v, sig }) => (sig[t] && v[t + 26] != null ? [sig[t].blend, v[t + 26] / v[t] - 1] : null)).filter(Boolean).sort((a, b) => b[0] - a[0]);
      if (row.length < 6) continue;
      const k = Math.floor(row.length / 3), top = mean(row.slice(0, k).map((x) => x[1])), bot = mean(row.slice(-k).map((x) => x[1]));
      spreads.push(top - bot);
    }
    g.rank = spreads.length ? { spread: r3(mean(spreads) * 2), hit: r3(spreads.filter((x) => x > 0).length / spreads.length), n: spreads.length } : null;
    backtest[grp] = g;
  }

  const fxInr = assets['fx_INR=X'];
  return {
    ok: true, builtAt: new Date().toISOString(), ms: Date.now() - t0, asOfWeek: W.at(-1), weeks: W.length, sparkFrom: W[Math.max(0, W.length - 104)],
    usdinr: { last: inr.at(-1), spark: inr.slice(-104).map(r4), cagr10: fxInr?.usd?.r10y ?? null, chg1y: fxInr?.usd?.r1y ?? null, chg3m: fxInr?.usd?.r3m ?? null },
    assets, cot, bis: { policy: bisData.policy, cpi: bisData.cpi, reer: bisData.reer },
    thresholds: { eqDown: r3(tEq), ratesUp: r3(tRates), inflUp: r3(tInfl), usdUp: r3(tUsd), inrDown: r3(tInr), oilUp: r3(tOil) },
    backtest, notes,
  };
}
function s0(a) { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; }

/* ---------------- stored copy ---------------- */
export async function refreshResearch() {
  const r = await buildResearch();
  const good = Object.keys(r.assets).length >= 40;
  if (good) await saveLastGood('research', r);
  return { ...r, saved: good };
}
// Fast path for /api/research: the stored copy; builds once if nothing is stored yet.
export async function researchFast() {
  const last = await loadLastGood('research');
  if (last?.value) return { ...last.value, savedAt: last.savedAt, stale: Date.now() - Date.parse(last.savedAt) > 12 * 3600e3 };
  return refreshResearch();
}
