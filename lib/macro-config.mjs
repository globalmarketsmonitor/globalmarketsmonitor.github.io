// Macro indicator registry. Every indicator is pulled from a free, keyless public source
// (except the optional FRED block, which needs FRED_API_KEY or works via FRED's public CSV where reachable).
//
// pillar: growth | inflation | liquidity | risk  (valuation is assembled in the front end from /api/history + /api/global)
// chg:    'pct' → changes shown in %, 'diff' → changes shown in units (pp, bp, points)
// src:    yahoo | yahooRatio | treasury | bisCpi | bisPolicy | dbnomics | fred

export const YAHOO = [
  // id, symbol, name, pillar, unit, chg, decimals
  { id: 'spx',     sym: '^GSPC',     name: 'S&P 500',               pillar: 'risk',      unit: '',  chg: 'pct',  dp: 0 },
  { id: 'acwi',    sym: 'ACWI',      name: 'MSCI ACWI (ETF)',       pillar: 'risk',      unit: '$', chg: 'pct',  dp: 2 },
  { id: 'nifty',   sym: '^NSEI',     name: 'Nifty 50',              pillar: 'risk',      unit: '',  chg: 'pct',  dp: 0 },
  { id: 'stoxx',   sym: '^STOXX50E', name: 'Euro Stoxx 50',         pillar: 'risk',      unit: '',  chg: 'pct',  dp: 0 },
  { id: 'nikkei',  sym: '^N225',     name: 'Nikkei 225',            pillar: 'risk',      unit: '',  chg: 'pct',  dp: 0 },
  { id: 'csi300',  sym: 'ASHR',      name: 'China A-shares (CSI 300 ETF)', pillar: 'risk', unit: '$', chg: 'pct', dp: 2 },
  { id: 'vix',     sym: '^VIX',      name: 'VIX (US equity vol)',   pillar: 'risk',      unit: '',  chg: 'diff', dp: 1 },
  { id: 'move',    sym: '^MOVE',     name: 'MOVE (US bond vol)',    pillar: 'risk',      unit: '',  chg: 'diff', dp: 0 },
  { id: 'indiavix',sym: '^INDIAVIX', name: 'India VIX',             pillar: 'risk',      unit: '',  chg: 'diff', dp: 1 },
  { id: 'dxy',     sym: 'DX-Y.NYB',  name: 'US dollar index (DXY)', pillar: 'liquidity', unit: '',  chg: 'pct',  dp: 1 },
  { id: 'usdinr',  sym: 'INR=X',     name: 'USD/INR',               pillar: 'liquidity', unit: '₹', chg: 'pct',  dp: 2 },
  { id: 'usdcny',  sym: 'CNY=X',     name: 'USD/CNY',               pillar: 'liquidity', unit: '',  chg: 'pct',  dp: 3 },
  { id: 'usdjpy',  sym: 'JPY=X',     name: 'USD/JPY',               pillar: 'liquidity', unit: '',  chg: 'pct',  dp: 1 },
  { id: 'eurusd',  sym: 'EURUSD=X',  name: 'EUR/USD',               pillar: 'liquidity', unit: '',  chg: 'pct',  dp: 4 },
  { id: 'gold',    sym: 'GC=F',      name: 'Gold',                  pillar: 'risk',      unit: '$', chg: 'pct',  dp: 0 },
  { id: 'copper',  sym: 'HG=F',      name: 'Copper',                pillar: 'growth',    unit: '$', chg: 'pct',  dp: 2 },
  { id: 'brent',   sym: 'BZ=F',      name: 'Brent crude',           pillar: 'inflation', unit: '$', chg: 'pct',  dp: 1 },
  { id: 'btc',     sym: 'BTC-USD',   name: 'Bitcoin',               pillar: 'risk',      unit: '$', chg: 'pct',  dp: 0 },
  { id: 'hyg',     sym: 'HYG',       name: 'High-yield bonds (HYG)',pillar: 'liquidity', unit: '$', chg: 'pct',  dp: 2 },
  { id: 'ief',     sym: 'IEF',       name: '7–10y Treasuries (IEF)',pillar: 'liquidity', unit: '$', chg: 'pct',  dp: 2 },
  { id: 'eem',     sym: 'EEM',       name: 'MSCI EM (ETF)',         pillar: 'risk',      unit: '$', chg: 'pct',  dp: 2 },
  { id: 'urth',    sym: 'URTH',      name: 'MSCI World (ETF)',      pillar: 'risk',      unit: '$', chg: 'pct',  dp: 2 },
  { id: 'spy',     sym: 'SPY',       name: 'S&P 500 (SPY)',         pillar: 'risk',      unit: '$', chg: 'pct',  dp: 2, peOnly: true },
];

// Ratios built from two Yahoo series.
export const RATIOS = [
  { id: 'cugold', a: 'copper', b: 'gold', scale: 1000, name: 'Copper / gold ratio (×1000)', pillar: 'growth', chg: 'pct', dp: 2, note: 'Rises when markets price stronger industrial growth.' },
  { id: 'hygief', a: 'hyg', b: 'ief', scale: 1, name: 'High-yield vs Treasuries (HYG/IEF)', pillar: 'liquidity', chg: 'pct', dp: 3, note: 'Credit risk appetite. Falls when credit spreads widen.' },
  { id: 'emdm',   a: 'eem', b: 'urth', scale: 1, name: 'EM vs developed equities (EEM/URTH)', pillar: 'risk', chg: 'pct', dp: 3, note: 'Rises when emerging markets outperform.' },
];

