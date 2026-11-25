// Indian indices tracked by the app.
// nse: name in NSE's allIndices feed · slug: indexpe.in page.
export const INDICES = [
  { id: 'n50',   name: 'Nifty 50',           tier: 'Large cap',    nse: 'NIFTY 50',           slug: 'nifty-50' },
  { id: 'n500',  name: 'Nifty 500',          tier: 'Broad market', nse: 'NIFTY 500',          slug: 'nifty-500' },
  { id: 'mid',   name: 'Nifty Midcap 150',   tier: 'Mid cap',      nse: 'NIFTY MIDCAP 150',   slug: 'nifty-midcap-150' },
  { id: 'small', name: 'Nifty Smallcap 250', tier: 'Small cap',    nse: 'NIFTY SMALLCAP 250', slug: 'nifty-smallcap-250' },
  { id: 'micro', name: 'Nifty Microcap 250', tier: 'Micro cap',    nse: 'NIFTY MICROCAP 250', slug: 'nifty-microcap-250' },
];

// Global markets. etf = iShares/SPDR ETF whose trailing PE is the live proxy.
// Siblis Research trailing PE (aggregate mcap / aggregate TTM net income, common currency):
// month-end reading and Dec 2021–Dec 2025 year-ends. null = not published.
export const SIBLIS_ASOF = '2026-10-31';
export const MARKETS = [
  { market: 'Global (All-country)', group: 'Aggregate', etf: 'ACWI', siblis: 21.09, ye: [20.76, 16.19, 20.00, 21.61, 23.12] },
  { market: 'Developed markets',    group: 'Aggregate', etf: 'URTH', siblis: 22.59, ye: [22.67, 17.18, 21.18, 22.67, 24.49] },
  { market: 'Emerging markets',     group: 'Aggregate', etf: 'EEM',  siblis: 13.84, ye: [14.02, 12.18, 14.67, 15.13, 16.98] },
  { market: 'United States',  group: 'Developed', etf: 'SPY', siblis: 25.75, ye: [26.14, 18.55, 21.79, 24.61, 25.38] },
  { market: 'Japan',          group: 'Developed', etf: 'EWJ', siblis: 18.06, ye: [16.19, 13.87, 16.40, 15.72, 17.88] },
  { market: 'Canada',         group: 'Developed', etf: 'EWC', siblis: 20.69, ye: [18.82, 12.53, 15.15, 19.36, 20.53] },
  { market: 'Germany',        group: 'Developed', etf: 'EWG', siblis: 17.46, ye: [15.31, 12.50, 14.91, 15.04, 18.93] },
  { market: 'France',         group: 'Developed', etf: 'EWQ', siblis: 16.67, ye: [22.02, 14.72, 13.48, 14.09, 17.79] },
  { market: 'United Kingdom', group: 'Developed', etf: 'EWU', siblis: 14.87, ye: [17.10, 13.88, 10.51, 12.85, 14.87] },
  { market: 'Italy',          group: 'Developed', etf: 'EWI', siblis: 14.72, ye: [17.69, 10.62, 6.94, 8.69, 13.53] },
  { market: 'Australia',      group: 'Developed', etf: 'EWA', siblis: 20.15, ye: null },
  { market: 'Switzerland',    group: 'Developed', etf: 'EWL', siblis: null,  ye: null },
  { market: 'India',          group: 'Emerging',  etf: 'INDA', siblis: 20.70, ye: [24.11, 22.13, 23.22, 23.96, 23.83] },
  { market: 'China',          group: 'Emerging',  etf: 'MCHI', siblis: 15.84, ye: [15.45, 13.24, 12.82, 15.29, 18.06] },
  { market: 'Brazil',         group: 'Emerging',  etf: 'EWZ',  siblis: 10.06, ye: [6.80, 5.69, 8.72, 8.07, 11.45] },
  { market: 'Taiwan',         group: 'Emerging',  etf: 'EWT',  siblis: 25.65, ye: null },
  { market: 'South Korea',    group: 'Emerging',  etf: 'EWY',  siblis: 10.40, ye: null },
  { market: 'Mexico',         group: 'Emerging',  etf: 'EWW',  siblis: 14.33, ye: null },
  { market: 'South Africa',   group: 'Emerging',  etf: 'EZA',  siblis: 11.99, ye: null },
  { market: 'Indonesia',      group: 'Emerging',  etf: 'EIDO', siblis: 9.52,  ye: null },
];
export const YEAR_ENDS = ['Dec-21', 'Dec-22', 'Dec-23', 'Dec-24', 'Dec-25'];

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
