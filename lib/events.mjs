// Market-moving events, India and US first. Times shown in local market time and IST.
// status: official  = on the issuer's own published calendar
//         scheduled = published release schedule (via a calendar that tracks the issuer)
//         estimated = follows a fixed rule or convention; not yet confirmed by the issuer
// cat:    cb (central bank) | data | markets | fiscal | earnings | holiday
// imp:    3 = market-moving, 2 = important, 1 = background
// ind:    indicator id from /api/macro whose latest reading is shown beside the event
// Times: US on EST (UTC−5) until 14 Mar 2027, EDT (UTC−4) after; IST = UTC+5:30.
// MoSPI: its calendar lists nominal dates (CPI 12th, IIP 28th, PLFS 15th) and moves releases that
// fall on a holiday or weekend to the next working day (e.g. 12 Sep 2026, a Saturday → 14 Sep).
// Dates below are the expected working day.
// This is the verified seed (fact-checked 16 Nov 2026). The reference-data engine (lib/refdata) keeps the calendar
// current from official sources and issuers' rules; this list is the fallback and supplies hand-written context.

const S = {
  rbi: ['RBI', 'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=62422'],
  fed: ['Federal Reserve', 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'],
  fedmin: ['FedRateCalc (Fed minutes schedule)', 'https://fedratecalc.com/fomc-minutes-release-schedule/'],
  ecb: ['ECB', 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html'],
  boe: ['Bank of England', 'https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates'],
  boj: ['Bank of Japan', 'https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm'],
  mospi: ['MoSPI release calendar', 'https://www.mospi.gov.in/uploads/documents/releaseCalender/1791356248513-ARC_2026_27_Sept_2026.pdf'],
  bls: ['BLS release calendar, Dec 2026', 'https://www.bls.gov/schedule/2026/12_sched_list.htm'],
  bls27: ['BLS 2027 release calendar', 'https://www.bls.gov/schedule/2027/home.htm'],
  bea: ['BEA release schedule', 'https://www.bea.gov/news/schedule'],
  bea27: ['BEA 2027 release schedule', 'https://www.bea.gov/news/schedule/next-year'],
  census: ['Census Bureau release schedule', 'https://www.census.gov/retail/release_schedule.html'],
  ismcal: ['ISM release calendar', 'https://ismworld.org/supply-management-news-and-reports/reports/rob-report-calendar/'],
  ism: ['ISM business-day rule (TheRightTrader)', 'https://therighttrader.com/economic-calendar/ism-manufacturing'],
  nbs: ['NBS 2026 release calendar', 'https://www.stats.gov.cn/english/PressRelease/ReleaseCalendar/202512/t20251226_1962154.html'],
  msci: ['MSCI index review dates', 'https://www.msci.com/eqb/pressreleases/archive/ir_dates.pdf'],
  msciNov: ['MSCI November 2026 review (Upstox)', 'https://upstox.com/news/market-news/stocks/lic-adani-green-meesho-coforge-msci-adds-15-stocks-as-part-of-november-rejig-here-s-how-this-impacts-investors/article-203327/'],
  opec: ['OPEC', 'https://www.opec.org/pr-detail/2033620-1-november-2026.html'],
  nse: ['NSE contract rules (last Tuesday)', 'https://www.wrightresearch.in/blog/f-and-o-monthly-expiry-guide/'],
  nsehol: ['NSE circular: trading holidays 2026', 'https://nsearchives.nseindia.com/content/circulars/FAOP71777.pdf'],
  nyse: ['NYSE holiday calendar 2025–27 (ICE)', 'https://ir.theice.com/press/news-details/2024/NYSE-Group-Announces-2025-2026-and-2027-Holiday-and-Early-Closings-Calendar/default.aspx'],
  rule: ['Fixed rule', null],
};
const e = (date, country, cat, imp, title, o = {}) => ({ date, country, cat, imp, title, time: o.t || '', detail: o.d || '', status: o.s || 'scheduled', src: (o.src || S.rule)[0], url: (o.src || S.rule)[1], ind: o.ind || null });

const US830 = '08:30 ET · 19:00 IST';   // EST (until 14 Mar 2027)
const US830D = '08:30 ET · 18:00 IST';  // EDT (from 14 Mar 2027)
const IN4PM = '16:00 IST';
const CN930 = '09:30 Beijing · 07:00 IST';

export const EVENTS = [
  // ---------- November 2026 ----------
  e('2026-11-16', 'IN', 'data', 1, 'India jobs: PLFS monthly bulletin (Oct)', { s: 'official', src: S.mospi, d: 'Urban and rural unemployment rate. Calendar date 15 Nov was a Sunday, so it moves to the next working day.' }),
  e('2026-11-17', 'US', 'data', 2, 'US retail sales (Oct)', { t: US830, s: 'official', src: S.census }),
  e('2026-11-18', 'US', 'cb', 2, 'FOMC minutes (27–28 Oct meeting)', { t: '14:00 ET · 00:30 IST (19 Nov)', src: S.fedmin, d: 'Two members dissented in favour of a hike. Look for how many others leaned that way, and the balance-sheet discussion.', ind: 'pol_US' }),
  e('2026-11-20', 'CN', 'cb', 1, 'China loan prime rates (LPR)', { s: 'estimated', d: 'Set on the 20th each month. A cut signals more stimulus, good for metals and EM.' }),
  e('2026-11-23', 'IN', 'markets', 1, 'Nifty monthly F&O expiry', { src: S.nse, d: 'Moved to Monday because 24 Nov is a market holiday. Expect volatility near the close.' }),
  e('2026-11-24', 'IN', 'holiday', 1, 'NSE / BSE closed (Guru Nanak Jayanti)', { s: 'official', src: S.nsehol }),
  e('2026-11-25', 'US', 'data', 3, 'US PCE inflation (Oct) + GDP Q3 (second estimate)', { t: US830, s: 'official', src: S.bea, d: 'PCE is the Fed’s preferred inflation gauge. Watch core PCE month on month.', ind: 'cpi_US' }),
  e('2026-11-26', 'US', 'holiday', 1, 'US markets closed (Thanksgiving); early close 27 Nov', { s: 'official', src: S.nyse }),
  e('2026-11-29', 'GL', 'markets', 2, 'OPEC+ meeting (seven-country group)', { s: 'official', src: S.opec, d: 'Sets January output; on 1 Nov the seven kept December output at September’s level. Higher oil widens India’s import bill and weighs on the rupee.', ind: 'brent' }),
  e('2026-11-30', 'IN', 'data', 3, 'India GDP, Q2 FY27 (Jul–Sep)', { s: 'official', src: S.mospi, d: 'Growth momentum versus RBI projections; nominal GDP drives earnings and tax revenue.' }),
  e('2026-11-30', 'IN', 'data', 2, 'India industrial production, IIP (Oct)', { t: IN4PM, s: 'official', src: S.mospi, d: 'Calendar date 28 Nov is a Saturday, so it moves to the next working day, alongside GDP.' }),
  e('2026-11-30', 'GL', 'markets', 2, 'MSCI November review: rebalance at the close', { s: 'official', src: S.msciNov, d: 'Implemented as of the 30 Nov close, so index funds trade then. In India, LIC, Adani Green and Meesho join the Standard Index and PI Industries leaves it.' }),
  e('2026-11-30', 'CN', 'data', 2, 'China official PMIs (Nov)', { t: CN930, s: 'official', src: S.nbs, d: 'Published by NBS on the last day of the month. Above 50 = expansion.' }),
  // ---------- December 2026 ----------
  e('2026-12-01', 'US', 'data', 2, 'ISM manufacturing PMI (Nov)', { t: '10:00 ET · 20:30 IST', s: 'official', src: S.ismcal }),
  e('2026-12-01', 'IN', 'fiscal', 1, 'India GST collections (Nov)', { s: 'estimated', d: 'Published on the 1st, weekends included. A real-time read on consumption and tax buoyancy.' }),
  e('2026-12-03', 'US', 'data', 1, 'ISM services PMI (Nov)', { t: '10:00 ET · 20:30 IST', s: 'official', src: S.ismcal }),
  e('2026-12-04', 'IN', 'cb', 3, 'RBI monetary policy decision', { t: '10:00 IST', s: 'official', src: S.rbi, d: 'MPC meets 2–4 Dec after hiking to 5.50% in October. Watch the CPI forecast, stance and liquidity measures.', ind: 'pol_IN' }),
  e('2026-12-04', 'US', 'data', 3, 'US jobs report — non-farm payrolls (Nov)', { t: US830, s: 'official', src: S.bls, d: 'Payrolls, unemployment rate and wage growth.' }),
  e('2026-12-09', 'US', 'cb', 3, 'FOMC decision + projections (dot plot)', { t: '14:00 ET · 00:30 IST (10 Dec)', s: 'official', src: S.fed, d: 'Meeting 8–9 Dec. New dot plot and economic projections; press conference 30 minutes after.', ind: 'pol_US' }),
  e('2026-12-10', 'US', 'data', 3, 'US CPI inflation (Nov)', { t: US830, s: 'official', src: S.bls, d: 'Headline and core CPI. Lands the day after the Fed decision.', ind: 'cpi_US' }),
  e('2026-12-14', 'IN', 'data', 3, 'India CPI inflation (Nov)', { t: IN4PM, s: 'official', src: S.mospi, d: 'Calendar date 12 Dec is a Saturday, so it moves to the next working day.', ind: 'cpi_IN' }),
  e('2026-12-14', 'IN', 'data', 1, 'India WPI inflation (Nov)', { s: 'estimated', d: 'Usually released on the 14th by the Office of the Economic Adviser.' }),
  e('2026-12-15', 'US', 'data', 1, 'US producer prices, PPI (Nov)', { t: US830, s: 'official', src: S.bls }),
  e('2026-12-15', 'IN', 'data', 1, 'India jobs: PLFS monthly bulletin (Nov)', { s: 'official', src: S.mospi }),
  e('2026-12-16', 'US', 'data', 2, 'US retail sales (Nov)', { t: US830, s: 'official', src: S.census, d: 'Holiday-season spending; about 70% of US GDP is consumption.' }),
  e('2026-12-17', 'XM', 'cb', 2, 'ECB monetary policy decision', { t: '14:15 CET · 18:45 IST', s: 'official', src: S.ecb, d: 'Meeting 16–17 Dec; press conference on the 17th.', ind: 'pol_XM' }),
  e('2026-12-17', 'GB', 'cb', 2, 'Bank of England decision', { t: '12:00 GMT · 17:30 IST', s: 'official', src: S.boe, d: 'First meeting after the 5 Nov hike to 4%.', ind: 'pol_GB' }),
  e('2026-12-18', 'JP', 'cb', 2, 'Bank of Japan decision', { t: 'Around midday JST · ~08:30 IST', s: 'official', src: S.boj, d: 'Meeting 17–18 Dec. BoJ hikes can unwind yen carry trades and hit global risk assets.', ind: 'pol_JP' }),
  e('2026-12-18', 'US', 'markets', 1, 'US quarterly options and futures expiry ("quad witching")', { s: 'estimated', d: 'Third Friday of the quarter-end month; heavy volume, index rebalancing.' }),
  e('2026-12-21', 'CN', 'cb', 1, 'China loan prime rates (LPR)', { s: 'estimated', d: 'The 20th falls on a Sunday.' }),
  e('2026-12-23', 'US', 'data', 3, 'US GDP Q3 (third estimate) + PCE inflation (Nov)', { t: US830, s: 'official', src: S.bea, ind: 'cpi_US' }),
  e('2026-12-25', 'GL', 'holiday', 1, 'US and Indian markets closed (Christmas)', { s: 'official', src: S.nsehol, d: 'On both the NSE 2026 and NYSE holiday lists.' }),
  e('2026-12-28', 'IN', 'data', 2, 'India industrial production, IIP (Nov)', { t: IN4PM, s: 'official', src: S.mospi }),
  e('2026-12-29', 'IN', 'markets', 1, 'Nifty monthly F&O expiry', { src: S.nse }),
  e('2026-12-30', 'US', 'cb', 2, 'FOMC minutes (8–9 Dec meeting)', { t: '14:00 ET · 00:30 IST (31 Dec)', s: 'estimated', src: S.fedmin, d: 'Three weeks after the meeting.' }),
  e('2026-12-31', 'CN', 'data', 2, 'China official PMIs (Dec)', { t: CN930, s: 'official', src: S.nbs }),
  // ---------- January 2027 ----------
  e('2027-01-01', 'US', 'holiday', 1, 'US markets closed (New Year’s Day)', { s: 'official', src: S.nyse }),
  e('2027-01-01', 'IN', 'fiscal', 1, 'India GST collections (Dec)', { s: 'estimated' }),
  e('2027-01-04', 'US', 'data', 2, 'ISM manufacturing PMI (Dec)', { t: '10:00 ET · 20:30 IST', s: 'estimated', src: S.ism }),
  e('2027-01-06', 'US', 'data', 1, 'ISM services PMI (Dec)', { t: '10:00 ET · 20:30 IST', s: 'estimated', src: S.ism }),
  e('2027-01-07', 'IN', 'data', 2, 'India GDP: first advance estimate, FY27', { s: 'official', src: S.mospi, d: 'The full-year growth estimate the Union Budget is built on.' }),
  e('2027-01-08', 'US', 'data', 3, 'US jobs report — non-farm payrolls (Dec)', { t: US830, s: 'official', src: S.bls27 }),
  e('2027-01-11', 'IN', 'earnings', 2, 'India Q3 FY27 results season begins (IT services usually first)', { s: 'estimated', d: 'Week of 11 Jan by convention. Watch guidance from IT services and private banks.' }),
  e('2027-01-12', 'IN', 'data', 3, 'India CPI inflation (Dec)', { t: IN4PM, s: 'official', src: S.mospi, ind: 'cpi_IN' }),
  e('2027-01-13', 'US', 'data', 3, 'US CPI inflation (Dec)', { t: US830, s: 'official', src: S.bls27, ind: 'cpi_US' }),
  e('2027-01-13', 'US', 'earnings', 2, 'US Q4 earnings season begins (large banks first)', { s: 'estimated', d: 'Mid-January by convention. Net interest income, credit costs and buyback plans.' }),
  e('2027-01-14', 'US', 'data', 1, 'US producer prices, PPI (Dec)', { t: US830, s: 'official', src: S.bls27 }),
  e('2027-01-14', 'IN', 'data', 1, 'India WPI inflation (Dec)', { s: 'estimated' }),
  e('2027-01-15', 'US', 'data', 2, 'US retail sales (Dec)', { t: US830, s: 'official', src: S.census, d: 'Holiday-season spending.' }),
  e('2027-01-15', 'IN', 'data', 1, 'India jobs: PLFS monthly bulletin (Dec)', { s: 'official', src: S.mospi }),
  e('2027-01-18', 'US', 'holiday', 1, 'US markets closed (Martin Luther King Jr. Day)', { s: 'official', src: S.nyse }),
  e('2027-01-20', 'CN', 'cb', 1, 'China loan prime rates (LPR)', { s: 'estimated' }),
  e('2027-01-22', 'JP', 'cb', 2, 'Bank of Japan decision + Outlook Report', { t: 'Around midday JST · ~08:30 IST', s: 'official', src: S.boj, d: 'Meeting 21–22 Jan, with new growth and inflation forecasts.', ind: 'pol_JP' }),
  e('2027-01-25', 'IN', 'markets', 1, 'Nifty monthly F&O expiry', { s: 'estimated', src: S.nse, d: 'The last Tuesday, 26 Jan, is Republic Day, so expiry moves to Monday.' }),
  e('2027-01-26', 'IN', 'holiday', 1, 'NSE / BSE closed (Republic Day)', { s: 'estimated', d: 'Always a market holiday; NSE publishes its 2027 list in December.' }),
  e('2027-01-27', 'US', 'cb', 3, 'FOMC decision', { t: '14:00 ET · 00:30 IST (28 Jan)', s: 'official', src: S.fed, d: 'Meeting 26–27 Jan (tentative until confirmed at the December meeting).', ind: 'pol_US' }),
  e('2027-01-28', 'US', 'data', 3, 'US GDP Q4 (advance) + PCE inflation (Dec)', { t: US830, s: 'official', src: S.bea27, d: 'First read on Q4 growth, the day after the Fed decision.', ind: 'cpi_US' }),
  e('2027-01-28', 'IN', 'data', 2, 'India industrial production, IIP (Dec)', { t: IN4PM, s: 'official', src: S.mospi }),
  e('2027-01-31', 'CN', 'data', 2, 'China official PMIs (Jan)', { s: 'estimated' }),
  // ---------- February 2027 ----------
  e('2027-02-01', 'IN', 'fiscal', 3, 'Union Budget FY28', { s: 'estimated', d: 'Presented on 1 Feb by convention; the date is confirmed when Parliament’s budget session is notified. Fiscal deficit, borrowing, capex, capital gains tax.' }),
  e('2027-02-01', 'US', 'data', 2, 'ISM manufacturing PMI (Jan)', { t: '10:00 ET · 20:30 IST', s: 'estimated', src: S.ism }),
  e('2027-02-03', 'US', 'data', 1, 'ISM services PMI (Jan)', { t: '10:00 ET · 20:30 IST', s: 'estimated', src: S.ism }),
  e('2027-02-04', 'XM', 'cb', 2, 'ECB monetary policy decision', { t: '14:15 CET · 18:45 IST', s: 'official', src: S.ecb, ind: 'pol_XM' }),
  e('2027-02-04', 'GB', 'cb', 2, 'Bank of England decision', { t: '12:00 GMT · 17:30 IST', s: 'official', src: S.boe, ind: 'pol_GB' }),
  e('2027-02-05', 'IN', 'cb', 3, 'RBI monetary policy decision', { t: '10:00 IST', s: 'official', src: S.rbi, d: 'MPC meets 3–5 Feb, days after the Budget.', ind: 'pol_IN' }),
  e('2027-02-05', 'US', 'data', 3, 'US jobs report — non-farm payrolls (Jan), with annual revisions', { t: US830, s: 'official', src: S.bls27, d: 'Includes the annual benchmark revision to payrolls.' }),
  e('2027-02-09', 'GL', 'markets', 2, 'MSCI February index review announced', { s: 'official', src: S.msci, d: 'Changes take effect 1 Mar. Drives passive FPI flows into India.' }),
  e('2027-02-11', 'US', 'data', 3, 'US CPI inflation (Jan)', { t: US830, s: 'official', src: S.bls27, ind: 'cpi_US' }),
  e('2027-02-12', 'US', 'data', 1, 'US producer prices, PPI (Jan)', { t: US830, s: 'official', src: S.bls27 }),
  e('2027-02-12', 'IN', 'data', 3, 'India CPI inflation (Jan)', { t: IN4PM, s: 'official', src: S.mospi, ind: 'cpi_IN' }),
  e('2027-02-15', 'US', 'holiday', 1, 'US markets closed (Presidents’ Day)', { s: 'official', src: S.nyse }),
  e('2027-02-15', 'IN', 'data', 1, 'India WPI inflation (Jan)', { s: 'estimated', d: 'The 14th falls on a Sunday.' }),
  e('2027-02-15', 'IN', 'data', 1, 'India jobs: PLFS monthly bulletin (Jan)', { s: 'official', src: S.mospi }),
  e('2027-02-17', 'US', 'data', 2, 'US retail sales (Jan)', { t: US830, s: 'official', src: S.census }),
  e('2027-02-17', 'US', 'cb', 2, 'FOMC minutes (26–27 Jan meeting)', { t: '14:00 ET · 00:30 IST (18 Feb)', s: 'estimated', src: S.fedmin, d: 'Three weeks after the meeting.' }),
  e('2027-02-23', 'IN', 'markets', 1, 'Nifty monthly F&O expiry', { s: 'estimated', src: S.nse }),
  e('2027-02-25', 'US', 'data', 2, 'US PCE inflation (Jan) + GDP Q4 (second estimate)', { t: US830, s: 'official', src: S.bea27, ind: 'cpi_US' }),
  e('2027-02-26', 'IN', 'data', 3, 'India GDP Q3 FY27 + second advance estimate', { s: 'official', src: S.mospi, d: 'Also revises FY26 and finalises FY25 growth.' }),
  e('2027-02-26', 'GL', 'markets', 2, 'MSCI February review: rebalance at the close', { s: 'official', src: S.msci, d: 'Changes take effect 1 Mar, so index funds trade at the close of the prior trading day.' }),
  e('2027-02-28', 'CN', 'data', 2, 'China official PMIs (Feb)', { s: 'estimated' }),
  // ---------- March 2027 ----------
  e('2027-03-01', 'IN', 'data', 2, 'India industrial production, IIP (Jan)', { t: IN4PM, s: 'official', src: S.mospi, d: 'Calendar date 28 Feb is a Sunday, so it moves to the next working day.' }),
  e('2027-03-05', 'US', 'data', 3, 'US jobs report — non-farm payrolls (Feb)', { t: US830, s: 'official', src: S.bls27 }),
  e('2027-03-10', 'US', 'data', 3, 'US CPI inflation (Feb)', { t: US830, s: 'official', src: S.bls27, ind: 'cpi_US' }),
  e('2027-03-12', 'US', 'data', 1, 'US producer prices, PPI (Feb)', { t: US830, s: 'official', src: S.bls27 }),
  e('2027-03-12', 'IN', 'data', 3, 'India CPI inflation (Feb)', { t: IN4PM, s: 'official', src: S.mospi, ind: 'cpi_IN' }),
  e('2027-03-15', 'IN', 'data', 1, 'India jobs: PLFS monthly bulletin (Feb)', { s: 'official', src: S.mospi }),
  e('2027-03-16', 'US', 'data', 2, 'US retail sales (Feb)', { t: US830D, s: 'official', src: S.census }),
  e('2027-03-17', 'US', 'cb', 3, 'FOMC decision', { t: '14:00 ET · 23:30 IST', s: 'official', src: S.fed, d: 'Meeting 16–17 Mar (tentative). The Fed has not yet marked which 2027 meetings come with projections (dot plot). US clocks move to daylight time on 14 Mar.', ind: 'pol_US' }),
  e('2027-03-18', 'XM', 'cb', 2, 'ECB monetary policy decision', { t: '14:15 CET · 18:45 IST', s: 'official', src: S.ecb, ind: 'pol_XM' }),
  e('2027-03-18', 'GB', 'cb', 2, 'Bank of England decision', { t: '12:00 GMT · 17:30 IST', s: 'official', src: S.boe, ind: 'pol_GB' }),
  e('2027-03-18', 'JP', 'cb', 2, 'Bank of Japan decision', { t: 'Around midday JST · ~08:30 IST', s: 'official', src: S.boj, ind: 'pol_JP' }),
  e('2027-03-26', 'US', 'holiday', 1, 'US markets closed (Good Friday)', { s: 'official', src: S.nyse }),
  e('2027-03-26', 'IN', 'holiday', 1, 'NSE / BSE closed (Good Friday)', { s: 'estimated', d: 'NSE has not yet published its 2027 holiday list; Good Friday has been a market holiday every year.' }),
  e('2027-03-29', 'IN', 'data', 2, 'India industrial production, IIP (Feb)', { t: IN4PM, s: 'official', src: S.mospi, d: 'Calendar date 28 Mar is a Sunday, so it moves to the next working day.' }),
  e('2027-03-30', 'IN', 'markets', 1, 'Nifty monthly F&O expiry', { s: 'estimated', src: S.nse }),
  e('2027-03-31', 'US', 'data', 2, 'US PCE inflation (Feb) + GDP Q4 (third estimate)', { t: US830D, s: 'official', src: S.bea27, ind: 'cpi_US' }),
  e('2027-03-31', 'IN', 'fiscal', 1, 'India fiscal year-end (FY27)', { s: 'scheduled', d: 'Advance tax, fiscal deficit outturn and year-end liquidity tightness.' }),
  // ---------- Rest of the 2027 FOMC calendar ----------
  // The Fed revised its 2027 calendar on 28 Oct 2026: seven rate decisions, the October meeting set aside
  // for strategy (no rate vote), and the last decision moved from December to 16–17 Nov.
  e('2027-04-28', 'US', 'cb', 3, 'FOMC decision', { t: '14:00 ET · 23:30 IST', s: 'official', src: S.fed, d: 'Meeting 27–28 Apr (tentative).', ind: 'pol_US' }),
  e('2027-06-09', 'US', 'cb', 3, 'FOMC decision', { t: '14:00 ET · 23:30 IST', s: 'official', src: S.fed, d: 'Meeting 8–9 Jun (tentative).', ind: 'pol_US' }),
  e('2027-07-28', 'US', 'cb', 3, 'FOMC decision', { t: '14:00 ET · 23:30 IST', s: 'official', src: S.fed, d: 'Meeting 27–28 Jul (tentative).', ind: 'pol_US' }),
  e('2027-09-15', 'US', 'cb', 3, 'FOMC decision', { t: '14:00 ET · 23:30 IST', s: 'official', src: S.fed, d: 'Meeting 14–15 Sep (tentative).', ind: 'pol_US' }),
  e('2027-10-27', 'US', 'cb', 1, 'FOMC strategy meeting (no rate decision)', { s: 'official', src: S.fed, d: 'Meeting 26–27 Oct, set aside for monetary policy strategy. No rate vote or policy statement is expected.' }),
  e('2027-11-17', 'US', 'cb', 3, 'FOMC decision', { t: '14:00 ET · 00:30 IST (18 Nov)', s: 'official', src: S.fed, d: 'Meeting 16–17 Nov (tentative); the last rate decision of 2027, replacing the usual December meeting. US clocks are back on standard time from 7 Nov.', ind: 'pol_US' }),
];

// Known events whose dates are not yet set (editorial; each hides itself after `until`).
// Items the engine can detect itself (next year's NSE holiday list, RBI's next MPC schedule) are added automatically.
export const HORIZON = [
  { country: 'IN', title: 'State assembly elections: Uttar Pradesh, Punjab, Uttarakhand, Goa, Manipur', when: 'Expected Feb–Mar 2027', until: '2027-03-31', detail: 'The Election Commission has not announced a schedule; reports expect dates after mid-December (in 2022 they were announced on 8 Jan). The UP result is read as a mid-term test for the central government.' },
  { country: 'IN', title: 'Economic Survey FY27', when: 'Late January 2027, a few days before the Budget', until: '2027-02-01', detail: 'Tabled at the start of the Budget session (on 29 Jan in 2026). The government’s growth outlook for FY28.' },
  { country: 'US', title: 'US Treasury quarterly refunding announcement', when: 'Early February 2027', until: '2027-02-10', detail: 'Coupon issuance sizes move long-term yields.' },
  { country: 'IN', title: 'RBI Financial Stability Report', when: 'Late December 2026', until: '2026-12-31', detail: 'Bank asset quality and systemic risk.' },
];

// FOMC rate-decision days known on 16 Nov 2026 (fallback when the Fed's calendar page cannot be read).
export const FOMC_SEED = ['2026-12-09', '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09', '2027-07-28', '2027-09-15', '2027-11-17', '2028-01-26'];
