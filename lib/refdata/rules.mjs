// Recurring events generated from each issuer's own published rule (or a stated convention, marked "estimated").
// Every generated event says which rule it follows, so nothing is presented as more certain than it is.
import { MON, iso, parts, addDays, dow, daysInMonth, nthWeekday, lastWeekday, nextWorkday, prevWorkday, nthWorkday, lastWorkday, fmtDM, isWeekend, nyseHolidays, usFederalHolidays, usTime, CN_TIME, IN_4PM } from './util.mjs';

export const MOSPI_URL = 'https://www.mospi.gov.in/advance-release-calendar';
const R = {
  mospi: ['MoSPI release calendar (fixed dates; next working day if a holiday)', MOSPI_URL],
  oea: ['Office of the Economic Adviser (14th; next working day if a holiday)', 'https://eaindustry.nic.in/'],
  ism: ['ISM rule: 1st and 3rd US business day', 'https://ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/'],
  nse: ['NSE contract rule: last Tuesday (earlier if a holiday)', 'https://www.nseindia.com/resources/exchange-communication-holidays'],
  nyse: ['NYSE holiday rules', 'https://ir.theice.com/press/news-details/2024/NYSE-Group-Announces-2025-2026-and-2027-Holiday-and-Early-Closings-Calendar/default.aspx'],
  bls: ['BLS rule: third Friday after the week containing the 12th', 'https://www.bls.gov/schedule/news_release/empsit.htm'],
  lpr: ['PBoC rule: 20th of each month (next working day if a holiday)', null],
  nbs: ['NBS practice: last day of the month', 'https://www.stats.gov.cn/english/PressRelease/ReleaseCalendar/'],
  conv: ['Convention', null],
  quad: ['Exchange rule: third Friday of March, June, September and December', null],
  msci: ['MSCI index review dates (announced 11 Nov 2026)', 'https://www.msci.com/eqb/pressreleases/archive/ir_dates.pdf'],
  amfi: ['AMFI announces no release date; its monthly report usually appears in the second week', 'https://www.amfiindia.com/research-information/amfi-monthly'],
};
const ev = (date, country, cat, imp, k, title, o = {}) => ({ date, country, cat, imp, k, title, time: o.t || '', detail: o.d || '', status: o.s || 'scheduled', src: (o.src || R.conv)[0], url: (o.src || R.conv)[1], ind: o.ind || null, via: 'rule' });
const prevMon = (m) => MON[(m + 11) % 12];
const shiftNote = (nominal, actual) => (nominal === actual ? '' : `Calendar date ${fmtDM(nominal)} is a ${isWeekend(nominal) ? (dow(nominal) === 6 ? 'Saturday' : 'Sunday') : 'holiday'}, so it moves to ${fmtDM(actual)}.`);
function* months(from, to) { let { y, m } = parts(from); const e = parts(to); while (y < e.y || (y === e.y && m <= e.m)) { yield [y, m]; m++; if (m > 11) { m = 0; y++; } } }

// Official MSCI review dates (published two years ahead): announcement and effective date.
export const MSCI_REVIEWS = [
  ['2026-11-11', '2026-12-01', 'November'], ['2027-02-09', '2027-03-01', 'February'], ['2027-05-10', '2027-05-28', 'May'], ['2027-08-12', '2027-09-01', 'August'],
  ['2027-11-11', '2027-12-01', 'November'], ['2028-02-10', '2028-03-01', 'February'], ['2028-05-11', '2028-06-01', 'May'], ['2028-08-14', '2028-09-01', 'August'], ['2028-11-13', '2028-12-01', 'November'],
];

