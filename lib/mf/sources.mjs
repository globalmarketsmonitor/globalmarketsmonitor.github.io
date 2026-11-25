// Fetchers for the official mutual fund and flow sources. Each returns parsed data (see parse.mjs) or throws.
// Hosts are fixed: AMFI (www + portal), SEBI, NSDL, NSE and BSE. File links taken from AMFI's index must point at AMFI's portal.
import { get, cookiesFrom } from '../http.mjs';
import { readWorkbook } from './workbook.mjs';
import { parseAmfiSheets, parseSebiMcr, parseSebiListing, parseNsdlYear, parseNsdlFy, parseSebiTrade, aspForm, parseAmfiSip, parseNseFiiDii, parseBseFiiDii, parseNsdlDaily } from './parse.mjs';
import { MON3, norm } from './taxonomy.mjs';

const AMFI = 'https://www.amfiindia.com', PORTAL = 'https://portal.amfiindia.com', SEBI = 'https://www.sebi.gov.in', NSDL = 'https://www.fpi.nsdl.co.in';
const JSONH = { Accept: 'application/json, text/plain, */*' };
const un = (x) => (x && !Array.isArray(x) && typeof x === 'object' && x.data !== undefined ? x.data : x);
async function ok(url, opts, what) {
  const r = await get(url, opts);
  if (!r.ok) throw new Error(`${what}: HTTP ${r.status}`);
  return r;
}
async function okJson(url, ref, what, timeout = 12000) {
  const r = await ok(url, { headers: { ...JSONH, Referer: AMFI + ref }, timeout }, what);
  const t = await r.text();
  try { return un(JSON.parse(t)); } catch { throw new Error(`${what}: not JSON (${t.slice(0, 60).replace(/\s+/g, ' ')}…)`); }
}

