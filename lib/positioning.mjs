// Global 10-year yields, CFTC positioning, and cross-asset correlation / volatility regime.
import { get, num } from './http.mjs';
import { saveLastGood, loadLastGood, india10y } from './sources.mjs';

const DAY = 864e5;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const yago = (n) => iso(Date.now() - n * 365 * DAY);

/* ---------------- 10-year government bond yields (official sources) ---------------- */
async function usTsy() {
  const y = new Date().getUTCFullYear(), rows = [];
  for (const yr of [y - 1, y]) {
    const r = await get(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${yr}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${yr}&page&_format=csv`, { timeout: 12000 });
    const [head, ...lines] = (await r.text()).trim().split(/\r?\n/); const cols = head.split(',').map((c) => c.replace(/"/g, '').trim().toUpperCase());
    const i10 = cols.indexOf('10 YR'), i2 = cols.indexOf('2 YR');
    for (const l of lines) { const c = l.split(','); const [m, d, yy] = c[0].split('/'); rows.push({ d: `${yy}-${m}-${d}`, y10: num(c[i10]), y2: num(c[i2]) }); }
  }
  rows.sort((a, b) => (a.d < b.d ? -1 : 1));
  return { y10: rows.map((r) => [r.d, r.y10]).filter(([, v]) => v != null), y2: rows.map((r) => [r.d, r.y2]).filter(([, v]) => v != null) };
}
async function bundesbank() {
  const r = await get('https://api.statistiken.bundesbank.de/rest/data/BBSIS/D.I.ZST.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A?lastNObservations=420&format=csv&lang=en', { timeout: 12000 });
  const out = [];
  for (const l of (await r.text()).split(/\r?\n/)) { const m = l.match(/^(\d{4}-\d\d-\d\d)[;,]([-\d.,]+)/); if (m) out.push([m[1], num(m[2].replace(/,$/, '').replace(',', '.'))]); }
  return out.filter(([, v]) => v != null);
}
async function boe() {
  const from = new Date(Date.now() - 400 * DAY), mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const r = await get(`https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${String(from.getUTCDate()).padStart(2, '0')}/${mon[from.getUTCMonth()]}/${from.getUTCFullYear()}&Dateto=now&SeriesCodes=IUDMNZC&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`, { timeout: 12000 });
  const out = [];
  for (const l of (await r.text()).split(/\r?\n/)) { const m = l.match(/^(\d{2}) (\w{3}) (\d{4}),([-\d.]+)/); if (m) out.push([`${m[3]}-${String(mon.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1]}`, num(m[4])]); }
  return out;
}
async function mof() {
  const parse = (t) => t.split(/\r?\n/).map((l) => l.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2}),(?:[^,]*,){9}([-\d.]+)/)).filter(Boolean).map((m) => [`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, num(m[4])]);
  const [cur, all] = await Promise.all([
    get('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv', { timeout: 12000 }).then(async (r) => parse(Buffer.from(await r.arrayBuffer()).toString('latin1'))),
    get('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv', { timeout: 15000 }).then(async (r) => parse(Buffer.from(await r.arrayBuffer()).toString('latin1'))).catch(() => []),
  ]);
  const m = new Map([...all.filter(([d]) => d >= yago(1.2)), ...cur]);
  return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)).filter(([, v]) => v != null);
}
function ystats(pts) {
  if (!pts?.length) return null;
  const [d, last] = pts.at(-1), t0 = Date.parse(d);
  const at = (days) => { const cut = iso(t0 - days * DAY); let v = null; for (const [x, y] of pts) { if (x <= cut) v = y; else break; } return v; };
  const ch = (days) => { const p = at(days); return p == null ? null : last - p; };
  return { last, asOf: d, w1: ch(7), m1: ch(30), y1: ch(365), spark: pts.filter(([x]) => x >= iso(t0 - 365 * DAY)).filter((_, i, a) => i % 2 === 0 || i === a.length - 1) };
}
export async function yields() {
  const notes = [];
  const s = async (label, p) => { try { return await p; } catch (e) { notes.push(`${label}: ${e.message}`); return null; } };
  const [us, de, uk, jp, ind] = await Promise.all([s('US Treasury', usTsy()), s('Bundesbank', bundesbank()), s('Bank of England', boe()), s('Japan MoF', mof()), india10y()]);
  const rows = [
    us && { code: 'US', name: 'United States', src: 'US Treasury', ...ystats(us.y10), y2: ystats(us.y2) },
    de && { code: 'DE', name: 'Germany', src: 'Deutsche Bundesbank', cpi: 'XM', ...ystats(de) },
    uk && { code: 'GB', name: 'United Kingdom', src: 'Bank of England (zero-coupon)', cpi: 'GB', ...ystats(uk) },
    jp && { code: 'JP', name: 'Japan', src: 'Japan Ministry of Finance', cpi: 'JP', ...ystats(jp) },
    { code: 'IN', name: 'India', src: ind.auto ? 'CNBC quote feed' : 'Entered by hand', cpi: 'IN', last: ind.value, asOf: ind.asOf, manual: !ind.auto, stale: !!ind.stale },
  ].filter((r) => r && r.last != null);
  const usLast = rows.find((r) => r.code === 'US')?.last;
  for (const r of rows) { if (!r.cpi && r.code === 'US') r.cpi = 'US'; r.vsUS = usLast != null ? r.last - usLast : null; }
  return { rows, notes };
}

