// Fetchers for reference data, each reading an official source (or an issuer's own API) and validating what it parses.
// A fetcher throws when the page cannot be read or no longer looks as expected; the engine then keeps the last good copy.
import { nseFetch } from '../sources.mjs';
import { MONTHS, monthIndex, iso, parts, addDays, strip, decode, fetchText, fetchJSON, today } from './util.mjs';

// Sanity check: enough well-formed dates, and enough of them in a plausible window (last year to three years ahead).
const plausible = (dates, min) => {
  const lo = addDays(today(), -400), hi = addDays(today(), 1200);
  if (dates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d)) || dates.filter((d) => d >= lo && d <= hi).length < min) throw new Error('page no longer parses as expected');
};

/* ---------- Federal Reserve: FOMC calendar ---------- */
export const FED_URL = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
export async function fed() {
  const html = await fetchText(FED_URL, { timeout: 9000 });
  const meetings = [];
  for (const panel of html.split(/<div class="panel panel-default">/).slice(1)) {
    const y = +(panel.match(/(\d{4}) FOMC Meetings/) || [])[1]; if (!y) continue;
    for (const row of panel.split(/<div class="[^"]*row fomc-meeting[^"]*"/).slice(1)) {
      const mon = strip((row.match(/fomc-meeting__month[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '');
      const dt = strip((row.match(/fomc-meeting__date[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '');
      if (!mon || !dt || /notation|unscheduled|conference call/i.test(dt)) continue;
      const days = dt.match(/\d+/g); if (!days) continue;
      const months = mon.split('/').map(monthIndex).filter((m) => m >= 0); if (!months.length) continue;
      const endM = months.at(-1), startM = months[0], d1 = +days[0], d2 = +(days[1] || days[0]);
      meetings.push({ start: iso(y, startM, d1), date: iso(y, endM, d2), sep: /\*/.test(dt), strategy: /strategy meeting/i.test(strip(row)) });
    }
  }
  // A note under the latest year announces the first meeting of the following year.
  for (const m of html.matchAll(/two-day meeting is scheduled for (\w+) (\d+)-(\d+), (\d{4})/gi)) {
    const mi = monthIndex(m[1]); if (mi >= 0) meetings.push({ start: iso(+m[4], mi, +m[2]), date: iso(+m[4], mi, +m[3]), sep: false, strategy: false, note: true });
  }
  const uniq = [...new Map(meetings.map((x) => [x.date, x])).values()].sort((a, b) => a.date.localeCompare(b.date));
  plausible(uniq.map((x) => x.date), 8);
  return { url: FED_URL, meetings: uniq };
}

/* ---------- ECB: Governing Council meeting calendar ---------- */
export const ECB_URL = 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html';
export async function ecb() {
  const html = await fetchText(ECB_URL, { timeout: 9000 });
  const out = [];
  for (const m of html.matchAll(/<dt>\s*(\d{2})\/(\d{2})\/(\d{4})\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)) {
    const txt = strip(m[4]);
    if (/monetary policy meeting/i.test(txt) && !/non-monetary/i.test(txt) && /Day 2/i.test(txt)) out.push({ date: iso(+m[3], +m[2] - 1, +m[1]), press: /press conference/i.test(txt) });
  }
  plausible(out.map((x) => x.date), 4);
  return { url: ECB_URL, meetings: out };
}

/* ---------- Bank of England: MPC dates ---------- */
export const BOE_URL = 'https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates';
export async function boe() {
  const text = strip(await fetchText(BOE_URL, { timeout: 9000 }));
  const out = [];
  const blocks = text.split(/(?=\b20\d\d (?:confirmed|provisional) dates\b)/);
  for (const b of blocks) {
    const y = +(b.match(/^(20\d\d) (?:confirmed|provisional) dates/) || [])[1]; if (!y) continue;
    const provisional = /^20\d\d provisional/.test(b);
    for (const m of b.matchAll(/\b(Monday|Tuesday|Wednesday|Thursday|Friday) (\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December)\b([^]*?)(?=\b(?:Monday|Tuesday|Wednesday|Thursday|Friday) \d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December)\b|Current Bank Rate|Monetary Policy Committee voting|$)/g)) {
      out.push({ date: iso(y, MONTHS.indexOf(m[3]), +m[2]), mpr: /Monetary Policy Report/i.test(m[4]), provisional });
    }
  }
  const uniq = [...new Map(out.map((x) => [x.date, x])).values()].sort((a, b) => a.date.localeCompare(b.date));
  plausible(uniq.map((x) => x.date), 6);
  return { url: BOE_URL, meetings: uniq };
}

/* ---------- Bank of Japan: MPM schedule ---------- */
export const BOJ_URL = 'https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm';
export async function boj() {
  const html = await fetchText(BOJ_URL, { timeout: 9000 });
  const out = [];
  for (const sec of html.split(/<h2 id="p(?=\d{4}")/).slice(1)) {
    const y = +sec.slice(0, 4);
    const table = (sec.match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || '';
    for (const tr of table.split(/<tr>/).slice(1)) {
      const tds = [...tr.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((x) => strip(x[1]));
      if (!tds.length) continue;
      // "Dec. 17 (Thurs.), 18 (Fri.)" or "Apr. 30 (Thu.), May 1 (Fri.)": the decision is on the last day.
      const ds = [...tds[0].matchAll(/(?:([A-Z][a-z]{2,4})\.?\s+)?(\d{1,2})\s*\(/g)];
      if (!ds.length) continue;
      let mi = -1; const dates = ds.map((x) => { if (x[1]) mi = monthIndex(x[1]); return mi >= 0 ? iso(y, mi, +x[2]) : null; }).filter(Boolean);
      if (!dates.length) continue;
      out.push({ start: dates[0], date: dates.at(-1), outlook: !!tds[1] && tds[1] !== '-' });
    }
  }
  plausible(out.map((x) => x.date), 6);
  return { url: BOJ_URL, meetings: out };
}

/* ---------- RBI: MPC schedule (press release; next year's found via the RBI press-release feed) ---------- */
export const RBI_FEED = 'https://www.rbi.org.in/pressreleases_rss.xml';
export const RBI_KNOWN = ['https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=62422']; // 2026-27 schedule
export async function rbiFeed() {
  const xml = await fetchText(RBI_FEED, { timeout: 8000, headers: { Accept: '*/*' } });
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const g = (t) => decode(((m[1].match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '')).trim();
    return { title: strip(g('title')), url: g('link'), date: g('pubDate') ? new Date(g('pubDate')).toISOString().slice(0, 10) : null, src: 'RBI' };
  });
}
export async function rbi(knownUrls = []) {
  const urls = new Set([...RBI_KNOWN, ...knownUrls]);
  try { for (const it of await rbiFeed()) if (/meeting schedule of the monetary policy committee/i.test(it.title) && it.url) urls.add(it.url); } catch { /* feed is only for discovery */ }
  const meetings = [];
  for (const url of urls) {
    const text = strip(await fetchText(url, { timeout: 9000 }));
    if (!/Monetary Policy Committee/i.test(text)) continue;
    for (const m of text.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December) ((?:\d{1,2}(?:,| and)\s*)+\d{1,2}), (\d{4})\b/g)) {
      const days = m[2].match(/\d{1,2}/g).map(Number); if (days.length < 2) continue;
      meetings.push({ start: iso(+m[3], MONTHS.indexOf(m[1]), days[0]), date: iso(+m[3], MONTHS.indexOf(m[1]), days.at(-1)), url });
    }
  }
  const uniq = [...new Map(meetings.map((x) => [x.date, x])).values()].sort((a, b) => a.date.localeCompare(b.date));
  plausible(uniq.map((x) => x.date), 6);
  return { urls: [...urls], meetings: uniq };
}

/* ---------- BEA: release schedule (official calendar feed) ---------- */
export const BEA_ICS = 'https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics';
export async function bea() {
  const ics = (await fetchText(BEA_ICS, { timeout: 9000 })).replace(/\r?\n[ \t]/g, '');
  const out = [];
  for (const ev of ics.split('BEGIN:VEVENT').slice(1)) {
    const d = (ev.match(/DTSTART[^:]*:(\d{8})/) || [])[1], sum = decode((ev.match(/SUMMARY[^:]*:(.*)/) || [])[1] || '').replace(/\\,/g, ',').replace(/\\;/g, ';').trim();
    if (!d || !sum) continue;
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    let m;
    if ((m = sum.match(/^GDP \((Advance|Second|Third) Estimate\).*?(\d)(?:st|nd|rd|th) Quarter(?: and Year)? (\d{4})/i))) out.push({ date, type: 'gdp', est: m[1].toLowerCase(), q: +m[2], y: +m[3] });
    else if ((m = sum.match(/^Personal Income and Outlays, (\w+) (\d{4})/i))) out.push({ date, type: 'pce', m: MONTHS.indexOf(m[1]), y: +m[2] });
  }
  plausible(out.map((x) => x.date), 6);
  return { url: 'https://www.bea.gov/news/schedule', releases: out };
}

/* ---------- Census: advance retail sales schedule ---------- */
export const CENSUS_URL = 'https://www.census.gov/retail/release_schedule.html';
export async function census() {
  const text = strip(await fetchText(CENSUS_URL, { timeout: 9000 }));
  const seg = (text.split(/Advance Monthly Retail Trade Report/i)[1] || '').split(/Historical Release Dates|Monthly Retail Trade Report/i)[0];
  const out = [];
  for (const m of seg.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})/g)) {
    out.push({ date: iso(+m[5], MONTHS.indexOf(m[3]), +m[4]), m: MONTHS.indexOf(m[1]), y: +m[2] });
  }
  plausible(out.map((x) => x.date), 6);
  return { url: CENSUS_URL, releases: out };
}

/* ---------- FRED (St. Louis Fed) release calendar: BLS CPI, jobs and PPI dates. Needs FRED_API_KEY. ---------- */
const FRED_RELEASES = { cpi: [10, /consumer price index/i], jobs: [50, /employment situation/i], ppi: [46, /producer price index/i] };
export async function fredReleases(key) {
  if (!key) throw new Error('needs FRED_API_KEY');
  const out = {};
  const from = addDays(today(), -60), to = addDays(today(), 420);
  await Promise.all(Object.entries(FRED_RELEASES).map(async ([k, [id, re]]) => {
    const meta = await fetchJSON(`https://api.stlouisfed.org/fred/release?release_id=${id}&api_key=${key}&file_type=json`);
    const name = meta?.releases?.[0]?.name || '';
    if (!re.test(name)) throw new Error(`FRED release ${id} is "${name}", not ${k}`);
    const j = await fetchJSON(`https://api.stlouisfed.org/fred/release/dates?release_id=${id}&api_key=${key}&file_type=json&include_release_dates_with_no_data=true&realtime_start=${from}&realtime_end=9999-12-31&sort_order=asc&limit=1000`);
    out[k] = [...new Set((j.release_dates || []).map((x) => x.date).filter((d) => d >= from && d <= to))];
  }));
  plausible(Object.values(out).flat(), 6);
  return { url: 'https://fred.stlouisfed.org/releases/calendar', releases: out };
}

/* ---------- NSE: trading holidays (equity and F&O segments) ---------- */
export async function nseHolidays() {
  const j = await nseFetch('/api/holiday-master?type=trading');
  const conv = (rows) => (rows || []).map((r) => { const m = String(r.tradingDate).match(/(\d{1,2})-(\w{3})-(\d{4})/); return m ? { date: iso(+m[3], monthIndex(m[2]), +m[1]), name: String(r.description || '').trim() } : null; }).filter(Boolean);
  const cm = conv(j.CM), fo = conv(j.FO);
  plausible(cm.map((x) => x.date), 8);
  return { url: 'https://www.nseindia.com/resources/exchange-communication-holidays', cm, fo };
}

/* ---------- IMF World Economic Outlook: real GDP growth (official IMF data API) ---------- */
export const IMF_CODES = { world: 'G001', dm: 'G110', em: 'G200', US: 'USA', JP: 'JPN', GB: 'GBR', CA: 'CAN', CH: 'CHE', FR: 'FRA', DE: 'DEU', AU: 'AUS', IT: 'ITA', TW: 'TWN', CN: 'CHN', KR: 'KOR', IN: 'IND', BR: 'BRA', ZA: 'ZAF', MX: 'MEX', ID: 'IDN' };
export async function imf() {
  const keys = Object.values(IMF_CODES).join('+');
  const r = await fetchText(`https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO/%2B/${keys}.NGDP_RPCH.A`, { timeout: 12000, headers: { Accept: 'application/vnd.sdmx.data+csv;version=2.0.0' } });
  const lines = r.trim().split(/\r?\n/), head = lines[0].split(',');
  const col = (n) => head.indexOf(n), cC = col('COUNTRY'), cI = col('INDICATOR'), cT = col('TIME_PERIOD'), cV = col('OBS_VALUE'), cU = col('COUNTRY_UPDATE_DATE');
  if ([cC, cI, cT, cV].some((x) => x < 0)) throw new Error('IMF CSV layout changed');
  const series = {}; let updated = '';
  for (const l of lines.slice(1)) {
    const f = l.split(','); if (f[cI] !== 'NGDP_RPCH' || !f[cT] || f[cV] === '') continue;
    (series[f[cC]] ||= {})[f[cT]] = +f[cV];
    const u = f[cU]; if (u) { const [mo, d, y] = u.split('/').map(Number); const s = iso(y, mo - 1, d); if (s > updated) updated = s; }
  }
  const n = Object.keys(series).length; if (n < 15) throw new Error(`IMF returned ${n} economies`);
  const { y, m } = parts(updated || today());
  const vintage = `IMF World Economic Outlook, ${m >= 2 && m <= 5 ? 'April' : 'October'} ${y}`;
  return { url: 'https://data.imf.org/', updated, vintage, series };
}

/* ---------- Siblis Research: trailing P/E (free API: quarter-end snapshots; key: daily, full universe) ---------- */
export const SIBLIS_FREE = { 'Global (All-country)': 'ACWI', 'Developed markets': 'WORLD', 'Emerging markets': 'EMER', 'United States': 'USA', Japan: 'N225', Canada: 'CAN', Germany: 'DAX', France: 'CAC', 'United Kingdom': 'UKX', India: 'NIFTY', China: 'SSE', Brazil: 'IBOV', 'South Korea': 'KOSPI' };
const SIBLIS_MATCH = { Italy: /FTSE MIB|Italy/i, Australia: /Australia/i, Taiwan: /TWSE|Taiwan/i, Mexico: /Mexic|IPC/i, 'South Africa': /South Africa|JSE/i, Indonesia: /Indonesia|Jakarta/i, Switzerland: /Swiss|SMI|Switzerland/i };
export async function siblis(key) {
  const base = key ? 'https://siblisresearch.supabase.co/functions/v1/data-api/v1' : 'https://siblisresearch.com/api/v1';
  const headers = key ? { 'x-api-key': key } : {};
  const tickers = { ...SIBLIS_FREE };
  if (key) {
    const idx = await fetchJSON(`${base}/indices`, { headers });
    for (const [mkt, re] of Object.entries(SIBLIS_MATCH)) { const hit = (idx.indices || []).find((x) => re.test(x.index_name)); if (hit) tickers[mkt] = hit.ticker; }
  }
  const from = key ? `?from=${addDays(today(), -2200)}` : '';
  const markets = {};
  await Promise.all(Object.entries(tickers).map(async ([mkt, t]) => {
    try {
      const j = await fetchJSON(`${base}/${t}/pe-trailing${from}`, { headers, timeout: 8000 });
      const rows = (j.data || []).map((r) => [String(r['trading_day (EOD)'] || r.date || '').slice(0, 10), +r.value]).filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(v) && v > 0).sort((a, b) => a[0].localeCompare(b[0]));
      if (!rows.length) return;
      // Year-ends: the last reading in each December (dates such as 31 Dec or the last trading day).
      const ye = {}; for (const [d, v] of rows) if (d.slice(5, 7) === '12') ye[d.slice(0, 4)] = v;
      markets[mkt] = { ticker: t, asOf: rows.at(-1)[0], pe: rows.at(-1)[1], yearEnds: ye };
    } catch { /* one ticker failing leaves the others */ }
  }));
  if (Object.keys(markets).length < (key ? 12 : 8)) throw new Error('Siblis API returned too few markets');
  return { url: 'https://siblisresearch.com/financial-data-api/', tier: key ? 'subscriber' : 'free', markets };
}