/* ---------------- AMFI monthly report ---------------- */
export async function amfiIndex() {
  const j = await okJson(AMFI + '/api/amfi-monthly-data', '/research-information/amfi-monthly', 'AMFI report index');
  const out = [];
  for (const g of (j && j.Monthly) || j || []) for (const p of g.Pages || []) {
    const m = +p.month, y = +p.year;
    if (!m || !y || !/^https:\/\/portal\.amfiindia\.com\/spages\/[\w-]+\.xlsx?$/i.test(p.excel_url || '')) continue;
    out.push({ period: `${y}-${String(m).padStart(2, '0')}`, xls: p.excel_url });
  }
  if (out.length < 12) throw new Error('AMFI report index: only ' + out.length + ' entries');
  return out.sort((a, b) => (a.period < b.period ? 1 : -1));
}
export const amfiXlsUrl = (p) => `${PORTAL}/spages/am${MON3[+p.slice(5) - 1]}${p.slice(0, 4)}repo.xls`;
export async function amfiMonth(period, url = amfiXlsUrl(period)) {
  if (!/^https:\/\/portal\.amfiindia\.com\/spages\//.test(url)) throw new Error('AMFI report: unexpected file host');
  const r = await ok(url, { headers: { Referer: AMFI + '/' }, timeout: 15000 }, 'AMFI report ' + period);
  const buf = new Uint8Array(await r.arrayBuffer());
  const wb = readWorkbook(buf); // .xlsx up to June 2025, legacy .xls after; both under a .xls name
  return { ...parseAmfiSheets(wb.sheets, period), file: wb.format, src: url, bytes: buf.length, fetchedAt: new Date().toISOString() };
}

/* ---------------- AMFI: average AUM by fund house (quarterly) ---------------- */
const FY_START = (s) => +(String(s).match(/(20\d\d)/) || [])[1] || 0;
export const quarterEnd = (label) => { const m = String(label).match(/[-–]\s*([A-Za-z]+)\s+(20\d\d)/); if (!m) return null; const i = MON3.indexOf(m[1].slice(0, 3).toLowerCase()); return i < 0 ? null : `${m[2]}-${String(i + 1).padStart(2, '0')}`; };
export async function amfiFundwise(want = 2) {
  const ref = '/aum-data/average-aum';
  const fys = (await okJson(AMFI + '/api/average-aum-fundwise', ref, 'AMFI average AUM years')) || [];
  // Three rounds of requests instead of up to five in a row: the years, then both latest years' quarters together,
  // then the wanted quarters' tables together.
  const top = [...fys].sort((a, b) => FY_START(b.financial_year) - FY_START(a.financial_year)).slice(0, 2);
  const pers = await Promise.all(top.map(async (f) => ({ f, per: await okJson(`${AMFI}/api/average-aum-fundwise?fyId=${encodeURIComponent(f.id)}`, ref, 'AMFI average AUM periods') })));
  const periods = [];
  for (const { f, per } of pers) for (const p of (per && per.periods) || (Array.isArray(per) ? per : [])) { const end = quarterEnd(p.period); if (end) periods.push({ fyId: f.id, periodId: p.id, label: p.period, end }); }
  periods.sort((a, b) => (a.end < b.end ? 1 : -1));
  const out = await Promise.all(periods.slice(0, want).map(async (p) => {
    const rows = await okJson(`${AMFI}/api/average-aum-fundwise?fyId=${encodeURIComponent(p.fyId)}&periodId=${encodeURIComponent(p.periodId)}`, ref, 'AMFI average AUM');
    const list = (Array.isArray(rows) ? rows : []).map((r) => ({ name: String(r.MutualFundName || '').trim(), aaum: +(r.averageAUM?.average_aum_excluding_domestic_including_overseas ?? NaN) / 100, fof: +(r.averageAUM?.average_aum_fund_of_funds_domestic ?? 0) / 100 }))
      .filter((r) => r.name && Number.isFinite(r.aaum));
    if (list.length < 20) throw new Error(`AMFI average AUM ${p.label}: only ${list.length} fund houses`);
    return { ...p, rows: list, total: list.reduce((s, r) => s + r.aaum, 0) };
  }));
  if (!out.length) throw new Error('AMFI average AUM: no quarterly periods');
  return out;
}
// Same quarter by scheme category (all fund houses), reduced to each fund house's AUM by asset class.
const CLS_RE = [['passive', /index|\betfs?\b|exchange traded/i], ['fof', /fund of funds|\bfof\b/i], ['solution', /solution|retirement|children|life ?cycle/i], ['hybrid', /hybrid|arbitrage|balanced|multi.?asset|equity savings|dynamic asset/i],
  ['equity', /equity|elss|large cap|mid cap|small cap|flexi|multi cap|focused|value|contra|dividend yield|sectoral|thematic/i], ['debt', /debt|income|liquid|overnight|money market|gilt|duration|bond|credit|floater|floating|banking|term fund|fixed/i]];
export const clsOfDesc = (d) => (CLS_RE.find(([, re]) => re.test(d)) || ['other'])[0];
export async function amfiCategorywise(p) {
  const rows = await okJson(`${AMFI}/api/average-aum-schemewise?strType=Categorywise&fyId=${encodeURIComponent(p.fyId)}&periodId=${encodeURIComponent(p.periodId)}&MF_ID=0`, '/aum-data/average-aum', 'AMFI average AUM by category', 25000);
  const by = new Map(), descs = new Set();
  for (const r of Array.isArray(rows) ? rows : []) {
    const name = String(r.Mfname || '').trim(), desc = String(r.SchemeCat_Desc || '').trim(); if (!name) continue;
    if (/^total$/i.test(desc) || /\stotal$/i.test(name)) continue; // each fund house's own total row (value in totalAUM, not in schemes)
    descs.add(desc);
    const sum = (r.schemes || []).reduce((s, x) => s + (+x?.AverageAumForTheMonth?.ExcludingFundOfFundsDomesticButIncludingFundOfFundsOverseas || 0), 0) / 100;
    const o = by.get(name) || by.set(name, { name, total: 0, cls: {} }).get(name);
    const c = clsOfDesc(desc); o.total += sum; o.cls[c] = (o.cls[c] || 0) + sum;
  }
  if (by.size < 20) throw new Error('AMFI average AUM by category: too few fund houses');
  return { end: p.end, label: p.label, amcs: [...by.values()], descs: [...descs].slice(0, 80) };
}

/* ---------------- AMFI: direct-plan assets by channel (monthly) ---------------- */
export async function amfiBifurcation(period) {
  const [y, m] = period.split('-').map(Number), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const strdt = `${String(last).padStart(2, '0')}-${MON3[m - 1][0].toUpperCase()}${MON3[m - 1].slice(1)}-${y}`;
  const d = await okJson(`${AMFI}/api/bifurcationaumdata?strdt=${strdt}`, '/aum-data/bifurcation-of-aum', 'AMFI direct-plan split');
  const r = Array.isArray(d) ? d[0] : d;
  const total = +r?.TotalAAUMunderDirectPlan;
  if (!r || !Number.isFinite(total) || total <= 0) return null; // not published yet
  const o = { m: period, total, ria: +r.AAUMunderRegisteredAdvisers || 0, pms: +r.AAUMunderPMS || 0, diy: +r.AAUMunderDIYclients || 0 };
  o.ok = Math.abs(o.ria + o.pms + o.diy - o.total) <= Math.max(1, o.total * 0.002);
  return o;
}

/* ---------------- AMFI: new fund offers open now ---------------- */
export async function amfiNfoOpen() {
  const d = await okJson(AMFI + '/api/new-fund-offer', '/new-fund-offer', 'AMFI open NFOs');
  const list = [];
  for (const g of (d && d.NewFundOffer) || []) for (const x of g.items || []) if (x.SchemeName) list.push({ amc: String(x.MutualFund || g.MutualFund || '').trim(), name: String(x.SchemeName).trim() });
  return list;
}

/* ---------------- SEBI ---------------- */
export async function sebiListing() {
  const r = await ok(SEBI + '/statistics/mutual-fund/mf-investment-objectives.html', { timeout: 10000 }, 'SEBI table list');
  const l = parseSebiListing(await r.text());
  if (!l.length) throw new Error('SEBI table list: no periods found');
  return l;
}
export async function sebiMcr(path) {
  if (!/^objective\/[a-z0-9-]+\.html$/i.test(path)) throw new Error('SEBI table: unexpected path');
  const r = await ok(`${SEBI}/statistics/mutual-fund/${path}`, { timeout: 15000 }, 'SEBI table ' + path);
  return { ...parseSebiMcr(await r.text()), src: path, fetchedAt: new Date().toISOString() };
}
export async function sebiTrade() {
  const r = await ok(SEBI + '/sebiweb/other/OtherAction.do?doMfd=yes&type=2', { timeout: 15000 }, 'SEBI fund trading');
  return parseSebiTrade(await r.text());
}

/* ---------------- AMFI: SIP statistics page ---------------- */
// SIP inflows by month since April 2016, and this financial year's SIP accounts and SIP AUM, as AMFI publishes them
// with its monthly data. AMFI's home page shows the same figure only as an image; this page has it as text.
export async function amfiSip() {
  const url = AMFI + '/mutual-fund';
  const r = await ok(url, { headers: { Accept: 'text/html,application/xhtml+xml' }, timeout: 15000 }, 'AMFI SIP page');
  return { ...parseAmfiSip(await r.text()), src: url, fetchedAt: new Date().toISOString() };
}

/* ---------------- NSDL: FPI net investment ---------------- */
const NSDL_CY = NSDL + '/web/Reports/Yearwise.aspx?RptType=6', NSDL_FY = NSDL + '/web/Reports/Yearwise.aspx?RptType=5';
// The page shows the current calendar year; other years need the page's own year selector (an ASP.NET post-back).
export async function nsdlYears(years = []) {
  const r0 = await ok(NSDL_CY, { timeout: 15000 }, 'NSDL FPI');
  const html0 = await r0.text(), cookie = cookiesFrom(r0), form = aspForm(html0);
  const cur = parseNsdlYear(html0), out = { [cur.year]: cur };
  for (const y of years) {
    if (out[y]) continue;
    const body = new URLSearchParams({ ...form, __EVENTTARGET: 'ddl', __EVENTARGUMENT: '', ddl: String(y) });
    const r = await ok(NSDL_CY, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: NSDL_CY, Origin: NSDL, ...(cookie ? { Cookie: cookie } : {}) }, timeout: 15000 }, 'NSDL FPI ' + y);
    const p = parseNsdlYear(await r.text());
    if (p.year !== y) throw new Error(`NSDL FPI: asked for ${y}, page shows ${p.year}`);
    out[y] = p;
  }
  return out;
}
export async function nsdlFy() {
  const r = await ok(NSDL_FY, { timeout: 15000 }, 'NSDL FPI financial years');
  return parseNsdlFy(await r.text());
}
// FPI investment by reporting date: this month's page, and any earlier month from NSDL's archive form ("up to" a date).
const NSDL_MONTH = NSDL + '/web/Reports/Monthly.aspx', NSDL_ARCH = NSDL + '/web/Reports/Archive.aspx';
const lastDay = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
export async function nsdlDailyCurrent() {
  const r = await ok(NSDL_MONTH, { timeout: 15000 }, 'NSDL daily');
  return parseNsdlDaily(await r.text());
}
export async function nsdlDailyMonth(m) {
  const r0 = await ok(NSDL_ARCH, { timeout: 12000 }, 'NSDL archive');
  const html0 = await r0.text(), cookie = cookiesFrom(r0), form = aspForm(html0), mon = MON3[+m.slice(5, 7) - 1];
  const txtDate = `${String(lastDay(m)).padStart(2, '0')}-${mon[0].toUpperCase()}${mon.slice(1)}-${m.slice(0, 4)}`;
  const body = new URLSearchParams({ ...form, __EVENTTARGET: 'btnSubmit1', __EVENTARGUMENT: '', txtDate, hdnFlag: '' });
  const r = await ok(NSDL_ARCH, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: NSDL_ARCH, Origin: NSDL, ...(cookie ? { Cookie: cookie } : {}) }, timeout: 20000 }, 'NSDL archive ' + m);
  const p = parseNsdlDaily(await r.text()), off = p.days.find((x) => x.d.slice(0, 7) !== m);
  if (off) throw new Error(`NSDL archive ${m}: reporting date ${off.d} is outside the month`);
  return p;
}

