// Parsers for the official sources, each returning data plus the arithmetic checks that back a "verified" label.
//   AMFI monthly report (.xls): categories (flows, AUM, folios) + new schemes (NFOs)
//   SEBI "Status of Mutual Fund Industry" (HTML): same categories, financial-year-to-date flows, and SIP by category
//   NSDL FPI net investment (HTML): monthly by asset class, calendar-year and financial-year tables
//   SEBI mutual fund trading on exchanges (HTML): this month's daily equity/debt buying and selling
//   AMFI SIP statistics page (HTML): SIP inflows by month since April 2016; this year's SIP accounts and SIP AUM
//   Exchanges (NSE / BSE JSON): FII/FPI and DII cash-market buying and selling, latest trading day, provisional
//   NSDL FPI investment by reporting date (HTML): this month's page and the monthly archive
import { normRows } from './xls.mjs';
import { htmlTables, grid, toNum, textOf } from './html.mjs';
import { resolve, groupOf, isRoman, norm, periodFrom, MONTHS, MON3, BY_KEY, addMonths } from './taxonomy.mjs';

const r2 = (x) => Math.round(x * 100) / 100;
const best = (tables) => tables.sort((a, b) => b.length - a.length)[0] || null; // the data table, not a layout table around it
const close = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
const MONEY = ['gross', 'red', 'net', 'aum', 'aaum', 'sipAmt'];
const COUNT = ['schemes', 'folios', 'sipOpen', 'sipReg', 'sipMat', 'sipTerm', 'sipClose'];
const tolFor = (k, v, n = 1) => (COUNT.includes(k) ? 0.5 + 0.0 * n : Math.max(0.06 * n, Math.abs(v || 0) * 2e-6));

/* ---------------- Monthly Cumulative Report layout (AMFI and SEBI share it) ---------------- */
const COLS = [
  ['schemes', /no\.?\s*of\s*schemes/i], ['folios', /no\.?\s*of\s*folios/i], ['gross', /funds\s*mobili[sz]ed/i],
  ['red', /repurchase|redemption/i], ['net', /net\s*inflow/i], ['aaum', /average/i],
  ['segN', /segregated\s*portfolios?\s*created/i], ['segAum', /segregated/i], ['aum', /net\s*assets?\s*under\s*management|net\s*asset\s*under/i],
  ['sipAmt', /sip\s*inf(?:l)?ows?/i], ['sipOpen', /existing\s*sip/i], ['sipReg', /sip.*registered/i], ['sipMat', /sip.*matured/i],
  ['sipTerm', /sip.*terminated/i], ['sipClose', /closing.*sip/i],
];
function mapHeader(row) {
  const map = {};
  row.forEach((cell, i) => { const s = String(cell ?? ''); for (const [k, re] of COLS) { if (map[k] != null) continue; if (re.test(s)) { map[k] = i; break; } } });
  return map;
}
const findHeader = (rows) => rows.findIndex((r) => r.some((c) => /scheme\s*(name|category)/i.test(String(c ?? ''))) && r.some((c) => /funds\s*mobili/i.test(String(c ?? ''))));
const lowerIdx = (s) => /^[ivxl]+\.?$/.test(s);

function mcrRows(rows, h, map) {
  const nameCol = rows[h].findIndex((c) => /scheme\s*(name|category)/i.test(String(c ?? '')));
  const srCol = Math.max(0, nameCol - 1);
  const numKeys = COLS.map(([k]) => k).filter((k) => map[k] != null && !['segN', 'segAum'].includes(k));
  let top = 'A', grp = null, segRows = [];
  const cats = [], subs = [], totals = {}, unknown = [];
  let fof = null;
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] || [], sr = String(r[srCol] ?? '').trim(), name = String(r[nameCol] ?? '').replace(/\s+/g, ' ').trim();
    if (!name && !sr) continue;
    if (/^\(\d+\)$/.test(name)) continue; // "(1) (2) (3)…" column-number row
    const vals = {}; let has = false;
    for (const k of numKeys) { const v = toNum(r[map[k]]); vals[k] = v; if (v != null) has = true; }
    const nn = norm(name);
    if (/^[ABC]$/.test(sr) && !has) { top = sr; grp = null; segRows = []; continue; }
    if (!has) { if (isRoman(sr) || groupOf(name)) { grp = groupOf(name) || grp; segRows = []; } continue; }
    if (/^grandtotal/.test(nn)) { totals.grand = vals; continue; }
    if (/^total/.test(nn)) { const t = /totala|openended/.test(nn) ? 'A' : /totalb|closeended/.test(nn) ? 'B' : /totalc|interval/.test(nn) ? 'C' : top; totals[t] = vals; continue; }
    if (/^subtotal/.test(nn)) { subs.push({ top, grp, vals, rows: segRows.slice(), label: name }); segRows = []; continue; }
    if (/fundoffunds.*domestic/.test(nn)) { fof = vals; continue; }
    const g = isRoman(sr) && !lowerIdx(sr) ? (groupOf(name) || grp) : grp; // e.g. old "III Other Schemes" carries numbers itself
    const cat = resolve(top, g, name);
    if (!cat) { unknown.push(`${top}/${g || '?'}: ${name}`); continue; }
    const row = { k: cat.k, label: name, top, ...vals };
    cats.push(row); segRows.push(row);
  }
  return { cats, subs, totals, fof, unknown, cols: numKeys };
}

function sumRows(rows, k) { let s = 0, any = false; for (const r of rows) if (r[k] != null) { s += r[k]; any = true; } return any ? s : null; }