/* ---------- Regulator watch: RBI and SEBI items that may change overseas-investment rules or the facts we cite ---------- */
const WATCH = /overseas|outward|foreign (?:securities|investment)|liberali[sz]ed remittance|\bLRS\b|international (?:fund|scheme)|feeder fund|gift city|ifsc|alternative investment fund|commodity derivatives|suspension of trading|\bREITs?\b|tax collected at source/i;
export async function regWatch() {
  const items = [];
  const errs = [];
  try { items.push(...(await rbiFeed())); } catch (e) { errs.push('RBI ' + e.message); }
  for (const [label, url] of [['SEBI press release', 'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=6&ssid=23&smid=0'], ['SEBI circular', 'https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=7&smid=0']]) {
    try {
      const html = await fetchText(url, { timeout: 9000 });
      for (const tr of html.split(/<tr[^>]*>/).slice(2)) {
        const d = strip((tr.match(/<td[^>]*>([\s\S]*?)<\/td>/) || [])[1] || ''), a = tr.match(/href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/);
        const dm = d.match(/(\w{3}) (\d{1,2}), (\d{4})/); if (!dm || !a) continue;
        items.push({ title: strip(a[2]), url: a[1], date: iso(+dm[3], monthIndex(dm[1]), +dm[2]), src: label });
      }
    } catch (e) { errs.push(label + ' ' + e.message); }
  }
  if (!items.length) throw new Error(errs.join('; ') || 'no items');
  return { items: items.filter((x) => WATCH.test(x.title)), scanned: items.length, errors: errs };
}
