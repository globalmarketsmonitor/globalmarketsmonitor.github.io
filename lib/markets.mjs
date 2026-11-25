// World markets heatmap, Nifty sectors and factors, and the market-implied Fed path.
import { get, num } from './http.mjs';
import { nseFetch, saveLastGood, loadLastGood } from './sources.mjs';
import { FOMC_SEED } from './events.mjs';
import { getReference } from './refdata/build.mjs';

const DAY = 864e5;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

// [symbol, name, region/note, invert] — invert flips USD-quoted FX so + means the currency gained vs the dollar.
export const HEAT = [
  { id: 'eq', name: 'World equities', items: [
    ['^GSPC', 'S&P 500', 'US'], ['^NDX', 'Nasdaq 100', 'US'], ['^RUT', 'Russell 2000', 'US'], ['^GSPTSE', 'S&P/TSX', 'Canada'],
    ['^BVSP', 'Bovespa', 'Brazil'], ['^MXX', 'IPC', 'Mexico'], ['^FTSE', 'FTSE 100', 'UK'], ['^GDAXI', 'DAX', 'Germany'],
    ['^FCHI', 'CAC 40', 'France'], ['^STOXX50E', 'Euro Stoxx 50', 'Euro area'], ['^N225', 'Nikkei 225', 'Japan'], ['^HSI', 'Hang Seng', 'Hong Kong'],
    ['000001.SS', 'Shanghai Comp.', 'China'], ['^KS11', 'KOSPI', 'Korea'], ['^TWII', 'TAIEX', 'Taiwan'], ['^AXJO', 'ASX 200', 'Australia'],
    ['^NSEI', 'Nifty 50', 'India'], ['^BSESN', 'Sensex', 'India'], ['^JKSE', 'Jakarta Comp.', 'Indonesia'], ['ACWI', 'MSCI ACWI', 'Global (ETF)'], ['EEM', 'MSCI EM', 'EM (ETF)'],
  ] },
  { id: 'sect', name: 'US sectors', items: [
    ['XLK', 'Technology'], ['XLC', 'Communication'], ['XLY', 'Discretionary'], ['XLF', 'Financials'], ['XLI', 'Industrials'], ['XLV', 'Health care'],
    ['XLP', 'Staples'], ['XLE', 'Energy'], ['XLB', 'Materials'], ['XLU', 'Utilities'], ['XLRE', 'Real estate'],
  ] },
  { id: 'style', name: 'US styles & factors', items: [
    ['IWF', 'Growth'], ['IWD', 'Value'], ['IWM', 'Small caps'], ['RSP', 'Equal weight'], ['MTUM', 'Momentum'], ['QUAL', 'Quality'], ['USMV', 'Min volatility'],
  ] },
  { id: 'cmd', name: 'Commodities', items: [
    ['GC=F', 'Gold'], ['SI=F', 'Silver'], ['HG=F', 'Copper'], ['BZ=F', 'Brent'], ['CL=F', 'WTI'], ['NG=F', 'Natural gas'], ['ZW=F', 'Wheat'],
  ] },
  { id: 'fx', name: 'Currencies vs USD', note: '+ = currency stronger against the dollar', items: [
    ['DX-Y.NYB', 'Dollar index', 'DXY'], ['EURUSD=X', 'Euro', 'EUR'], ['GBPUSD=X', 'Pound', 'GBP'], ['JPY=X', 'Yen', 'JPY', true], ['CHF=X', 'Swiss franc', 'CHF', true],
    ['AUDUSD=X', 'Aussie dollar', 'AUD'], ['CNY=X', 'Yuan', 'CNY', true], ['INR=X', 'Rupee', 'INR', true], ['KRW=X', 'Won', 'KRW', true], ['BRL=X', 'Brazilian real', 'BRL', true], ['MXN=X', 'Mexican peso', 'MXN', true],
  ] },
  { id: 'crypto', name: 'Crypto', items: [['BTC-USD', 'Bitcoin'], ['ETH-USD', 'Ether']] },
];