// Checks shared by AMFI and SEBI: row arithmetic, sub-totals, section totals and grand total.
function mcrChecks(p, { fytd = false } = {}) {
  const checks = [], add = (id, ok, detail) => checks.push({ id, ok: !!ok, detail });
  const bad = [];
  for (const r of p.cats) if (r.gross != null && r.red != null && r.net != null && !close(r.gross - r.red, r.net, Math.max(0.06, Math.abs(r.net) * 1e-6))) bad.push(`${r.label}: ${r.gross} − ${r.red} ≠ ${r.net}`);
  add('row-net', !bad.length, bad.length ? bad.slice(0, 4).join('; ') : `inflow − redemption = net for all ${p.cats.length} categories`);
  const subBad = [];
  for (const s of p.subs) for (const k of p.cols) { const sum = sumRows(s.rows, k); if (sum == null || s.vals[k] == null) continue; if (!close(sum, s.vals[k], tolFor(k, s.vals[k], s.rows.length))) subBad.push(`${s.label} ${k}: rows ${r2(sum)} vs ${s.vals[k]}`); }
  add('subtotals', p.subs.length > 0 && !subBad.length, subBad.length ? subBad.slice(0, 4).join('; ') : `${p.subs.length} sub-totals equal the sum of their rows`);
  const secBad = [];
  for (const t of ['A', 'B', 'C']) {
    const rows = p.cats.filter((r) => r.top === t); if (!rows.length || !p.totals[t]) continue;
    for (const k of p.cols) { const sum = sumRows(rows, k); if (sum != null && p.totals[t][k] != null && !close(sum, p.totals[t][k], tolFor(k, p.totals[t][k], rows.length))) secBad.push(`Total ${t} ${k}: rows ${r2(sum)} vs ${p.totals[t][k]}`); }
  }
  add('sections', !secBad.length, secBad.length ? secBad.slice(0, 4).join('; ') : 'open-ended, close-ended and interval totals equal their rows');
  const g = p.totals.grand, gBad = [];
  if (g) for (const k of p.cols) { const sum = sumRows(p.cats, k); if (sum != null && g[k] != null && !close(sum, g[k], tolFor(k, g[k], p.cats.length))) gBad.push(`${k}: rows ${r2(sum)} vs ${g[k]}`); }
  add('grand-total', !!g && !gBad.length, !g ? 'no grand total row' : gBad.length ? gBad.slice(0, 4).join('; ') : 'grand total equals the sum of all categories');
  add('categories', !p.unknown.length && p.cats.length >= 40, p.unknown.length ? 'unrecognised: ' + p.unknown.slice(0, 4).join('; ') : `${p.cats.length} categories recognised`);
  const core = ['liquid', 'overnight', 'largecap', 'midcap', 'smallcap', 'flexicap', 'arbitrage', 'goldetf', 'fofovs'];
  const miss = core.filter((k) => !p.cats.some((r) => r.k === k));
  add('core', !miss.length, miss.length ? 'missing: ' + miss.join(', ') : 'all core categories present');
  if (g?.aum != null) add('plausible', g.aum > 1e6 && g.aum < 5e8 && (fytd || Math.abs(g.net ?? 0) < g.aum * 0.2), `AUM ₹${Math.round(g.aum).toLocaleString('en-IN')} cr`);
  return checks;
}

function packRows(cats, keys) {
  const out = {};
  for (const r of cats) {
    const prev = out[r.k];
    const vals = keys.map((k) => r[k] ?? null);
    out[r.k] = prev ? prev.map((v, i) => (v == null ? vals[i] : vals[i] == null ? v : r2(v + vals[i]))) : vals; // same category twice (rare): add up
  }
  return out;
}

/* ---------------- AMFI monthly report ---------------- */
export const AMFI_FIELDS = ['schemes', 'folios', 'gross', 'red', 'net', 'aum', 'aaum'];
export function parseAmfiSheets(sheets, expectPeriod) {
  const sh = sheets.find((s) => findHeader(normRows(s.rows)) >= 0);
  if (!sh) throw new Error('AMFI report: no category table found');
  const rows = normRows(sh.rows), h = findHeader(rows), map = mapHeader(rows[h]);
  for (const k of ['schemes', 'folios', 'gross', 'red', 'net', 'aum', 'aaum']) if (map[k] == null) throw new Error('AMFI report: column not found: ' + k);
  const title = rows.slice(0, h).flat().filter(Boolean).join(' ');
  const period = periodFrom(title) || periodFrom(rows[h].join(' '));
  const p = mcrRows(rows, h, map);
  const checks = mcrChecks(p);
  checks.push({ id: 'period', ok: !expectPeriod || period === expectPeriod, detail: `report says ${period || 'unknown'}${expectPeriod ? `, index says ${expectPeriod}` : ''}` });
  const nsr = sheets.find((s) => s !== sh && normRows(s.rows).some((r) => r.some((c) => /name of the scheme/i.test(String(c ?? '')))));
  const nfo = nsr ? parseNsr(normRows(nsr.rows)) : null;
  if (nfo) checks.push(...nfo.checks);
  const isNew = p.cats.some((r) => ['value', 'contra', 'sectoral', 'thematic', 'indexeq', 'etfeq'].includes(r.k));
  return {
    period: period || expectPeriod, fmt: isNew ? 'v2026' : 'v2019', sheet: sh.name,
    rows: packRows(p.cats, AMFI_FIELDS), labels: Object.fromEntries(p.cats.map((r) => [r.k, r.label])),
    total: { A: p.totals.A && AMFI_FIELDS.map((k) => p.totals.A[k] ?? null), B: p.totals.B && AMFI_FIELDS.map((k) => p.totals.B[k] ?? null), C: p.totals.C && AMFI_FIELDS.map((k) => p.totals.C[k] ?? null), grand: p.totals.grand && AMFI_FIELDS.map((k) => p.totals.grand[k] ?? null) },
    fof: p.fof && AMFI_FIELDS.map((k) => p.fof[k] ?? null),
    nfo: nfo && { n: nfo.list.length, amt: nfo.total, list: nfo.list },
    checks,
  };
}

