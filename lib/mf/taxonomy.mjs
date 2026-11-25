// Scheme categories in AMFI's monthly report (and SEBI's copy of it), old and new names.
// SEBI re-categorised schemes from the August 2026 report: debt categories were renamed, Value/Contra, Sectoral/Thematic and
// Balanced/Aggressive hybrid were split, Life Cycle funds got their own section, and Index funds and ETFs were broken out.
// Every row maps to a key (its own category) and a trend key (tk) that is comparable across the change.
//   cls = headline asset class: equity (active), hybrid, debt, passive (index funds + ETFs), solution, fofovs, closed, interval

const C = (k, name, cls, tk, names, grp) => ({ k, name, cls, tk: tk || k, names, grp });
export const CATS = [
  // Debt
  C('overnight', 'Overnight', 'debt', null, ['overnightfund'], 'debt'),
  C('liquid', 'Liquid', 'debt', null, ['liquidfund'], 'debt'),
  C('ultrashort', 'Ultra short term', 'debt', null, ['ultrashortdurationfund', 'ultrashorttermfund'], 'debt'),
  C('lowdur', 'Ultra short to short term', 'debt', null, ['lowdurationfund', 'ultrashorttoshorttermfund'], 'debt'),
  C('moneymkt', 'Money market', 'debt', null, ['moneymarketfund'], 'debt'),
  C('shortdur', 'Short term', 'debt', null, ['shortdurationfund', 'shorttermfund'], 'debt'),
  C('meddur', 'Medium term', 'debt', null, ['mediumdurationfund', 'mediumtermfund'], 'debt'),
  C('medlong', 'Medium to long term', 'debt', null, ['mediumtolongdurationfund', 'mediumtolongtermfund'], 'debt'),
  C('longdur', 'Long term', 'debt', null, ['longdurationfund', 'longtermfund'], 'debt'),
  C('dynamic', 'Dynamic term', 'debt', null, ['dynamicbondfund', 'dynamictermfund'], 'debt'),
  C('corpbond', 'Corporate bond', 'debt', null, ['corporatebondfund'], 'debt'),
  C('credit', 'Credit risk', 'debt', null, ['creditriskfund'], 'debt'),
  C('bankpsu', 'Banking & PSU debt', 'debt', null, ['bankingandpsufund', 'bankingandpsudebtfund'], 'debt'),
  C('gilt', 'Gilt', 'debt', null, ['giltfund'], 'debt'),
  C('gilt10', '10-year constant maturity gilt', 'debt', null, ['giltfundwith10yearconstantduration', '10yearconstantmaturitygiltfund', 'giltfundwith10yearconstantdurationfund'], 'debt'),
  C('floater', 'Floating rate', 'debt', null, ['floaterfund', 'floatinginterestratesfund'], 'debt'),
  C('debtsect', 'Sectoral debt', 'debt', null, ['sectoralfund'], 'debt'),
  // Active equity
  C('multicap', 'Multi cap', 'equity', null, ['multicapfund'], 'equity'),
  C('largecap', 'Large cap', 'equity', null, ['largecapfund'], 'equity'),
  C('largemid', 'Large & mid cap', 'equity', null, ['largeandmidcapfund'], 'equity'),
  C('midcap', 'Mid cap', 'equity', null, ['midcapfund'], 'equity'),
  C('smallcap', 'Small cap', 'equity', null, ['smallcapfund'], 'equity'),
  C('flexicap', 'Flexi cap', 'equity', null, ['flexicapfund'], 'equity'),
  C('divyield', 'Dividend yield', 'equity', null, ['dividendyieldfund'], 'equity'),
  C('valuecontra', 'Value / contra', 'equity', null, ['valuefundcontrafund'], 'equity'),
  C('value', 'Value', 'equity', 'valuecontra', ['valuefund'], 'equity'),
  C('contra', 'Contra', 'equity', 'valuecontra', ['contrafund'], 'equity'),
  C('focused', 'Focused', 'equity', null, ['focusedfund'], 'equity'),
  C('secthem', 'Sectoral / thematic', 'equity', null, ['sectoralthematicfunds', 'sectoralthematicfund'], 'equity'),
  C('sectoral', 'Sectoral', 'equity', 'secthem', ['sectoralfund'], 'equity'),
  C('thematic', 'Thematic', 'equity', 'secthem', ['thematicfund'], 'equity'),
  C('elss', 'ELSS (tax saver)', 'equity', null, ['elss', 'elsstaxsaverfund'], 'equity'),
  // Hybrid
  C('conservative', 'Conservative hybrid', 'hybrid', null, ['conservativehybridfund'], 'hybrid'),
  C('balagg', 'Balanced / aggressive hybrid', 'hybrid', null, ['balancedhybridfundaggressivehybridfund'], 'hybrid'),
  C('balanced', 'Balanced hybrid', 'hybrid', 'balagg', ['balancedhybridfund'], 'hybrid'),
  C('aggressive', 'Aggressive hybrid', 'hybrid', 'balagg', ['aggressivehybridfund'], 'hybrid'),
  C('baf', 'Balanced advantage / dynamic', 'hybrid', null, ['dynamicassetallocationbalancedadvantagefund', 'balancedadvantagefunddynamicassetallocation'], 'hybrid'),
  C('multiasset', 'Multi asset allocation', 'hybrid', null, ['multiassetallocationfund', 'multiassetallocation'], 'hybrid'),
  C('arbitrage', 'Arbitrage', 'hybrid', null, ['arbitragefund'], 'hybrid'),
  C('eqsavings', 'Equity savings', 'hybrid', null, ['equitysavingsfund'], 'hybrid'),
  // Life cycle (new) and solution oriented. Before Aug 2026 life cycle funds were counted under Retirement.
  ...[5, 10, 15, 20, 25, 30].map((y) => C('lc' + y, `Life cycle (${y} yr)`, 'solution', 'retirement', [`lifecyclefundwithmaturityof${y}years`], 'lifecycle')),
  C('retirement', 'Retirement', 'solution', null, ['retirementfund'], 'solution'),
  C('children', "Children's", 'solution', null, ['childrensfund'], 'solution'),
  // Passive: index funds and ETFs. Before Aug 2026 index funds were one row, and ETFs were Gold vs everything else.
  C('index', 'Index funds (all)', 'passive', null, ['indexfunds'], 'other'),
  C('indexeq', 'Index funds: equity', 'passive', 'index', ['equityfunds'], 'index'),
  C('indexdebt', 'Index funds: debt', 'passive', 'index', ['debtfunds'], 'index'),
  C('indexhyb', 'Index funds: hybrid', 'passive', 'index', ['hybridfund', 'hybridfunds'], 'index'),
  C('goldetf', 'Gold ETFs', 'passive', null, ['goldetf', 'goldetfs'], 'etf'),
  C('otheretf', 'Other ETFs', 'passive', null, ['otheretfs'], 'other'),
  C('etfeq', 'Equity ETFs', 'passive', 'otheretf', ['equityetf', 'equityetfs'], 'etf'),
  C('etfdebt', 'Debt ETFs', 'passive', 'otheretf', ['debtetf', 'debtetfs'], 'etf'),
  C('etfhyb', 'Hybrid ETFs', 'passive', 'otheretf', ['hybridetf', 'hybridetfs'], 'etf'),
  C('silveretf', 'Silver ETFs', 'passive', 'otheretf', ['silveretf', 'silveretfs'], 'etf'),
  C('etfother', 'Other ETFs', 'passive', 'otheretf', ['otheretf'], 'etf'),
  C('etfovs', 'ETFs investing overseas', 'passive', 'otheretf', ['etfsinvestingoverseas'], 'etf'),
  C('fofovs', 'Fund of funds investing overseas', 'fofovs', null, ['fundoffundsinvestingoverseas'], 'fofovs'),
  // Close-ended and interval schemes
  C('fmp', 'Fixed maturity plans', 'closed', null, ['fixedtermplan'], 'ce-debt'),
  C('cpo', 'Capital protection', 'closed', null, ['capitalprotectionorientedschemes'], 'ce-debt'),
  C('infradebt', 'Infrastructure debt', 'closed', null, ['infrastructuredebtfund'], 'ce-debt'),
  C('othdebtce', 'Other debt (close-ended)', 'closed', null, ['otherdebtscheme'], 'ce-debt'),
  C('elssce', 'ELSS (close-ended)', 'closed', null, ['elss'], 'ce-equity'),
  C('otheqce', 'Other equity (close-ended)', 'closed', null, ['otherequityschemes'], 'ce-equity'),
  C('othce', 'Other (close-ended)', 'closed', null, ['otherschemes'], 'ce-other'),
  C('intdebt', 'Interval: debt', 'interval', null, ['incomedebtorientedschemes', 'incomedebtorientedscheme'], 'interval'),
  C('inteq', 'Interval: equity', 'interval', null, ['growthequityorientedschemes'], 'interval'),
  C('intoth', 'Interval: other', 'interval', null, ['otherschemes'], 'interval'),
];
export const BY_KEY = Object.fromEntries(CATS.map((c) => [c.k, c]));
export const CLASSES = [
  ['equity', 'Equity (active)'], ['hybrid', 'Hybrid'], ['passive', 'Index funds & ETFs'], ['debt', 'Debt'],
  ['solution', 'Retirement, children & life cycle'], ['fofovs', 'Overseas fund of funds'], ['closed', 'Close-ended'], ['interval', 'Interval'],
];
// Trend keys in display order (stable across the August 2026 re-categorisation).
export const TREND = [...new Set(CATS.map((c) => c.tk))];

