// Reference data for the Beyond Equities and Investment View tabs.
// Upkeep: MSCI weights (quarterly), IMF forecasts (April and October), India limits (when SEBI/RBI change them).

/* ---------------- Alternatives universe ----------------
   sym: price series (Yahoo) · etf: fund used for size, trading volume and yield · fut: [root, exchange, contract months] for the futures curve
   cot: [CFTC code, report, contract size] · cents: futures quoted in US cents
   exp: rough sensitivities used for "macro fit": g growth, i inflation, l liquidity/real rates falling, usd dollar, r risk appetite (−1…+1)
   model: how the 5-year expected return is built (see public/view.js)
   access: route for an Indian institution — dom = traded in India (NSE/BSE/MCX), cap = overseas only (MF feeder funds and
   ETFs within the industry caps, AIFs, GIFT City funds or LRS), none = no practical route */
export const ALTS = [
  { id: 'gold', access: 'dom', name: 'Gold', group: 'Precious metals', sym: 'GC=F', etf: 'GLD', fut: ['GC', 'CMX', 'GJMQVZ'], cot: ['088691', 'dis', 100], model: 'gold',
    exp: { g: 0, i: 0.5, l: 1, usd: -1, r: -0.5 }, role: 'Hedge against falling real rates, currency debasement and crises. No yield.', india: 'Gold ETFs on NSE/BSE; MCX futures' },
  { id: 'silver', access: 'dom', name: 'Silver', group: 'Precious metals', sym: 'SI=F', etf: 'SLV', fut: ['SI', 'CMX', 'HKNUZ'], cot: ['084691', 'dis', 5000], model: 'cmdty',
    exp: { g: 0.5, i: 0.5, l: 1, usd: -1, r: 0.5 }, role: 'Part precious, part industrial (solar, electronics). Roughly twice as volatile as gold.', india: 'Silver ETFs on NSE/BSE; MCX futures' },
  { id: 'platinum', access: 'cap', name: 'Platinum', group: 'Precious metals', sym: 'PL=F', etf: 'PPLT', fut: ['PL', 'NYM', 'FJNV'], cot: ['076651', 'dis', 50], model: 'cmdty',
    exp: { g: 0.5, i: 0.5, l: 0.5, usd: -1, r: 0.5 }, role: 'Industrial precious metal (autocatalysts, hydrogen). Small market.', india: 'No Indian ETF; overseas funds only' },
  { id: 'brent', access: 'dom', name: 'Brent crude', group: 'Energy', sym: 'BZ=F', etf: 'BNO', fut: ['BZ', 'NYM', 'FGHJKMNQUVXZ'], model: 'cmdty',
    exp: { g: 1, i: 1, l: 0, usd: -0.5, r: 0.5 }, role: 'Global oil benchmark. Hedges supply shocks and inflation surprises; hurts oil importers such as India.', india: 'MCX crude futures (WTI-linked)' },
  { id: 'wti', access: 'dom', name: 'WTI crude', group: 'Energy', sym: 'CL=F', etf: 'USO', fut: ['CL', 'NYM', 'FGHJKMNQUVXZ'], cot: ['067651', 'dis', 1000], model: 'cmdty',
    exp: { g: 1, i: 1, l: 0, usd: -0.5, r: 0.5 }, role: 'US oil benchmark; the CFTC data for crude positioning.', india: 'MCX crude futures' },
  { id: 'natgas', access: 'dom', name: 'US natural gas', group: 'Energy', sym: 'NG=F', etf: 'UNG', fut: ['NG', 'NYM', 'FGHJKMNQUVXZ'], cot: ['023651', 'dis', 10000], model: 'cmdty',
    exp: { g: 0.5, i: 1, l: 0, usd: 0, r: 0 }, role: 'Henry Hub gas: weather and LNG exports drive it. Among the most volatile commodities.', india: 'MCX natural gas futures' },
  { id: 'copper', access: 'dom', name: 'Copper', group: 'Industrial metals', sym: 'HG=F', etf: 'CPER', fut: ['HG', 'CMX', 'HKNUZ'], cot: ['085692', 'dis', 25000], model: 'cmdty',
    exp: { g: 1, i: 0.5, l: 0.5, usd: -1, r: 1 }, role: 'Bellwether for global industry and electrification (grids, EVs, data centres).', india: 'MCX copper futures' },
  { id: 'wheat', access: 'none', name: 'Wheat', group: 'Agriculture', sym: 'ZW=F', etf: 'WEAT', fut: ['ZW', 'CBT', 'HKNUZ'], cot: ['001602', 'dis', 5000], cents: true, model: 'cmdty',
    exp: { g: 0, i: 1, l: 0, usd: -0.5, r: 0 }, role: 'Food inflation; weather and Black Sea supply. Weakly linked to stocks.', india: 'Domestic wheat futures suspended by SEBI until March 2027' },
  { id: 'corn', access: 'none', name: 'Corn', group: 'Agriculture', sym: 'ZC=F', etf: 'CORN', fut: ['ZC', 'CBT', 'HKNUZ'], cot: ['002602', 'dis', 5000], cents: true, model: 'cmdty',
    exp: { g: 0, i: 1, l: 0, usd: -0.5, r: 0 }, role: 'Feed and biofuel demand; US weather.', india: 'Maize futures trade on NCDEX but are too thin for institutional size' },
  { id: 'bcom', access: 'cap', name: 'Broad commodities', group: 'Broad commodities', sym: 'DBC', etf: 'DBC', model: 'bcom',
    exp: { g: 1, i: 1, l: 0, usd: -0.5, r: 0.5 }, role: 'Diversified futures basket (energy-heavy). The standard inflation-hedge sleeve.', india: 'Overseas funds only' },
  { id: 'reitg', access: 'cap', name: 'Global REITs', group: 'Real estate', sym: 'REET', etf: 'REET', model: 'reit',
    exp: { g: 0.5, i: 0, l: 1, usd: -0.5, r: 0.5 }, role: 'Listed property worldwide: rent income with inflation-linked leases, but rate-sensitive.', india: 'Overseas fund of funds (within the MF cap), GIFT City or LRS' },
  { id: 'reitus', access: 'cap', name: 'US REITs', group: 'Real estate', sym: 'VNQ', etf: 'VNQ', model: 'reit',
    exp: { g: 0.5, i: 0, l: 1, usd: 0, r: 0.5 }, role: 'The deepest REIT market (data centres, towers, warehouses, housing).', india: 'Overseas fund of funds, GIFT City or LRS' },
  { id: 'reitin', access: 'dom', name: 'Indian REITs', group: 'Real estate', sym: 'EMBASSY.NS', etf: 'EMBASSY.NS', inr: true, model: 'reit',
    exp: { g: 0.5, i: 0, l: 1, usd: 0, r: 0.5 }, role: 'Grade-A offices let to global companies. Proxy: Embassy Office Parks REIT, India’s first listed REIT.', india: 'Six listed REITs on NSE/BSE: Embassy, Mindspace, Brookfield, Nexus, Knowledge Realty and Bagmane' },
  { id: 'infra', access: 'cap', name: 'Listed infrastructure', group: 'Real assets', sym: 'IGF', etf: 'IGF', model: 'infra',
    exp: { g: 0.5, i: 0.5, l: 0.5, usd: -0.5, r: 0 }, role: 'Utilities, toll roads, airports and pipelines: regulated, often inflation-linked cash flows.', india: 'InvITs on NSE/BSE for domestic exposure' },
  { id: 'tips', access: 'cap', name: 'US TIPS', group: 'Credit & income', sym: 'TIP', etf: 'TIP', model: 'tips',
    exp: { g: -0.5, i: 1, l: 1, usd: 0, r: -0.5 }, role: 'US government bonds indexed to CPI: locks in a real yield and hedges inflation surprises.', india: 'Overseas funds only' },
  { id: 'hy', access: 'cap', name: 'US high yield', group: 'Credit & income', sym: 'HYG', etf: 'HYG', model: 'hy',
    exp: { g: 1, i: -0.5, l: 1, usd: 0, r: 1 }, role: 'Sub-investment-grade corporate bonds: equity-like in sell-offs, bond-like otherwise.', india: 'Overseas funds only' },
  { id: 'emd', access: 'cap', name: 'EM sovereign debt (USD)', group: 'Credit & income', sym: 'EMB', etf: 'EMB', model: 'emd',
    exp: { g: 0.5, i: -0.5, l: 1, usd: -1, r: 1 }, role: 'Dollar bonds of emerging-market governments: Treasuries plus a spread for country risk.', india: 'Overseas funds only' },
  { id: 'pcredit', access: 'cap', name: 'Private credit (listed BDCs)', group: 'Private markets', sym: 'BIZD', etf: 'BIZD', model: 'bdc',
    exp: { g: 1, i: 0, l: 0.5, usd: 0, r: 1 }, role: 'Floating-rate loans to mid-sized US firms. Listed BDCs give a daily price that private funds do not show.', india: 'Category II AIFs (domestic private credit); overseas funds only for US' },
  { id: 'pe', access: 'cap', name: 'Private equity (listed)', group: 'Private markets', sym: 'PSP', etf: 'PSP', model: 'pe',
    exp: { g: 1, i: -0.5, l: 1, usd: 0, r: 1 }, role: 'Listed PE managers and holding companies: a liquid proxy with equity beta above 1.', india: 'Category I/II AIFs domestically' },
  { id: 'mf', access: 'cap', name: 'Managed futures (trend)', group: 'Hedge-fund strategies', sym: 'DBMF', etf: 'DBMF', model: 'none',
    exp: { g: 0, i: 0.5, l: 0, usd: 0, r: 0 }, role: 'Trend-following funds, long or short across futures markets. Their record years were 2008 and 2022, both equity bear markets.', india: 'Category III AIFs; overseas funds only' },
  { id: 'btc', access: 'none', name: 'Bitcoin', group: 'Digital assets', sym: 'BTC-USD', etf: 'IBIT', model: 'none',
    exp: { g: 0, i: 0, l: 1, usd: -0.5, r: 1 }, role: 'Scarce digital asset with no cash flows. Moves with global liquidity and risk appetite.', india: 'No SEBI-regulated product; gains taxed at 30% plus 1% TDS' },
  { id: 'eth', access: 'none', name: 'Ether', group: 'Digital assets', sym: 'ETH-USD', etf: 'ETHA', model: 'none',
    exp: { g: 0, i: 0, l: 1, usd: -0.5, r: 1 }, role: 'Native asset of the Ethereum network. Higher beta than bitcoin.', india: 'No SEBI-regulated product; gains taxed at 30% plus 1% TDS' },
];