export function ruleEvents(from, to, ctx = {}) {
  const inHol = ctx.inHolidays || new Set(), foHol = ctx.foHolidays || new Set(), nseYears = ctx.nseYears || new Set();
  const out = [];
  const usHol = (y) => new Set([...usFederalHolidays(y).keys()]);
  for (const [y, m] of months(from, to)) {
    // India (MoSPI and OEA): CPI 12th, WPI 14th, PLFS 15th, IIP 28th; next working day if the date is a holiday.
    const cpiN = iso(y, m, 12), cpi = nextWorkday(cpiN, inHol);
    out.push(ev(cpi, 'IN', 'data', 3, 'in-cpi', `India CPI inflation (${prevMon(m)})`, { t: IN_4PM, src: R.mospi, ind: 'cpi_IN', d: shiftNote(cpiN, cpi) }));
    const wpiN = iso(y, m, 14), wpi = nextWorkday(wpiN, inHol);
    out.push(ev(wpi, 'IN', 'data', 1, 'in-wpi', `India WPI inflation (${prevMon(m)})`, { src: R.oea, d: shiftNote(wpiN, wpi) }));
    const plN = iso(y, m, 15), pl = nextWorkday(plN, inHol);
    out.push(ev(pl, 'IN', 'data', 1, 'in-plfs', `India jobs: PLFS monthly bulletin (${prevMon(m)})`, { src: R.mospi, d: shiftNote(plN, pl) }));
    const iipN = iso(y, m, 28), iip = nextWorkday(iipN, inHol);
    out.push(ev(iip, 'IN', 'data', 2, 'in-iip', `India industrial production, IIP (${prevMon(m)})`, { t: IN_4PM, src: R.mospi, d: shiftNote(iipN, iip) }));
    out.push(ev(iso(y, m, 1), 'IN', 'fiscal', 1, 'in-gst', `India GST collections (${prevMon(m)})`, { s: 'estimated', d: 'Published on the 1st, weekends included.' }));
    // India mutual fund flows: AMFI's report on the previous month, shown on the 10th (next working day if a holiday).
    const amN = iso(y, m, 10), am = nextWorkday(amN, inHol);
    out.push(ev(am, 'IN', 'data', 2, 'in-amfi', `India mutual fund flows: AMFI monthly data (${prevMon(m)})`, { s: 'estimated', src: R.amfi, d: 'Net inflows by fund category, AUM, investor folios and new fund offers. The Mutual funds tab picks the report up within the hour of publication.' }));
    // India GDP: last working day of Feb, May, Aug and Nov; first advance estimate on 7 January.
    const fy = (yy) => `FY${String(yy).slice(2)}`;
    if (m === 10) out.push(ev(lastWorkday(y, m, inHol), 'IN', 'data', 3, 'in-gdp', `India GDP, Q2 ${fy(y + 1)} (Jul–Sep)`, { src: R.mospi }));
    if (m === 1) out.push(ev(lastWorkday(y, m, inHol), 'IN', 'data', 3, 'in-gdp', `India GDP Q3 ${fy(y)} + second advance estimate`, { src: R.mospi }));
    if (m === 4) out.push(ev(lastWorkday(y, m, inHol), 'IN', 'data', 3, 'in-gdp', `India GDP Q4 ${fy(y)} + provisional estimate for ${fy(y)}`, { src: R.mospi }));
    if (m === 7) out.push(ev(lastWorkday(y, m, inHol), 'IN', 'data', 3, 'in-gdp', `India GDP, Q1 ${fy(y + 1)} (Apr–Jun)`, { src: R.mospi }));
    if (m === 0) out.push(ev(nextWorkday(iso(y, 0, 7), inHol), 'IN', 'data', 2, 'in-gdp', `India GDP: first advance estimate, ${fy(y)}`, { src: R.mospi, d: 'The full-year growth estimate the Union Budget is built on.' }));
    // Nifty monthly F&O expiry: last Tuesday, earlier if that is a holiday.
    const lt = lastWeekday(y, m, 2), fno = prevWorkday(lt, foHol);
    out.push(ev(fno, 'IN', 'markets', 1, 'fno', 'Nifty monthly F&O expiry', { s: nseYears.has(y) ? 'scheduled' : 'estimated', src: R.nse, d: fno !== lt ? `The last Tuesday, ${fmtDM(lt)}, is a holiday, so expiry moves to ${fmtDM(fno)}.` : '' }));
    // China: LPR on the 20th; NBS PMIs on the last day of the month.
    const lprN = iso(y, m, 20), lpr = nextWorkday(lprN);
    out.push(ev(lpr, 'CN', 'cb', 1, 'cn-lpr', 'China loan prime rates (LPR)', { s: 'estimated', src: R.lpr, d: lpr !== lprN ? `The 20th falls on a ${dow(lprN) === 6 ? 'Saturday' : 'Sunday'}.` : 'A cut signals more stimulus, good for metals and EM.' }));
    out.push(ev(iso(y, m, daysInMonth(y, m)), 'CN', 'data', 2, 'cn-pmi', `China official PMIs (${MON[m]})`, { t: CN_TIME, s: 'estimated', src: R.nbs, d: 'Above 50 = expansion.' }));
    // US: ISM on the 1st and 3rd business day; quarterly options expiry; jobs report by the BLS rule.
    const uh = usHol(y);
    const im = nthWorkday(y, m, 1, uh), is = nthWorkday(y, m, 3, uh);
    out.push(ev(im, 'US', 'data', 2, 'ism-m', `ISM manufacturing PMI (${prevMon(m)})`, { t: usTime(im, '10:00'), src: R.ism }));
    out.push(ev(is, 'US', 'data', 1, 'ism-s', `ISM services PMI (${prevMon(m)})`, { t: usTime(is, '10:00'), src: R.ism }));
    if (m % 3 === 2) { const q = nthWeekday(y, m, 5, 3); out.push(ev(q, 'US', 'markets', 1, 'quad', 'US quarterly options and futures expiry ("quad witching")', { src: R.quad, d: 'Third Friday of the quarter-end month; heavy volume, index rebalancing.' })); }
    { // Employment Situation for month m-1: third Friday after the week (Sun–Sat) containing the 12th; a week later if that Friday is a holiday.
      const ry = m === 0 ? y - 1 : y, rm = (m + 11) % 12, d12 = iso(ry, rm, 12), sat = addDays(d12, 6 - dow(d12));
      let fri = addDays(sat, 6 + 14); if (usHol(parts(fri).y).has(fri)) fri = addDays(fri, 7);
      out.push(ev(fri, 'US', 'data', 3, 'us-jobs', `US jobs report — non-farm payrolls (${MON[rm]})`, { t: usTime(fri, '08:30'), s: 'estimated', src: R.bls, d: 'Payrolls, unemployment rate and wage growth.' }));
    }
    // India fiscal calendar: Union Budget on 1 February by convention; financial year ends 31 March.
    if (m === 1) out.push(ev(iso(y, 1, 1), 'IN', 'fiscal', 3, 'budget', `Union Budget FY${String(y + 1).slice(2)}`, { s: 'estimated', d: 'Presented on 1 Feb by convention; confirmed when Parliament’s budget session is notified. Fiscal deficit, borrowing, capex, capital gains tax.' }));
    if (m === 2) out.push(ev(iso(y, 2, 31), 'IN', 'fiscal', 1, 'fy-end', `India fiscal year-end (FY${String(y).slice(2)})`, { d: 'Advance tax, fiscal deficit outturn and year-end liquidity tightness.' }));
    // Results seasons (convention): India from the Monday on or after the 9th, US banks from the Tuesday on or after the 12th of Jan/Apr/Jul/Oct.
    if (m % 3 === 0) {
      const qi = { 0: [3, y], 3: [4, y], 6: [1, y + 1], 9: [2, y + 1] }[m];
      const d9 = iso(y, m, 9), mon = addDays(d9, (8 - dow(d9)) % 7), d12 = iso(y, m, 12), tue = addDays(d12, (9 - dow(d12)) % 7);
      out.push(ev(mon, 'IN', 'earnings', 2, 'res-in', `India Q${qi[0]} FY${String(qi[1]).slice(2)} results season begins (IT services usually first)`, { s: 'estimated', d: 'Watch guidance from IT services and private banks.' }));
      out.push(ev(tue, 'US', 'earnings', 2, 'res-us', `US Q${(m / 3 + 3) % 4 + 1} earnings season begins (large banks first)`, { s: 'estimated', d: 'Net interest income, credit costs and buyback plans.' }));
    }
  }
  // US market holidays (NYSE rules).
  for (let y = parts(from).y; y <= parts(to).y; y++) for (const [d, name] of nyseHolidays(y)) {
    out.push(ev(d, 'US', 'holiday', 1, 'us-hol', `US markets closed (${name})${name === 'Thanksgiving' ? `; early close ${fmtDM(addDays(d, 1))}` : ''}`, { src: R.nyse }));
  }
  // MSCI reviews: announcement, and the rebalance at the close of the last trading day before the effective date.
  for (const [ann, eff, name] of MSCI_REVIEWS) {
    out.push(ev(ann, 'GL', 'markets', 2, 'msci-ann', `MSCI ${name} index review announced`, { s: 'official', src: R.msci, d: `Changes take effect ${fmtDM(eff)}. Drives passive FPI flows into India.` }));
    const close = prevWorkday(addDays(eff, -1), inHol);
    out.push(ev(close, 'GL', 'markets', 2, 'msci-reb', `MSCI ${name} review: rebalance at the close`, { s: 'official', src: R.msci, d: `Changes take effect ${fmtDM(eff)}, so index funds trade at the close of the prior trading day.` }));
  }
  return out.filter((e) => e.date >= from && e.date <= to);
}