// New Schemes Report: every scheme launched in the month and the money it raised (₹ crore, whole numbers).
function nsrClass(label) {
  const s = String(label || '').toLowerCase();
  if (/fund of funds/.test(s) && /domestic/.test(s)) return 'fofdom';
  if (/overseas/.test(s) && /fund of funds/.test(s)) return 'fofovs';
  if (/close ended|fixed term|fixed maturity|interval/.test(s)) return 'closed';
  if (/life ?cycle|solution|retirement|children/.test(s)) return 'solution';
  if (/other schemes/.test(s)) return 'other';
  if (/index|etf|exchange traded/.test(s)) return 'passive';
  if (/hybrid|arbitrage|multi asset|balanced|equity savings/.test(s)) return 'hybrid';
  if (/debt|income|liquid|overnight|money market|gilt|duration|bond|credit/.test(s)) return 'debt';
  if (/equity|growth|cap fund|elss|value|contra|focused|sectoral|thematic|dividend/.test(s)) return 'equity';
  return null;
}
function parseNsr(rows) {
  const h = rows.findIndex((r) => r.some((c) => /name of the scheme/i.test(String(c ?? ''))));
  const hdr = rows[h].map((c) => String(c ?? '')), sub = (rows[h + 1] || []).map((c) => String(c ?? ''));
  const nameCol = hdr.findIndex((c) => /name of the scheme/i.test(c)), catCol = Math.max(0, hdr.findIndex((c) => /type and category/i.test(c)));
  const amtCols = [], kindAt = {};
  [hdr, sub].forEach((r) => r.forEach((c, i) => { if (/funds\s*mobili/i.test(c) && !amtCols.includes(i)) amtCols.push(i); }));
  hdr.forEach((c, i) => { if (/open\s*ended/i.test(c)) kindAt[i] = 'open'; if (/close\s*ended/i.test(c)) kindAt[i] = 'close'; });
  const kindOfCol = (j) => kindAt[j] || kindAt[j - 1] || null;
  const list = [], totals = [];
  let cls = null, kind = 'open', cat = null;
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] || [], c0 = String(r[catCol] ?? '').trim(), nm = String(r[nameCol] ?? '').trim();
    if (/^\s*(type and category|no\. of schemes|funds mobili)/i.test(c0 + nm)) continue;
    const amts = amtCols.map((j) => toNum(r[j]));
    const any = amts.some((v) => v != null);
    const TOT = /^(sub\s*-?\s*total|grand\s*total|total)\b/i; // label column only: scheme names can contain "Total" (BSE Total Market…)
    if (TOT.test(c0) || (!c0 && TOT.test(nm))) { if (any) totals.push({ label: c0 || nm, sum: amts.reduce((s, v) => s + (v || 0), 0) }); continue; }
    if (!nm) {
      if (c0 && !any) {
        if (/close\s*ended/i.test(c0)) { kind = 'close'; cls = 'closed'; }
        else if (/fund of funds.*domestic/i.test(c0)) { kind = 'fof'; cls = 'fofdom'; }
        else if (/open\s*ended/i.test(c0)) { if (kind === 'close') kind = 'open'; }
        else { const c = nsrClass(c0); if (c) { cls = c; if (kind !== 'fof') kind = 'open'; } }
        cat = null;
      }
      continue;
    }
    if (c0) cat = c0;
    amts.forEach((v, j) => {
      if (v == null || (v === 0 && amts.some((x, jj) => jj !== j && x))) return;
      if (v === 0 && amtCols.length > 1) return;
      const k = amtCols.length > 1 ? (kindOfCol(amtCols[j]) || kind) : kind;
      const cc = nsrClass(cat); // the section heading decides; the category only refines the old "Other Schemes" section
      const c = k === 'close' ? 'closed' : k === 'fof' ? 'fofdom' : cls && cls !== 'other' ? cls : cc || cls;
      list.push({ name: nm, cat: (cat || '').replace(/\s+/g, ' '), cls: c || 'other', kind: k, amt: v });
    });
  }
  const sum = list.reduce((s, x) => s + x.amt, 0);
  const grand = totals.filter((t) => /grand/i.test(t.label)).pop() || totals.filter((t) => /^total\b/i.test(t.label) && !/open ended\+|sub/i.test(t.label)).pop() || totals[totals.length - 1];
  const total = grand ? grand.sum : sum;
  const tol = 0.5 * list.length + 1;
  return { list: list.sort((a, b) => b.amt - a.amt), total, checks: [{ id: 'nfo-total', ok: !!grand && close(sum, total, tol), detail: grand ? `${list.length} new schemes, ₹${sum.toLocaleString('en-IN')} cr; report total ₹${total.toLocaleString('en-IN')} cr` : 'no total row' }] };
}