/* ---------------- Core multi-asset building blocks ---------------- */
export const CORE = [
  { id: 'acwi', sym: 'ACWI', name: 'Global equities (MSCI ACWI)' },
  { id: 'dm', sym: 'URTH', name: 'Developed equities (MSCI World)' },
  { id: 'em', sym: 'EEM', name: 'Emerging equities (MSCI EM)' },
  { id: 'ust', sym: 'IEF', name: 'US Treasuries 7–10y' },
  { id: 'ig', sym: 'LQD', name: 'US investment grade' },
  { id: 'cash', sym: 'BIL', name: 'US T-bills (1–3 month)' },
  { id: 'dxy', sym: 'DX-Y.NYB', name: 'US dollar index' },
];

/* ---------------- Equity markets ----------------
   acwi: % of MSCI ACWI. US, Japan, UK, Canada, Switzerland from the MSCI World factsheet (30 Oct 2026) × the developed share of ACWI (88.8%);
   Taiwan, China, Korea, India, Brazil from the MSCI EM factsheet (30 Oct 2026) × the EM share (11.2%); approx = MSCI ACWI IMI breakdown (30 Jun 2026).
   g: IMF real GDP growth [2026, 2027, 2031]; old = values from the April 2025 WEO where the October 2026 tables did not list the country.
   tgt: central bank inflation target (long-run inflation anchor). fx: Yahoo symbol; inv = quoted as local currency per USD. */