// US Treasury daily par yield curves (nominal and TIPS real).
export const TREASURY = [
  { id: 'us3m',  curve: 'nominal', tenor: '3 Mo', name: 'US 3-month T-bill',  pillar: 'liquidity' },
  { id: 'us2y',  curve: 'nominal', tenor: '2 Yr', name: 'US 2-year yield',    pillar: 'liquidity' },
  { id: 'us10y', curve: 'nominal', tenor: '10 Yr', name: 'US 10-year yield',  pillar: 'liquidity' },
  { id: 'us30y', curve: 'nominal', tenor: '30 Yr', name: 'US 30-year yield',  pillar: 'liquidity' },
  { id: 'us10r', curve: 'real',    tenor: '10 Yr', name: 'US 10-year real yield (TIPS)', pillar: 'liquidity' },
  { id: 'us5r',  curve: 'real',    tenor: '5 Yr',  name: 'US 5-year real yield (TIPS)',  pillar: 'liquidity', hidden: true },
  { id: 'us5y',  curve: 'nominal', tenor: '5 Yr',  name: 'US 5-year yield', pillar: 'liquidity', hidden: true },
];
// Derived from the Treasury series (all in percentage points).
export const DERIVED = [
  { id: 'c2s10s', name: 'Yield curve 2s10s', of: ['us10y', 'us2y'], f: (a, b) => a - b, pillar: 'liquidity', note: '10-year minus 2-year. Negative = inverted.' },
  { id: 'c3m10y', name: 'Yield curve 3m10y', of: ['us10y', 'us3m'], f: (a, b) => a - b, pillar: 'liquidity', note: '10-year minus 3-month. The spread behind the New York Fed’s recession-probability model.' },
  { id: 'be10',   name: '10-year breakeven inflation', of: ['us10y', 'us10r'], f: (a, b) => a - b, pillar: 'inflation', note: 'Inflation priced by bond markets for the next 10 years.' },
  { id: 'be5y5y', name: '5y5y forward inflation', of: ['us10y', 'us10r', 'us5y', 'us5r'], f: (n10, r10, n5, r5) => 2 * (n10 - r10) - (n5 - r5), pillar: 'inflation', note: 'Inflation expected 5–10 years out. A market gauge the Fed watches for anchored expectations.' },
];

// BIS: headline CPI YoY (monthly) and central bank policy rates (daily).
export const COUNTRIES = [
  { code: 'US', name: 'United States', cb: 'Federal Reserve' },
  { code: 'XM', name: 'Euro area',     cb: 'ECB' },
  { code: 'GB', name: 'United Kingdom', cb: 'Bank of England' },
  { code: 'JP', name: 'Japan',         cb: 'Bank of Japan' },
  { code: 'CN', name: 'China',         cb: 'PBoC' },
  { code: 'IN', name: 'India',         cb: 'RBI' },
  { code: 'BR', name: 'Brazil',        cb: 'Banco Central do Brasil' },
];

// DBnomics mirrors of Fed and OECD releases.
export const DBNOMICS = [
  { id: 'fedassets', path: 'FED/H41/RESPPMA_N.WW', name: 'Fed balance sheet (total assets)', pillar: 'liquidity', scale: 1e-6, unit: '$tn', chg: 'pct', dp: 2, note: 'Weekly H.4.1. Rising = the Fed adding liquidity.' },
  { id: 'cli_g20', path: 'OECD/DSD_STES@DF_CLI/G20.M.LI.IX._Z.AA.IX._Z.H', name: 'OECD leading indicator — G20', pillar: 'growth', chg: 'diff', dp: 2, note: '100 = long-run trend. Above and rising = growth accelerating.' },
  { id: 'cli_us',  path: 'OECD/DSD_STES@DF_CLI/USA.M.LI.IX._Z.AA.IX._Z.H', name: 'OECD leading indicator — US', pillar: 'growth', chg: 'diff', dp: 2 },
  { id: 'cli_cn',  path: 'OECD/DSD_STES@DF_CLI/CHN.M.LI.IX._Z.AA.IX._Z.H', name: 'OECD leading indicator — China', pillar: 'growth', chg: 'diff', dp: 2 },
  { id: 'cli_in',  path: 'OECD/DSD_STES@DF_CLI/IND.M.LI.IX._Z.AA.IX._Z.H', name: 'OECD leading indicator — India', pillar: 'growth', chg: 'diff', dp: 2 },
];

// Optional FRED series (licensed ICE BofA spreads, Chicago Fed NFCI, Atlanta Fed GDPNow).
// Set FRED_API_KEY in Netlify → Site configuration → Environment variables (free key from fred.stlouisfed.org).
export const FRED = [
  { id: 'hyoas', series: 'BAMLH0A0HYM2', name: 'US high-yield credit spread', pillar: 'liquidity', unit: '%', chg: 'diff', dp: 2, note: 'ICE BofA HY option-adjusted spread.' },
  { id: 'igoas', series: 'BAMLC0A0CM',   name: 'US investment-grade credit spread', pillar: 'liquidity', unit: '%', chg: 'diff', dp: 2 },
  { id: 'nfci',  series: 'NFCI',         name: 'Chicago Fed financial conditions', pillar: 'liquidity', chg: 'diff', dp: 2, note: 'Below 0 = looser than average.' },
  { id: 'gdpnow',series: 'GDPNOW',       name: 'Atlanta Fed GDPNow (US, q/q saar)', pillar: 'growth', unit: '%', chg: 'diff', dp: 1 },
];

// Inputs with no reliable free daily feed. Update monthly (see README).
export const MANUAL = {
  india10y: { value: 7.32, asOf: '2026-11-16', name: 'India 10-year G-sec yield', source: 'CNBC quote feed (hand-entered fallback)' },
};

// Event calendar lives in lib/events.mjs.
export { EVENTS as CALENDAR, HORIZON } from './events.mjs';