export const norm = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

// Section headings: "I Debt Schemes", "II Growth/Equity Oriented Schemes", "V Other Schemes", "VII Exchange Traded Funds"…
export function groupOf(label) {
  const s = String(label || '').toLowerCase();
  if (/life ?cycle/.test(s)) return 'lifecycle';
  if (/solution/.test(s)) return 'solution';
  if (/exchange traded|\betfs?\b/.test(s)) return 'etf';
  if (/index/.test(s)) return 'index';
  if (/overseas fund of funds|fund of funds/.test(s)) return 'fofovs';
  if (/hybrid/.test(s)) return 'hybrid';
  if (/other schemes/.test(s)) return 'other';
  if (/debt|income/.test(s)) return 'debt';
  if (/equity|growth/.test(s)) return 'equity';
  return null;
}

// Resolve a data row to a category, given its top section (A open, B close, C interval) and group heading.
export function resolve(top, grp, name) {
  const n = norm(name);
  if (top === 'C') return CATS.find((c) => c.cls === 'interval' && c.names.includes(n)) || null;
  if (top === 'B') {
    if (grp === 'equity') return CATS.find((c) => c.grp === 'ce-equity' && c.names.includes(n)) || null;
    if (grp === 'debt') return CATS.find((c) => c.grp === 'ce-debt' && c.names.includes(n)) || null;
    return CATS.find((c) => c.cls === 'closed' && c.names.includes(n)) || null;
  }
  const want = { debt: ['debt'], equity: ['equity'], hybrid: ['hybrid'], lifecycle: ['lifecycle'], solution: ['solution', 'lifecycle'], index: ['index'], etf: ['etf'], fofovs: ['fofovs'], other: ['other', 'etf', 'fofovs'] }[grp] || null;
  const pool = CATS.filter((c) => !['closed', 'interval'].includes(c.cls) && (!want || want.includes(c.grp)));
  return pool.find((c) => c.names.includes(n)) || null;
}

const ROMAN = /^[ivxlIVXL]+\.?$/; // SEBI writes VI, VII, VIII as "Vl", "Vll", "Vlll"
export const isRoman = (s) => ROMAN.test(String(s || '').trim());
export const romanUpper = (s) => String(s || '').trim().replace(/\.$/, '').replace(/l/g, 'I').toUpperCase();

export const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
export const MON3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// "October 2026", "March-2026", "Sept 30, 2026" → '2026-10'
export function periodFrom(text) {
  const s = String(text || '').toLowerCase();
  const m = s.match(/(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,.-]*(?:\d{1,2}[\s,]+)?(20\d\d)/);
  if (!m) return null;
  const i = MON3.indexOf(m[1].slice(0, 3));
  return i < 0 ? null : `${m[2]}-${String(i + 1).padStart(2, '0')}`;
}
export const monthLabel = (p) => { const [y, m] = p.split('-').map(Number); return `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`; };
export const monthShort = (p) => { const [y, m] = p.split('-').map(Number); return `${MON3[m - 1][0].toUpperCase()}${MON3[m - 1].slice(1)} ${String(y).slice(2)}`; };
export const addMonths = (p, k) => { const [y, m] = p.split('-').map(Number); const t = y * 12 + (m - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