// NSE sector and factor indices (from the live allIndices feed).
export const NSE_SECTORS = ['NIFTY BANK', 'NIFTY PRIVATE BANK', 'NIFTY PSU BANK', 'NIFTY FINANCIAL SERVICES', 'NIFTY IT', 'NIFTY AUTO', 'NIFTY FMCG', 'NIFTY PHARMA', 'NIFTY HEALTHCARE INDEX', 'NIFTY METAL', 'NIFTY OIL & GAS', 'NIFTY ENERGY', 'NIFTY REALTY', 'NIFTY CONSUMER DURABLES', 'NIFTY MEDIA', 'NIFTY CHEMICALS', 'NIFTY CEMENT', 'NIFTY INFRASTRUCTURE', 'NIFTY PSE', 'NIFTY INDIA DEFENCE', 'NIFTY CAPITAL MARKETS'];
export const NSE_FACTORS = ['NIFTY NEXT 50', 'NIFTY200 MOMENTUM 30', 'NIFTY100 QUALITY 30', 'NIFTY200 VALUE 30', 'NIFTY100 LOW VOLATILITY 30', 'NIFTY ALPHA 50', 'NIFTY HIGH BETA 50', 'NIFTY50 EQUAL WEIGHT', 'NIFTY DIVIDEND OPPORTUNITIES 50'];

// FOMC rate-decision days come from the Fed's calendar via the reference-data engine (strategy-only meetings excluded),
// with the verified seed in lib/events.mjs as the fallback.
export const FOMC = FOMC_SEED;

/* ---------------- Yahoo spark (batch daily closes) ---------------- */
export async function spark(symbols, range = '1y') {
  const out = {};
  const chunks = []; for (let i = 0; i < symbols.length; i += 20) chunks.push(symbols.slice(i, i + 20));
  await Promise.all(chunks.map(async (c) => {
    for (const host of ['query1', 'query2']) {
      try {
        const r = await get(`https://${host}.finance.yahoo.com/v7/finance/spark?symbols=${c.map(encodeURIComponent).join(',')}&range=${range}&interval=1d`, { headers: { Accept: 'application/json' }, timeout: 9000 });
        if (!r.ok) continue;
        for (const s of (await r.json())?.spark?.result || []) {
          const resp = s.response?.[0]; if (!resp?.timestamp) continue;
          const cl = resp.indicators?.quote?.[0]?.close || [];
          const pts = resp.timestamp.map((t, i) => [iso(t * 1000), num(cl[i])]).filter(([, v]) => v != null);
          const m = resp.meta || {};
          if (m.regularMarketPrice != null && m.regularMarketTime) { const d = iso(m.regularMarketTime * 1000); if (pts.length && pts.at(-1)[0] === d) pts[pts.length - 1][1] = m.regularMarketPrice; else pts.push([d, m.regularMarketPrice]); }
          out[s.symbol] = { pts, time: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null, state: m.marketState || null, cur: m.currency || null };
        }
        return;
      } catch { /* next host */ }
    }
  }));
  return out;
}

function perf(pts, invert) {
  if (!pts?.length) return null;
  const [lastD, last] = pts.at(-1), t0 = Date.parse(lastD);
  const at = (days) => { const cut = iso(t0 - days * DAY); let v = null; for (const [d, x] of pts) { if (d <= cut) v = x; else break; } return v; };
  const ytdBase = (() => { const y = lastD.slice(0, 4); let v = null; for (const [d, x] of pts) { if (d < y + '-01-01') v = x; else break; } return v; })();
  const r = (prev) => { if (!prev) return null; const x = last / prev - 1; return invert ? 1 / (1 + x) - 1 : x; };
  return { last, asOf: lastD, d1: pts.length > 1 ? r(pts.at(-2)[1]) : null, w1: r(at(7)), m1: r(at(30)), m3: r(at(91)), ytd: r(ytdBase), y1: r(at(365)), spark: pts.slice(-130).filter((_, i, a) => i % 2 === 0 || i === a.length - 1).map(([d, v]) => [d, +v.toFixed(4)]) };
}

export async function heatmap() {
  const syms = HEAT.flatMap((g) => g.items.map((x) => x[0]));
  const sp = await spark(syms, '2y');
  const groups = HEAT.map((g) => ({ id: g.id, name: g.name, note: g.note || '', items: g.items.map(([sym, name, sub, inv]) => { const p = perf(sp[sym]?.pts, inv); return p && { sym, name, sub: sub || '', invert: !!inv, ...p, time: sp[sym]?.time }; }).filter(Boolean) }));
  if (groups.reduce((a, g) => a + g.items.length, 0) < 20) throw new Error('Yahoo spark: too few symbols');
  return groups;
}