export const EQUITY = [
  { code: 'US', name: 'United States', etf: 'SPY', grp: 'DM', bis: 'US', ccy: 'USD', fx: null, acwi: 64.63, g: [2.3, 2.3, 1.8], tgt: 2.0 },
  { code: 'JP', name: 'Japan', etf: 'EWJ', grp: 'DM', bis: 'JP', ccy: 'JPY', fx: ['JPY=X', true], acwi: 5.08, g: [0.7, 0.7, 0.6], tgt: 2.0 },
  { code: 'GB', name: 'United Kingdom', etf: 'EWU', grp: 'DM', bis: 'GB', ccy: 'GBP', fx: ['GBPUSD=X', false], acwi: 3.13, g: [1.3, 1.2, 1.4], old: [2], tgt: 2.0 },
  { code: 'CA', name: 'Canada', etf: 'EWC', grp: 'DM', bis: 'CA', ccy: 'CAD', fx: ['CAD=X', true], acwi: 3.06, g: [1.1, 1.7, 1.5], old: [2], tgt: 2.0 },
  { code: 'CH', name: 'Switzerland', etf: 'EWL', grp: 'DM', bis: 'CH', ccy: 'CHF', fx: ['CHF=X', true], acwi: 2.08, g: [1.6, 1.2, 1.8], old: [0, 1, 2], tgt: 1.0 },
  { code: 'FR', name: 'France', etf: 'EWQ', grp: 'DM', bis: 'XM', ccy: 'EUR', fx: ['EURUSD=X', false], acwi: 2.0, approx: true, g: [0.4, 0.7, 1.2], old: [2], tgt: 2.0 },
  { code: 'DE', name: 'Germany', etf: 'EWG', grp: 'DM', bis: 'XM', ccy: 'EUR', fx: ['EURUSD=X', false], acwi: 1.8, approx: true, g: [1.3, 1.1, 0.7], old: [2], tgt: 2.0 },
  { code: 'AU', name: 'Australia', etf: 'EWA', grp: 'DM', bis: 'AU', ccy: 'AUD', fx: ['AUDUSD=X', false], acwi: 1.5, approx: true, g: [2.1, 2.3, 2.3], old: [0, 1, 2], tgt: 2.5 },
  { code: 'IT', name: 'Italy', etf: 'EWI', grp: 'DM', bis: 'XM', ccy: 'EUR', fx: ['EURUSD=X', false], acwi: 0.71, approx: true, g: [0.8, 0.6, 0.7], old: [2], tgt: 2.0 },
  { code: 'TW', name: 'Taiwan', etf: 'EWT', grp: 'EM', bis: null, eer: 'TW', ccy: 'TWD', fx: ['TWD=X', true], acwi: 3.23, g: [2.5, 2.4, 2.1], old: [0, 1, 2], tgt: 2.0 },
  { code: 'CN', name: 'China', etf: 'MCHI', grp: 'EM', bis: 'CN', ccy: 'CNY', fx: ['CNY=X', true], acwi: 2.24, g: [4.5, 4.0, 3.3], tgt: 2.0 },
  { code: 'KR', name: 'South Korea', etf: 'EWY', grp: 'EM', bis: 'KR', ccy: 'KRW', fx: ['KRW=X', true], acwi: 2.2, g: [1.4, 2.1, 1.8], old: [0, 1, 2], tgt: 2.0 },
  { code: 'IN', name: 'India', etf: 'INDA', grp: 'EM', bis: 'IN', ccy: 'INR', fx: ['INR=X', true], acwi: 1.31, g: [7.0, 7.0, 6.8], tgt: 4.0 },
  { code: 'BR', name: 'Brazil', etf: 'EWZ', grp: 'EM', bis: 'BR', ccy: 'BRL', fx: ['BRL=X', true], acwi: 0.44, g: [2.2, 1.9, 2.5], tgt: 3.0 },
  { code: 'ZA', name: 'South Africa', etf: 'EZA', grp: 'EM', bis: 'ZA', ccy: 'ZAR', fx: ['ZAR=X', true], acwi: 0.37, approx: true, g: [1.0, 1.3, 1.8], old: [2], tgt: 3.0 },
  { code: 'MX', name: 'Mexico', etf: 'EWW', grp: 'EM', bis: 'MX', ccy: 'MXN', fx: ['MXN=X', true], acwi: 0.2, approx: true, g: [1.5, 1.8, 2.1], tgt: 3.0 },
  { code: 'ID', name: 'Indonesia', etf: 'EIDO', grp: 'EM', bis: 'ID', ccy: 'IDR', fx: ['IDR=X', true], acwi: 0.06, approx: true, g: [5.1, 5.1, 5.2], tgt: 2.5 },
];
export const MSCI = {
  asOf: '2026-10-30', dmShare: 88.82, emShare: 11.18,
  acwi: { pe: 20.82, fpe: 15.64, dy: 1.61 }, world: { pe: 22.29, fpe: 17.38, dy: 1.54 }, em: { pe: 13.68, dy: 2.19 },
  src: [
    { t: 'MSCI ACWI Index factsheet (30 Oct 2026)', u: 'https://www.msci.com/documents/10199/255599/msci-acwi-net.pdf' },
    { t: 'MSCI World Index factsheet (30 Oct 2026)', u: 'https://www.msci.com/documents/10199/178e6643-6ae6-47b9-82be-e1fc565ededb' },
    { t: 'MSCI Emerging Markets Index factsheet (30 Oct 2026)', u: 'https://www.msci.com/documents/10199/c0db0a48-01f2-4ba9-ad01-226fd5678111' },
    { t: 'MSCI ACWI IMI geographic breakdown (Jun 2026)', u: 'https://www.msci.com/downloads/web/msci-com/research-and-insights/video/acwi-imi-complete-geographic-breakdown/oct-2026/A%20Complete%20Geographic%20Breakdown%20of%20the%20MSCI%20ACWI%20IMI.pdf' },
  ],
};
export const IMF = {
  vintage: 'IMF World Economic Outlook, October 2026', oldVintage: 'IMF WEO April 2025 (country not in the October 2026 summary tables)',
  world: [3.1, 3.4, 3.1], dm: [2.1, 1.8, 1.5], em: [3.7, 4.4, 4.0],
  src: [
    { t: 'IMF WEO October 2026, Chapter 1 (Table 1.1)', u: 'https://www.imf.org/-/media/files/publications/weo/2026/october/english/ch1.pdf' },
    { t: 'IMF WEO October 2026, Statistical Appendix Table A', u: 'https://www.imf.org/-/media/files/publications/weo/2026/october/english/tablea.pdf' },
  ],
};