/* ---------------- CFTC Commitments of Traders ---------------- */
// Financial futures: leveraged funds (hedge funds, CTAs). Commodities: managed money. Net = (long − short) ÷ open interest.
export const COT = [
  { id: 'spx', name: 'S&P 500', ds: 'gpe5-46if', code: '13874+', who: 'Leveraged funds', L: 'lev_money_positions_long', S: 'lev_money_positions_short', am: true },
  { id: 'ndx', name: 'Nasdaq 100', ds: 'gpe5-46if', code: '20974+', who: 'Leveraged funds', L: 'lev_money_positions_long', S: 'lev_money_positions_short', am: true },
  { id: 'ust10', name: 'US 10-year Treasury', ds: 'gpe5-46if', code: '043602', who: 'Leveraged funds', L: 'lev_money_positions_long', S: 'lev_money_positions_short', am: true },
  { id: 'usd', name: 'US dollar index', ds: 'gpe5-46if', code: '098662', who: 'Leveraged funds', L: 'lev_money_positions_long', S: 'lev_money_positions_short' },
  { id: 'eur', name: 'Euro', ds: 'gpe5-46if', code: '099741', who: 'Leveraged funds', L: 'lev_money_positions_long', S: 'lev_money_positions_short' },
  { id: 'jpy', name: 'Japanese yen', ds: 'gpe5-46if', code: '097741', who: 'Leveraged funds', L: 'lev_money_positions_long', S: 'lev_money_positions_short' },
  { id: 'gold', name: 'Gold', ds: '72hh-3qpy', code: '088691', who: 'Managed money', L: 'm_money_positions_long_all', S: 'm_money_positions_short_all' },
  { id: 'wti', name: 'WTI crude', ds: '72hh-3qpy', code: '067651', who: 'Managed money', L: 'm_money_positions_long_all', S: 'm_money_positions_short_all' },
  { id: 'copper', name: 'Copper', ds: '72hh-3qpy', code: '085692', who: 'Managed money', L: 'm_money_positions_long_all', S: 'm_money_positions_short_all' },
];
async function cot(c) {
  const sel = ['report_date_as_yyyy_mm_dd', 'open_interest_all', c.L, c.S, ...(c.am ? ['asset_mgr_positions_long', 'asset_mgr_positions_short'] : [])].join(',');
  const r = await get(`https://publicreporting.cftc.gov/resource/${c.ds}.json?$select=${sel}&$where=${encodeURIComponent(`cftc_contract_market_code='${c.code}' AND report_date_as_yyyy_mm_dd > '${yago(3)}T00:00:00'`)}&$order=report_date_as_yyyy_mm_dd&$limit=200`, { headers: { Accept: 'application/json' }, timeout: 9000 });
  if (!r.ok) throw new Error('CFTC ' + r.status);
  const rows = (await r.json()).map((x) => { const oi = num(x.open_interest_all); return { d: x.report_date_as_yyyy_mm_dd.slice(0, 10), net: oi ? (num(x[c.L]) - num(x[c.S])) / oi : null, am: c.am && oi ? (num(x.asset_mgr_positions_long) - num(x.asset_mgr_positions_short)) / oi : null }; }).filter((x) => x.net != null);
  if (rows.length < 20) throw new Error('CFTC: short history');
  const last = rows.at(-1), vals = rows.map((x) => x.net);
  return {
    id: c.id, name: c.name, who: c.who, asOf: last.d, net: last.net, chg1w: rows.length > 1 ? last.net - rows.at(-2).net : null, chg4w: rows.length > 4 ? last.net - rows.at(-5).net : null,
    pct3y: vals.filter((v) => v < last.net).length / vals.length, min3y: Math.min(...vals), max3y: Math.max(...vals),
    amNet: last.am, series: rows.map((x) => [x.d, +x.net.toFixed(4)]),
  };
}