/* ---------------- SEBI: Status of Mutual Fund Industry (MCR) ---------------- */
export const SEBI_FIELDS = ['schemes', 'folios', 'gross', 'red', 'net', 'aum', 'aaum'];
export const SIP_FIELDS = ['sipAmt', 'sipOpen', 'sipReg', 'sipMat', 'sipTerm', 'sipClose'];
export function parseSebiMcr(html) {
  const t = best(htmlTables(html).map(grid).filter((g) => findHeader(g) >= 0));
  if (!t) throw new Error('SEBI MCR: table not found');
  const h = findHeader(t), map = mapHeader(t[h]);
  const title = t.slice(0, h).flat().join(' ');
  const to = title.match(/\bto\s+([A-Za-z]+\.?\s*\d{1,2},?\s*20\d\d)/i);
  const period = periodFrom(to ? to[1] : title);
  if (!period) throw new Error('SEBI MCR: period not found in title');
  const p = mcrRows(t, h, map);
  const checks = mcrChecks(p, { fytd: true }); // SEBI's own table: informational (it has had typing slips)
  const hasSip = map.sipAmt != null;
  let sip = null, sipChecks = [];
  if (hasSip) {
    const bad = [];
    for (const r of p.cats) if (r.sipOpen != null && r.sipClose != null && r.sipReg != null && !close(r.sipOpen + r.sipReg - (r.sipMat || 0) - (r.sipTerm || 0), r.sipClose, Math.max(2, r.sipClose * 2e-5))) bad.push(`${r.label} (${Math.round(r.sipOpen + r.sipReg - (r.sipMat || 0) - (r.sipTerm || 0) - r.sipClose).toLocaleString('en-IN')})`);
    const g = p.totals.grand || {}, f = p.fof || {};
    const sumAmt = sumRows(p.cats, 'sipAmt');
    sipChecks = [
      { id: 'sip-sum', ok: g.sipAmt != null && close(sumAmt, g.sipAmt, 1), detail: `SIP by category adds to ₹${r2(sumAmt ?? 0).toLocaleString('en-IN')} cr vs SEBI total ₹${(g.sipAmt ?? 0).toLocaleString('en-IN')} cr` },
      { id: 'sip-accounts', ok: !!g.sipReg && close(sumRows(p.cats, 'sipReg'), g.sipReg, 10), detail: 'new SIP registrations by category add to the total' },
      { id: 'sip-rollforward', ok: bad.length <= Math.max(3, p.cats.length * 0.08), info: true, detail: bad.length ? `accounts roll forward in ${p.cats.length - bad.length} of ${p.cats.length} categories; small gaps in ${bad.slice(0, 4).join(', ')}` : 'opening + registered − matured − terminated = closing in every category' },
    ];
    sip = {
      mcr: g.sipAmt ?? null, fof: f.sipAmt ?? null, total: g.sipAmt != null ? r2(g.sipAmt + (f.sipAmt || 0)) : null,
      acc: Object.fromEntries(['sipOpen', 'sipReg', 'sipMat', 'sipTerm', 'sipClose'].map((k) => [k.slice(3).toLowerCase(), g[k] != null ? g[k] + (f[k] || 0) : null])),
      cats: packRows(p.cats, SIP_FIELDS),
    };
  }
  return {
    period, fyStart: `${+period.slice(0, 4) - (+period.slice(5) < 4 ? 1 : 0)}-04`, sip: !!sip, sipData: sip, sipChecks,
    rows: packRows(p.cats, SEBI_FIELDS), // gross/red/net are financial-year-to-date
    total: { grand: p.totals.grand && SEBI_FIELDS.map((k) => p.totals.grand[k] ?? null) }, fof: p.fof && SEBI_FIELDS.map((k) => p.fof[k] ?? null),
    checks,
  };
}
// Links on SEBI's listing page: setsrc('objective/apr-sep-2026.html','6') → { period: '2026-09', path }
export function parseSebiListing(html) {
  const out = [];
  for (const m of String(html).matchAll(/setsrc\(\s*'(objective\/([a-z]+)-([a-z]+)-(\d{4})\.html)'/gi)) {
    const i = MON3.indexOf(m[3].slice(0, 3).toLowerCase()); if (i < 0) continue;
    out.push({ period: `${m[4]}-${String(i + 1).padStart(2, '0')}`, path: m[1] });
  }
  return out;
}

/* ---------------- NSDL: FPI net investment ---------------- */
const FPI_KEYS = { 'equity': 'equity', 'debt': 'debtGL', 'debt-general limit': 'debtGL', 'debt-vrr': 'debtVRR', 'debt-far': 'debtFAR', 'hybrid': 'hybrid', 'mf:equity': 'mfEq', 'mf:debt': 'mfDebt', 'mf:hybrid': 'mfHyb', 'mf:solution oriented': 'mfSol', 'mf:other': 'mfOther', 'aif': 'aif' };
// Column positions from the sub-heading row (Equity | Debt-General Limit | … | AIF). Row-spanning cells such as
// "Calendar Year" and "Total" are copied into that row by grid(), which keeps positions aligned with the data rows.
function fpiColumns(t) {
  const sub = t.find((r) => r.some((c) => /^debt-general limit$/i.test(String(c).trim())))
    || t.find((r) => r.some((c) => /^equity$/i.test(String(c).trim())) && r.some((c) => /^debt$/i.test(String(c).trim())) && r.some((c) => /^total/i.test(String(c).trim()))); // tables before 2024
  if (!sub) throw new Error('NSDL: column headings not found');
  const cols = []; let mf = false, totalAt = null;
  sub.forEach((c, j) => {
    const l = String(c).trim().toLowerCase();
    if (!l) return;
    if (/^total/.test(l)) { if (totalAt == null) totalAt = j; return; }
    if (/year|cumulative/.test(l)) return;
    if (l === 'equity' && cols.some((x) => x.k === 'equity')) mf = true;
    const k = FPI_KEYS[(mf && ['equity', 'debt', 'hybrid', 'solution oriented', 'other'].includes(l) ? 'mf:' : '') + l];
    if (!k) throw new Error('NSDL: unknown column ' + l);
    cols.push({ k, j });
  });
  if (totalAt == null) totalAt = cols[cols.length - 1].j + 1;
  return { cols, totalAt };
}
export function parseNsdlYear(html) {
  const tabs = htmlTables(html).map(grid);
  const t = best(tabs.filter((g) => g.some((r) => r.some((c) => /Monthly FPI Net Investments/i.test(c)))));
  if (!t) throw new Error('NSDL: monthly table not found');
  const year = +(t.flat().join(' ').match(/Calendar Year\s*-\s*(20\d\d)/i) || [])[1];
  if (!year) throw new Error('NSDL: year not found');
  const { cols, totalAt } = fpiColumns(t);
  const months = [], checks = [];
  let total = null, upTo = null;
  for (const r of t) {
    const lab = (r[0] || '').trim();
    const mi = MONTHS.indexOf(lab.replace(/\*+/g, '').trim().toLowerCase());
    if (mi >= 0) {
      const o = { m: `${year}-${String(mi + 1).padStart(2, '0')}`, partial: /\*/.test(lab), total: toNum(r[totalAt]) };
      for (const { k, j } of cols) o[k] = toNum(r[j]);
      months.push(o);
    } else if (/^total\s*-\s*20\d\d/i.test(lab)) { total = { total: toNum(r[totalAt]) }; for (const { k, j } of cols) total[k] = toNum(r[j]); }
    const note = r.join(' ').match(/up\s*to\s+(\d{1,2}\s+[A-Za-z]{3,}\s+20\d\d)/i); if (note) upTo = note[1];
  }
  const rowBad = months.filter((o) => { const s = cols.reduce((a, { k }) => a + (o[k] || 0), 0); return o.total != null && Math.abs(s - o.total) > 8; }).map((o) => o.m);
  checks.push({ id: 'fpi-rows', ok: months.length > 0 && !rowBad.length, detail: rowBad.length ? 'components ≠ total in ' + rowBad.join(', ') : `asset classes add up to the total in all ${months.length} months` });
  if (total) { const s = months.reduce((a, o) => a + (o.equity || 0), 0); checks.push({ id: 'fpi-year', ok: Math.abs(s - total.equity) <= 2 * months.length, detail: `equity by month sums to ${s.toLocaleString('en-IN')} vs the year total ${total.equity?.toLocaleString('en-IN')}` }); }
  return { year, months, total, upTo, checks };
}
export function parseNsdlFy(html) {
  const t = best(htmlTables(html).map(grid).filter((g) => g.some((r) => r.some((c) => /Financial Year/i.test(c))) && g.some((r) => r.some((c) => /^debt-general limit$/i.test(String(c).trim())))));
  if (!t) throw new Error('NSDL: financial-year table not found');
  const { cols, totalAt } = fpiColumns(t), out = [];
  for (const r of t) {
    const m = (r[0] || '').match(/^(\d{4})-(\d{2})/); if (!m) continue;
    const o = { fy: `${m[1]}-${m[2]}`, partial: /\*/.test(r[0]), total: toNum(r[totalAt]) };
    for (const { k, j } of cols) o[k] = toNum(r[j]);
    out.push(o);
  }
  return out;
}
// ASP.NET postback fields for choosing another year on NSDL's page.
export function aspForm(html) {
  const f = {};
  for (const m of String(html).matchAll(/<input[^>]*type=["']hidden["'][^>]*>/gi)) {
    const name = m[0].match(/name=["']([^"']+)/i)?.[1], value = m[0].match(/value=["']([^"']*)/i)?.[1] ?? '';
    if (name) f[name] = value.replace(/&amp;/g, '&').replace(/&#43;/g, '+').replace(/&#47;/g, '/').replace(/&quot;/g, '"');
  }
  return f;
}

/* ---------------- SEBI: mutual fund trading on exchanges (this month, daily) ---------------- */
export function parseSebiTrade(html) {
  const asOf = (textOf(String(html).match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').match(/as on\s+(\d{1,2}\s+[A-Za-z]{3},?\s+20\d\d)/i) || textOf(html).match(/as on\s+(\d{1,2}\s+[A-Za-z]{3},?\s+20\d\d)/i) || [])[1] || null;
  // The page has two tables headed "Trading Date": shares (Equity/Debt rows) and derivatives (more rows). Take the shares one.
  const t = best(htmlTables(html).map(grid).filter((g) => g.some((r) => /trading date/i.test(r[0] || '')) && g.some((r) => /^(equity|debt)$/i.test((r[1] || '').trim()))));
  if (!t) throw new Error('SEBI trading: daily table not found');
  const day = (s) => { const m = String(s).trim().match(/^(\d{1,2}) ([A-Za-z]{3}),? (20\d\d)$/); if (!m) return null; const i = MON3.indexOf(m[2].toLowerCase()); return i < 0 ? null : `${m[3]}-${String(i + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`; };
  const days = new Map(); let total = null;
  for (const r of t) {
    const d = day(r[0]), isTot = /^total$/i.test((r[0] || '').trim());
    const typ = (r[1] || '').trim().toLowerCase(), b = toNum(r[2]), s = toNum(r[3]), n = toNum(r[4]);
    if (!['equity', 'debt'].includes(typ) || n == null) continue;
    const o = isTot ? (total ||= {}) : d ? (days.get(d) || days.set(d, { d }).get(d)) : null;
    if (!o) continue;
    if (typ === 'equity') Object.assign(o, { eqBuy: b, eqSell: s, eqNet: n }); else Object.assign(o, { dBuy: b, dSell: s, dNet: n });
  }
  const list = [...days.values()].sort((a, b) => (a.d < b.d ? -1 : 1));
  if (!list.length) throw new Error('SEBI trading: no daily rows');
  const month = list[0].d.slice(0, 7), sum = list.reduce((a, x) => a + (x.eqNet || 0), 0);
  const rowBad = list.filter((x) => (x.eqBuy != null && Math.abs(x.eqBuy - x.eqSell - x.eqNet) > 0.02) || (x.dBuy != null && Math.abs(x.dBuy - x.dSell - x.dNet) > 0.02)).map((x) => x.d);
  const checks = [{ id: 'trade-sum', ok: !!total && Math.abs(sum - total.eqNet) <= 0.5 + list.length * 0.01, detail: total ? `daily equity net adds to ${r2(sum)} vs month total ${total.eqNet}` : 'no total row' },
    { id: 'trade-rows', ok: !rowBad.length, detail: rowBad.length ? `purchases − sales ≠ net on ${rowBad.slice(0, 3).join(', ')}` : `purchases − sales = net on all ${list.length} days` },
    { id: 'trade-month', ok: list.every((x) => x.d.slice(0, 7) === month), detail: `all trading dates fall in ${month}` }];
  const asOfIso = asOf ? day(asOf.replace(',', '').replace(/(\d+) (\w+) (\d+)/, '$1 $2, $3')) : list[list.length - 1].d;
  return { month, asOf: asOfIso, days: list, total: total || null, checks };
}

export { BY_KEY };

/* ---------------- AMFI SIP statistics page (amfiindia.com/mutual-fund) ---------------- */
// Two tables: SIP inflows by month for every financial year since 2016-17 (₹ crore), and this financial year's SIP
// accounts (outstanding, new, discontinued or matured, contributing; in lakh) with SIP AUM (₹ crore). AMFI states the
// latest month's total in the page title too, so the three must agree before anything is used.
const monIdx = (s) => MON3.indexOf(String(s || '').trim().slice(0, 3).toLowerCase());
const ymOf = (y, mi) => `${y}-${String(mi + 1).padStart(2, '0')}`;
const fyOf = (m) => (+m.slice(5, 7) >= 4 ? +m.slice(0, 4) : +m.slice(0, 4) - 1); // financial year by its starting year
export function parseAmfiSip(html) {
  const title = textOf((String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const tabs = htmlTables(html).map(grid);
  const isFy = (c) => /^FY\s*20\d\d\s*-\s*\d\d$/i.test(String(c || '').trim());
  const hist = tabs.find((g) => g.some((r) => r.filter(isFy).length >= 3));
  const det = tabs.find((g) => g.some((r) => /outstanding/i.test(r.join(' ')) && /new\s*sips?/i.test(r.join(' '))));
  if (!hist || !det) throw new Error('AMFI SIP page: tables not found');
  // 1) SIP inflows by month, one column per financial year
  const fyCol = hist.find((r) => r.filter(isFy).length >= 3).map((c) => (isFy(c) ? +String(c).match(/20\d\d/)[0] : null));
  const history = {}, fyTotal = {};
  for (const r of hist) {
    const lab = String(r[0] || '').trim();
    if (/^total/i.test(lab)) { fyCol.forEach((y, j) => { const v = toNum(r[j]); if (y && v != null) fyTotal[y] = v; }); continue; }
    const mi = monIdx(lab);
    if (mi < 0 || !/^[A-Za-z]{3,9}$/.test(lab)) continue;
    fyCol.forEach((y, j) => { const v = toNum(r[j]); if (y && v != null && v > 0) history[ymOf(mi >= 3 ? y : y + 1, mi)] = v; });
  }
  // 2) SIP accounts and SIP AUM, this financial year by month plus year totals
  const hdr = det.find((r) => r.some((c) => /outstanding/i.test(c || '')));
  const col = {};
  hdr.forEach((c, j) => {
    const t = String(c || '');
    if (/outstanding/i.test(t)) col.outstanding = j; else if (/new\s*sips?/i.test(t)) col.newReg = j; else if (/discontinued|tenure/i.test(t)) col.disc = j;
    else if (/contributing/i.test(t)) col.contributing = j; else if (/contribution/i.test(t)) col.amount = j; else if (/\baum\b/i.test(t)) col.aum = j;
  });
  for (const k of ['outstanding', 'newReg', 'disc', 'contributing', 'amount', 'aum']) if (col[k] == null) throw new Error('AMFI SIP page: column not found: ' + k);
  const details = {}, ranges = [];
  for (const r of det) {
    const lab = String(r[0] || '').replace(/\s+/g, ' ').trim();
    const rec = Object.fromEntries(Object.entries(col).map(([k, j]) => [k, toNum(r[j])]));
    let m = lab.match(/^([A-Za-z]{3,9})\.?\s*[-–]\s*(\d{2})$/);
    if (m && monIdx(m[1]) >= 0) { details[ymOf(2000 + +m[2], monIdx(m[1]))] = rec; continue; }
    m = lab.match(/^([A-Za-z]{3,9})\.?\s*(\d{2})\s*[-–]\s*([A-Za-z]{3,9})\.?\s*(\d{2})$/);
    if (m && monIdx(m[1]) >= 0 && monIdx(m[3]) >= 0) ranges.push({ from: ymOf(2000 + +m[2], monIdx(m[1])), to: ymOf(2000 + +m[4], monIdx(m[3])), ...rec });
  }
  // 3) Checks
  const months = Object.keys(history).sort(), latest = months[months.length - 1] || null;
  // What the page says in words (title and paragraphs, outside the tables), e.g. "collected through SIP during October 2026 was ₹ 32,160 crore".
  const prose = [title, ...textOf(String(html).replace(/<head[\s\S]*?<\/head>/i, ' ').replace(/<table[\s\S]*?<\/table>/gi, ' . ')).split(/(?<=[.|])\s+/)];
  const stated = prose.filter((t) => /\bSIP\b/i.test(t)).map((t) => ({ period: periodFrom(t), amount: toNum((t.match(/₹\s*([\d,]+(?:\.\d+)?)\s*crore/i) || [])[1]) })).filter((x) => x.period && x.amount != null);
  const checks = [], add = (id, ok, detail, extra) => checks.push({ id, ok: !!ok, detail, ...extra });
  const dl = latest ? details[latest] : null, amt = latest ? history[latest] : null;
  const said = stated.filter((x) => x.period === latest), ahead = stated.filter((x) => x.period > (latest || ''));
  const tablesAgree = !!dl && close(dl.amount, amt, 0.5), textAgrees = said.length > 0 && said.every((x) => close(x.amount, amt, 0.5));
  // The latest total must be stated twice (the month-wise table and either the accounts table or the text), and nothing on the page may contradict it.
  const off = said.find((x) => !close(x.amount, amt, 0.5));
  const why = !latest ? 'no months found. ' : ahead.length ? `the page text names ${ahead[0].period}, later than its tables (${latest}). ` : off ? `the page text says ₹${off.amount} cr for ${latest}, the table ₹${amt} cr. ` : !(tablesAgree || textAgrees) ? 'the month’s total appears only once on the page. ' : '';
  add('sip-latest', !why, `${why}Month-wise table: ${latest || '?'} ₹${amt ?? '?'} cr; accounts table: ${dl ? `₹${dl.amount} cr` : `no ${latest || ''} row`}; page text: ${said.length ? said.map((x) => `₹${x.amount} cr`).join(', ') : 'no statement for that month'}`);
  const prevAmt = latest ? history[addMonths(latest, -1)] : null, nowM = new Date().toISOString().slice(0, 7);
  add('sip-plausible', !!latest && latest < nowM && prevAmt > 0 && Math.abs(amt / prevAmt - 1) < 0.25,
    latest ? `${latest} is before the current month; ₹${amt} cr is ${prevAmt ? `${r2((amt / prevAmt - 1) * 100)}% from the month before` : 'without a previous month'} (more than ±25% would suggest a misread)` : 'no latest month');
  const fyBad = [];
  for (const [y, tot] of Object.entries(fyTotal)) { const s = months.filter((m) => fyOf(m) === +y).reduce((a, m) => a + history[m], 0); if (Math.abs(s - tot) > 2) fyBad.push(`FY ${y}-${String(+y + 1).slice(2)}: months add to ${s}, total says ${tot}`); }
  add('sip-fy-totals', Object.keys(fyTotal).length >= 5 && !fyBad.length, fyBad.length ? fyBad.slice(0, 3).join('; ') : `${Object.keys(fyTotal).length} financial-year totals equal the sum of their months`);
  const fy0 = latest ? ymOf(fyOf(latest), 3) : null, cur = Object.keys(details).filter((m) => fy0 && m >= fy0 && m <= latest).sort();
  const ytd = ranges.find((r) => r.from === fy0 && r.to === latest);
  if (ytd) {
    const s = (k) => cur.reduce((a, m) => a + (details[m][k] || 0), 0);
    const bad = [['newReg', 0.05], ['disc', 0.05], ['amount', 2]].filter(([k, tol]) => !close(s(k), ytd[k], tol)).map(([k]) => `${k}: months add to ${r2(s(k))}, year-to-date row says ${ytd[k]}`);
    for (const k of ['outstanding', 'contributing', 'aum']) if (!close(dl?.[k], ytd[k], k === 'aum' ? 1 : 0.02)) bad.push(`${k}: year-to-date row ${ytd[k]} vs latest month ${dl?.[k]}`);
    add('sip-ytd', !bad.length, bad.length ? bad.join('; ') : `${cur.length} months add up to the year-to-date row`);
  } else if (cur.length === 1 && cur[0] === latest) add('sip-ytd', true, 'first month of the financial year: no year-to-date row needed');
  else add('sip-ytd', false, `no year-to-date row ending ${latest || '?'} in the accounts table`);
  const before = ranges.find((r) => r.to === (fy0 && addMonths(fy0, -1)));
  const rollBad = []; let n = 0;
  for (const m of cur) {
    const p = m === fy0 ? before?.outstanding : details[addMonths(m, -1)]?.outstanding, d = details[m];
    if (p == null || d.newReg == null || d.disc == null) continue;
    n++; const exp = p + d.newReg - d.disc;
    if (!close(exp, d.outstanding, 0.05)) rollBad.push(`${m}: ${r2(p)} + ${d.newReg} − ${d.disc} = ${r2(exp)}, table says ${d.outstanding}`);
  }
  add('sip-rollforward', n > 0 && !rollBad.length, rollBad.length ? rollBad.slice(0, 3).join('; ') : `outstanding SIP accounts roll forward month to month (previous + new − discontinued) for ${n} months`);
  const ok = (ids) => checks.filter((c) => ids.includes(c.id)).every((c) => c.ok);
  return { latest, stated: said, history, fyTotal, details, ranges, checks, gate: ok(['sip-latest', 'sip-fy-totals', 'sip-plausible']), accOk: !!dl && ok(['sip-ytd', 'sip-rollforward']) };
}

/* ---------------- Exchanges: FII/FPI and DII buying and selling in the cash market ---------------- */
// Provisional figures for the latest trading day, compiled by the exchanges across NSE, BSE and MSEI from the client
// category marked on each order. NSE (api/fiidiiTradeReact, ₹ crore as text) and BSE (CategoryTurnover, rupees)
// publish the same combined figures; neither keeps an archive, so the site records each day as it comes.
const istToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const dmy = (s) => { const m = String(s || '').trim().match(/^(\d{1,2})-([A-Za-z]{3})-(20\d\d)$/); if (!m) return null; const i = MON3.indexOf(m[2].toLowerCase()); return i < 0 ? null : `${m[3]}-${String(i + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`; };
function exchDone(o) {
  const checks = [];
  checks.push({ id: 'exch-date', ok: /^20\d\d-\d\d-\d\d$/.test(o.date || '') && o.date === o.date2 && o.date <= istToday(), detail: `both categories dated ${o.date || '?'}${o.date2 && o.date2 !== o.date ? ` and ${o.date2}` : ''}, not after today` });
  for (const k of ['fii', 'dii']) {
    const x = o[k], vals = [x.buy, x.sell, x.net];
    const ok = vals.every((v) => v != null && Number.isFinite(v)) && x.buy >= 0 && x.sell >= 0 && Math.abs(x.buy - x.sell - x.net) <= 0.02 && Math.abs(x.net) < 1e5;
    checks.push({ id: 'exch-' + k, ok, detail: `${k === 'fii' ? 'FII/FPI' : 'DII'}: buy ${x.buy} − sell ${x.sell} = ${r2(x.buy - x.sell)}; published net ${x.net}` });
  }
  const { date2, ...rest } = o;
  return { ...rest, checks, ok: checks.every((c) => c.ok) };
}
export function parseNseFiiDii(json) {
  const rows = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : null;
  if (!rows) throw new Error('NSE FII/DII: unexpected response');
  const f = rows.find((r) => /FII|FPI/i.test(String(r.category || ''))), d = rows.find((r) => /^\s*DII/i.test(String(r.category || '')));
  if (!f || !d) throw new Error('NSE FII/DII: categories not found');
  const v = (r) => ({ buy: toNum(r.buyValue), sell: toNum(r.sellValue), net: toNum(r.netValue) });
  return exchDone({ date: dmy(f.date), date2: dmy(d.date), fii: v(f), dii: v(d), src: 'nse' });
}
export function parseBseFiiDii(json) {
  const r = Array.isArray(json?.Table) ? json.Table.find((x) => /FII/i.test(String(x.CLIENT_TYPE_BSENSE || ''))) || json.Table[0] : null;
  if (!r) throw new Error('BSE FII/DII: unexpected response');
  const cr = (x) => (x == null || x === '' || !Number.isFinite(+x) ? null : Math.round(+x / 1e5) / 100); // rupees → ₹ crore, 2 decimals
  const date = String(r.REPORTING_DATE || '').slice(0, 10);
  return exchDone({ date, date2: date, fii: { buy: cr(r.PURCHASE_BSENSE), sell: cr(r.SALE_BSENSE), net: cr(r.NET_BSENSE) }, dii: { buy: cr(r.PURCHASE_DII), sell: cr(r.SALE_DII), net: cr(r.NET_DII) }, src: 'bse' });
}

/* ---------------- NSDL: FPI investment by reporting date ---------------- */
// "Daily Trends in FPI Investments": for each reporting date, buying and selling by asset class and route (stock
// exchange; primary market and others), sub-totals and the day's total, as custodians report them (final figures).
// The same table is used for this month's page and for the archive (one month per request).
export function parseNsdlDaily(html) {
  const tabs = htmlTables(html).map(grid);
  const t = best(tabs.filter((g) => g.some((r) => /^reporting\s*date$/i.test(String(r[0] || '').trim())) && g.some((r) => /investment route/i.test(r.join(' ')))));
  if (!t) throw new Error('NSDL daily: table not found');
  const head = t.slice(0, 4).flat().join(' ');
  const upTo = dmy((head.match(/(?:\bon|up\s*to)\s+(\d{1,2}-[A-Za-z]{3}-20\d\d)/i) || [])[1]);
  const days = new Map(), rowBad = [];
  for (const r of t) {
    const d = dmy(r[0]); if (!d) continue;
    const cls = String(r[1] || '').trim(), route = String(r[2] || '').trim();
    const b = toNum(r[3]), s = toNum(r[4]), n = toNum(r[5]), usd = toNum(r[6]);
    if (n == null) continue;
    const o = days.get(d) || days.set(d, { d, cls: {}, eq: {} }).get(d);
    if (b != null && s != null && Math.abs(b - s - n) > 0.02) rowBad.push(`${d} ${cls} ${route}`);
    const v = { b, s, n, usd };
    if (/^total$/i.test(route)) o.total = v;
    else if (/^sub-?total$/i.test(route)) o.cls[cls] = v;
    else if (/^equity$/i.test(cls)) o.eq[/stock/i.test(route) ? 'se' : 'pm'] = v;
    const rate = toNum(String(r[7] || '').replace(/^\s*Rs\.?\s*/i, '')); if (rate && rate > 20 && rate < 500) o.rate = rate;
  }
  const list = [...days.values()].sort((a, c) => (a.d < c.d ? -1 : 1));
  if (!list.length) throw new Error('NSDL daily: no reporting dates');
  const routeBad = [], totBad = [];
  const out = list.map((o) => {
    const E = o.cls.Equity || o.cls.equity, se = o.eq.se, pm = o.eq.pm;
    if (!E || !se || !pm || ['b', 's', 'n'].some((k) => Math.abs((se[k] || 0) + (pm[k] || 0) - (E[k] || 0)) > 0.02)) routeBad.push(o.d);
    const classes = Object.values(o.cls), sumN = classes.reduce((a, x) => a + (x.n || 0), 0);
    if (!o.total || Math.abs(sumN - o.total.n) > 0.05 + classes.length * 0.01) totBad.push(o.d);
    const debt = Object.entries(o.cls).filter(([k]) => /^debt/i.test(k)).reduce((a, [, x]) => a + (x.n || 0), 0);
    const pick = (re) => { const e = Object.entries(o.cls).find(([k]) => re.test(k)); return e ? e[1].n : 0; };
    return { d: o.d, eq: E?.n ?? null, eqBuy: E?.b ?? null, eqSell: E?.s ?? null, eqUsd: E?.usd ?? null, eqSE: se?.n ?? null, eqPM: pm?.n ?? null, debt: r2(debt), hybrid: pick(/^hybrid/i), mf: pick(/^mutual/i), aif: pick(/^aif/i), total: o.total?.n ?? null, totalUsd: o.total?.usd ?? null, rate: o.rate || null };
  });
  const checks = [
    { id: 'nsdl-day-rows', ok: !rowBad.length, detail: rowBad.length ? `purchases − sales ≠ net: ${rowBad.slice(0, 3).join('; ')}` : `purchases − sales = net in every row (${out.length} reporting dates)` },
    { id: 'nsdl-day-routes', ok: !routeBad.length, detail: routeBad.length ? `stock exchange + primary market ≠ equity sub-total on ${routeBad.slice(0, 3).join(', ')}` : 'equity: stock exchange + primary market = sub-total on every date' },
    { id: 'nsdl-day-total', ok: !totBad.length, detail: totBad.length ? `asset classes ≠ total on ${totBad.slice(0, 3).join(', ')}` : 'asset classes add up to the day’s total on every date' },
  ];
  return { upTo: upTo || out[out.length - 1].d, days: out, checks, ok: checks.every((c) => c.ok) };
}