/* ---------------- Reference portfolios (strategic weights, %) ----------------
   Tactical tilts are applied on top: ±1 notch per arrow, capped at ±2 notches. Change the weights here. */
export const POLICY = {
  fii: { label: 'Foreign institution (USD)', ccy: 'USD', bench: 'MSCI ACWI country weights',
    sleeves: [['eq', 55], ['ust', 18], ['ig', 7], ['hy', 3], ['emd', 2], ['gold', 3], ['bcom', 2], ['reitg', 2], ['infra', 2], ['pcredit', 2], ['tips', 2], ['cash', 2]] },
  inr: { label: 'Indian institution investing globally (INR)', ccy: 'INR', bench: '85% India (Nifty 500) / 15% MSCI ACWI ex-India',
    homeShare: 0.85,
    sleeves: [['eq', 60], ['ingsec', 15], ['incorp', 7], ['ust', 2], ['gold', 7], ['reitin', 3], ['reitg', 1], ['bcom', 1], ['cash', 4]] },
};

/* ---------------- India: overseas investment limits (check current circulars before acting) ---------------- */
// Last checked against the cited sources. The regulator watch (lib/refdata) flags newer RBI/SEBI items that may change them.
export const LIMITS_VERIFIED = '2026-11-16';
export const INDIA_LIMITS = [
  { k: 'Mutual funds, industry cap', v: 'US$7 billion for overseas securities, plus a separate US$1 billion for overseas ETFs', note: 'Caps unchanged as of June 2026; several international schemes restrict inflows. AMFI is lobbying for a higher limit.', src: 'Business Today, 26 Jun 2026', u: 'https://www.businesstoday.in/mutual-funds/story/amfi-to-renew-push-for-higher-overseas-investment-cap-for-mutual-funds-539445-2026-06-26' },
  { k: 'Mutual funds, per fund house', v: 'Up to US$1 billion (overseas ETFs: US$300 million), within the industry caps', note: 'Set by SEBI in June 2021.', src: 'Business Standard, 3 Jun 2021', u: 'https://business-standard.com/article/economy-policy/sebi-increases-overseas-investment-cap-for-individual-mfs-to-1-bn-121060301305_1.html' },
  { k: 'AIFs and VCFs, industry cap', v: 'US$1.5 billion for overseas investment', note: 'Doubled from US$750 million in May 2021, after talks with the RBI.', src: 'Business Standard, 21 May 2021', u: 'https://business-standard.com/article/markets/sebi-doubles-aifs-overseas-investment-limit-to-1-5-bn-after-talks-with-rbi-121052101363_1.html' },
  { k: 'Resident individuals (LRS)', v: 'US$250,000 per person per financial year, across all purposes', note: 'TCS on investment remittances: nil up to ₹10 lakh a year, 20% above it (adjustable against tax).', src: 'INDmoney guide (2026)', u: 'https://www.indmoney.com/learn/us-stocks/what-is-lrs-liberalised-remittance-scheme' },
  { k: 'GIFT City (IFSC)', v: 'Funds set up in GIFT City can invest abroad outside the domestic MF cap; residents can invest in them under LRS', note: 'The usual route for large Indian allocations to global assets when the MF cap binds.', src: 'IFSCA', u: 'https://ifsca.gov.in' },
];

/* ---------------- Sources shown on the tabs ---------------- */
export const SOURCES = {
  prices: { t: 'Yahoo Finance (futures, ETFs, FX; weekly closes since 2016)', u: 'https://finance.yahoo.com' },
  cftc: { t: 'CFTC Commitments of Traders (disaggregated and financial futures reports)', u: 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm' },
  bis: { t: 'BIS: policy rates, CPI and real effective exchange rates', u: 'https://data.bis.org' },
  vanguard: { t: 'Vanguard (2012), “Dollar-cost averaging just means taking risk later” (summary: BenefitsPRO)', u: 'https://benefitspro.com/2012/10/31/lump-sum-investing-vs-dollar-cost-averaging' },
  erb: { t: 'Erb & Harvey (2013), “The Golden Dilemma”, NBER working paper 18706', u: 'https://www.nber.org/papers/w18706' },
  arnott: { t: 'Bernstein & Arnott (2003), “Earnings Growth: The Two Percent Dilution”, Financial Analysts Journal', u: 'https://rpc.cfainstitute.org/research/financial-analysts-journal/2003/earnings-growth-the-two-percent-dilution' },
};