export async function nseSectors() {
  const d = await nseFetch('/api/allIndices');
  const rows = Array.isArray(d?.data) ? d.data : [];
  const pick = (names) => names.map((n) => rows.find((r) => r.index === n)).filter(Boolean).map((r) => {
    const last = num(r.last), rel = (v) => { const x = num(v); return x ? last / x - 1 : null; };
    const nice = r.index.replace(/^NIFTY ?/, '').replace(' INDEX', '').toLowerCase().replace(/(^|\s|&|\/)\S/g, (c) => c.toUpperCase()).replace(/\bIt\b/, 'IT').replace(/\bPsu\b/, 'PSU').replace(/\bPse\b/, 'PSE').replace(/\bFmcg\b/, 'FMCG');
    return { name: nice || r.index, index: r.index, last, d1: num(r.percentChange) / 100, w1: rel(r.oneWeekAgoVal), m1: rel(r.oneMonthAgoVal), y1: rel(r.oneYearAgoVal), pe: num(r.pe), pb: num(r.pb), adv: num(r.advances), dec: num(r.declines) };
  });
  return { timestamp: d.timestamp || null, sectors: pick(NSE_SECTORS), factors: pick(NSE_FACTORS) };
}

/* ---------------- Market-implied Fed path from 30-day fed funds futures ---------------- */
const MCODE = 'FGHJKMNQUVXZ';
function solvePath(months, effr, fomc = FOMC) {
  // Piecewise-constant overnight rate that changes the day after each FOMC decision.
  // Unknowns: r0 (now) and one rate after each meeting. Each futures month gives one equation:
  //   month average = Σ (days at each rate) × rate / days in month. Solved by least squares.
  const meetings = fomc.filter((d) => d >= months[0].start && d <= months.at(-1).end);
  const k = meetings.length + 1, rows = [], rhs = [];
  for (const m of months) {
    const N = m.days, w = new Array(k).fill(0);
    for (let day = 1; day <= N; day++) {
      const d = `${m.month}-${String(day).padStart(2, '0')}`;
      const j = meetings.filter((x) => x < d).length; // a decision on day x takes effect from x+1
      w[j] += 1 / N;
    }
    rows.push(w); rhs.push(m.implied);
  }
  if (effr != null) { const w = new Array(k).fill(0); w[0] = 3; rows.push(w); rhs.push(3 * effr); } // anchor today's rate to the effective rate
  // Normal equations.
  const A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => rows.reduce((s, r) => s + r[i] * r[j], 0)));
  const b = Array.from({ length: k }, (_, i) => rows.reduce((s, r, n) => s + r[i] * rhs[n], 0));
  for (let i = 0; i < k; i++) A[i][i] += 1e-9;
  for (let c = 0; c < k; c++) { let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]]; for (let r = c + 1; r < k; r++) { const f = A[r][c] / A[c][c]; for (let j = c; j < k; j++) A[r][j] -= f * A[c][j]; b[r] -= f * b[c]; } }
  const x = new Array(k).fill(0); for (let i = k - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < k; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; }
  return { r0: x[0], meetings: meetings.map((d, i) => ({ date: d, rate: x[i + 1], change: x[i + 1] - x[i] })) };
}