/* ---------------- SEBI: mutual funds' trading, earlier months (archive) ---------------- */
const SEBI_MFD = SEBI + '/sebiweb/other/OtherAction.do';
export async function sebiTradeMonth(m) {
  const r0 = await ok(SEBI_MFD + '?doMfdTrends=yes', { timeout: 12000 }, 'SEBI fund trading archive');
  const html0 = await r0.text(), cookie = cookiesFrom(r0);
  const body = new URLSearchParams({ ...aspForm(html0), date: `${String(lastDay(m)).padStart(2, '0')}-${m.slice(5, 7)}-${m.slice(0, 4)}` });
  const r = await ok(SEBI_MFD + '?doMfdTrendsSearch=yes', { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: SEBI_MFD + '?doMfdTrends=yes', Origin: SEBI, ...(cookie ? { Cookie: cookie } : {}) }, timeout: 15000 }, 'SEBI fund trading ' + m);
  const p = parseSebiTrade(await r.text());
  if (p.month !== m) throw new Error(`SEBI fund trading: asked for ${m}, page shows ${p.month}`);
  return p;
}

/* ---------------- Exchanges: FII/FPI and DII, latest trading day (provisional) ---------------- */
// NSE's site now answers on www.nseindia.in (www.nseindia.com redirects there); its API needs the cookies its pages set.
export async function nseFiiDii() {
  const page = await ok('https://www.nseindia.com/reports/fii-dii', { headers: { Accept: 'text/html' }, timeout: 4000 }, 'NSE FII/DII page');
  const origin = new URL(page.url || 'https://www.nseindia.com/').origin, cookie = cookiesFrom(page);
  if (!/^https:\/\/www\.nseindia\.(com|in)$/.test(origin)) throw new Error('NSE FII/DII: unexpected host ' + origin);
  const r = await ok(origin + '/api/fiidiiTradeReact', { headers: { Accept: 'application/json', Referer: origin + '/reports/fii-dii', ...(cookie ? { Cookie: cookie } : {}) }, timeout: 4000 }, 'NSE FII/DII');
  const t = await r.text();
  try { return parseNseFiiDii(JSON.parse(t)); } catch (e) { throw new Error(/JSON/.test(e.message) ? 'NSE FII/DII: not JSON' : e.message); }
}
export async function bseFiiDii() {
  const r = await ok('https://api.bseindia.com/BseIndiaAPI/api/CategoryTurnover/w', { headers: { Accept: 'application/json', Referer: 'https://www.bseindia.com/', Origin: 'https://www.bseindia.com' }, timeout: 5000 }, 'BSE FII/DII');
  const t = await r.text();
  try { return parseBseFiiDii(JSON.parse(t)); } catch (e) { throw new Error(/JSON/.test(e.message) ? 'BSE FII/DII: not JSON' : e.message); }
}

export { norm };