/* ---------------- Correlation and volatility regime (weekly, 10 years) ---------------- */
async function weekly(sym) {
  for (const host of ['query1', 'query2', 'query1']) {
    try {
      const r = await get(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=10y&interval=1wk`, { headers: { Accept: 'application/json' }, timeout: 8000 });
      if (!r.ok) continue;
      const res = (await r.json())?.chart?.result?.[0];
      const ts = res?.timestamp || [], cl = res?.indicators?.quote?.[0]?.close || [];
      // Key each bar by the Monday of its week so markets with different holidays line up.
      const monday = (t) => { const d = new Date(t * 1000); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return iso(d); };
      const m = new Map(ts.map((t, i) => [monday(t), num(cl[i])]).filter(([, v]) => v != null));
      if (m.size > 100) return m;
    } catch { /* retry */ }
  }
  throw new Error('Yahoo weekly ' + sym);
}
function rolling(a, b, n = 26) {
  const dates = [...a.keys()].filter((d) => b.has(d)).sort();
  const ret = []; for (let i = 1; i < dates.length; i++) ret.push([dates[i], a.get(dates[i]) / a.get(dates[i - 1]) - 1, b.get(dates[i]) / b.get(dates[i - 1]) - 1]);
  const out = [];
  for (let i = n - 1; i < ret.length; i++) {
    const w = ret.slice(i - n + 1, i + 1), mx = w.reduce((s, x) => s + x[1], 0) / n, my = w.reduce((s, x) => s + x[2], 0) / n;
    let sxy = 0, sxx = 0, syy = 0; for (const [, x, y] of w) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
    out.push([ret[i][0], +(sxy / Math.sqrt(sxx * syy)).toFixed(3)]);
  }
  return out;
}
function summary(series) {
  if (!series?.length) return null;
  const vals = series.map((x) => x[1]), last = vals.at(-1);
  return { last, asOf: series.at(-1)[0], pct10: vals.filter((v) => v < last).length / vals.length, mean: vals.reduce((a, b) => a + b, 0) / vals.length, series };
}
async function correlations() {
  // One at a time: Yahoo throttles bursts of 10-year history requests.
  const got = []; for (const sym of ['^GSPC', 'IEF', '^NSEI', '^VIX', 'GC=F']) got.push(await weekly(sym).then((value) => ({ status: 'fulfilled', value }), (reason) => ({ status: 'rejected', reason })));
  const [spx, ief, nifty, vix, gold] = got.map((g) => (g.status === 'fulfilled' ? g.value : new Map()));
  if (!spx.size) throw new Error('S&P 500 history unavailable');
  const stockBond = summary(rolling(spx, ief));
  const niftySpx = summary(rolling(nifty, spx));
  const goldSpx = summary(rolling(gold, spx));
  // 13-week realised volatility of the S&P 500 (annualised) against the VIX.
  const d = [...spx.keys()].sort(), rv = [];
  for (let i = 13; i < d.length; i++) { const r = []; for (let j = i - 12; j <= i; j++) r.push(Math.log(spx.get(d[j]) / spx.get(d[j - 1]))); const m = r.reduce((a, b) => a + b, 0) / 13; rv.push([d[i], +(Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / 12) * Math.sqrt(52) * 100).toFixed(2)]); }
  const vol = { realised: summary(rv), vix: vix.size ? [...vix].sort().at(-1)[1] : null };
  if (!vol.realised) throw new Error('volatility: no data');
  vol.premium = vol.vix != null ? vol.vix - vol.realised.last : null;
  if (!stockBond) throw new Error('stock–bond correlation: no data');
  return { stockBond, niftySpx, goldSpx, vol };
}

export async function buildPositioning() {
  const notes = [], s = async (label, p) => { try { return await p; } catch (e) { notes.push(`${label}: ${e.message}`); return null; } };
  const [y, cftc, corr] = await Promise.all([s('Yields', yields()), Promise.all(COT.map((c) => s('CFTC ' + c.name, cot(c)))), s('Correlation', correlations())]);
  const out = { ok: true, fetchedAt: new Date().toISOString(), yields: y?.rows || null, cftc: cftc.filter(Boolean), corr, notes: [...notes, ...(y?.notes || [])] };
  const last = await loadLastGood('positioning');
  if (!out.yields && last?.value?.yields) out.yields = last.value.yields;
  if (!out.cftc.length && last?.value?.cftc) out.cftc = last.value.cftc;
  if (!out.corr && last?.value?.corr) out.corr = last.value.corr;
  if (y && corr && out.cftc.length) await saveLastGood('positioning', out);
  return out;
}

// Read path for /api/positioning: serve the copy the scheduled job stored; build inline only if none exists yet.
export async function positioningFast() {
  const last = await loadLastGood('positioning');
  if (last?.value) return { ...last.value, savedAt: last.savedAt };
  return buildPositioning();
}