// The effective fed funds rate from the New York Fed, which calculates and publishes it (each business day at about
// 09:00 New York time, for the day before). DBnomics' copy of the Fed's H.15 runs a week or more behind: fallback only.
export function effrFromNyFed(j) {
  const rows = (j?.refRates || []).filter((x) => !x.type || x.type === 'EFFR').map((x) => [String(x.effectiveDate || ''), num(x.percentRate)]).filter(([d, v]) => /^\d{4}-\d\d-\d\d$/.test(d) && v != null && v >= 0 && v < 20).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return rows.length ? { last: rows.at(-1)[1], asOf: rows.at(-1)[0], src: 'New York Fed' } : null;
}
async function effr() {
  try {
    const r = await get(`https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate=${iso(Date.now() - 21 * DAY)}&endDate=${iso(Date.now())}`, { headers: { Accept: 'application/json' }, timeout: 9000 });
    if (!r.ok) throw new Error('New York Fed ' + r.status);
    const e = effrFromNyFed(await r.json());
    if (e) return e;
    throw new Error('New York Fed: no EFFR');
  } catch (e1) {
    const r = await get('https://api.db.nomics.world/v22/series/FED/H15/RIFSPFF_N.B?observations=1&format=json', { headers: { Accept: 'application/json' }, timeout: 9000 });
    const s = (await r.json())?.series?.docs?.[0];
    const pts = s.period.map((p, i) => [p, num(s.value[i])]).filter(([, v]) => v != null);
    return { last: pts.at(-1)[1], asOf: pts.at(-1)[0], src: `Federal Reserve H.15 via DBnomics (New York Fed unavailable: ${String(e1.message).slice(0, 60)})` };
  }
}

export async function ratePath() {
  const now = new Date(), list = [];
  for (let i = 0; i < 15; i++) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const y = dt.getUTCFullYear(), m = dt.getUTCMonth();
    const month = `${y}-${String(m + 1).padStart(2, '0')}`, days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    list.push({ month, days, start: `${month}-01`, end: `${month}-${days}`, sym: `ZQ${MCODE[m]}${String(y).slice(2)}.CBT` });
  }
  const [sp, ef] = await Promise.all([spark(list.map((x) => x.sym), '3mo'), effr().catch(() => null)]);
  const build = (pick) => list.map((x) => { const p = pick(sp[x.sym]?.pts); return p == null ? null : { ...x, implied: 100 - p }; }).filter(Boolean);
  const nowMonths = build((pts) => pts?.at(-1)?.[1]);
  if (nowMonths.length < 6) throw new Error('fed funds futures: too few contracts');
  const ago = (pts) => { if (!pts?.length) return null; const cut = iso(Date.parse(pts.at(-1)[0]) - 30 * DAY); let v = null; for (const [d, x] of pts) if (d <= cut) v = x; return v; };
  const thenMonths = build(ago);
  const fomc = (await getReference().catch(() => null))?.fomc || FOMC;
  const P = solvePath(nowMonths, ef?.last, fomc);
  const prev = thenMonths.length >= 6 ? solvePath(thenMonths, null, fomc) : null;
  const base = ef?.last ?? P.r0;
  const meetings = P.meetings.map((m) => ({ ...m, cum: m.rate - base, moves: (m.rate - base) / 0.25 }));
  const oneYearDate = iso(Date.now() + 365 * DAY);
  const far = meetings.filter((m) => m.date <= oneYearDate).at(-1) || meetings.at(-1);
  const farPrev = prev?.meetings.find((m) => m.date === far?.date);
  return {
    effr: ef?.last ?? null, effrAsOf: ef?.asOf ?? null, effrSrc: ef?.src ?? null, r0: P.r0, asOf: sp[nowMonths[0].sym]?.pts?.at(-1)?.[0] ?? null,
    months: nowMonths.map((m) => ({ month: m.month, implied: m.implied, sym: m.sym })),
    meetings, oneYearDate, horizon: far ? { date: far.date, rate: far.rate, cum: far.cum } : null,
    chg1m: far && farPrev ? far.rate - farPrev.rate : null,
  };
}

export async function buildMarkets() {
  const notes = [], settle = async (label, p) => { try { return await p; } catch (e) { notes.push(`${label}: ${e.message}`); return null; } };
  const [heat, nse, rp] = await Promise.all([settle('Heatmap', heatmap()), settle('NSE sectors', nseSectors()), settle('Fed path', ratePath())]);
  const out = { ok: true, fetchedAt: new Date().toISOString(), heat, nse, ratePath: rp, notes };
  // Fill any missing block from the last good copy.
  const last = await loadLastGood('markets');
  for (const k of ['heat', 'nse', 'ratePath']) if (!out[k] && last?.value?.[k]) { out[k] = last.value[k]; out.notes.push(`${k}: showing copy saved ${last.savedAt}`); }
  if (heat && nse && rp) await saveLastGood('markets', out);
  return out;
}
