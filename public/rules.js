/* Global Markets Monitor — regime and alert rules.
   One copy, used by the dashboard (browser: window.PERules) and by the daily brief (server: globalThis.PERules),
   so the two can never disagree. Pure JavaScript: no DOM, no d3. */
(function (root) {
  'use strict';
  const fin = (v) => v != null && isFinite(v);
  const f1 = (v) => (fin(v) ? (+v).toFixed(1) : '—');
  const f2 = (v) => (fin(v) ? (+v).toFixed(2) : '—');
  const pctS = (v, d = 0) => (fin(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(d) + '%' : '—');
  const pp = (v) => (fin(v) && Math.abs(v) < 0.0005 ? 'flat' : pctS(v, fin(v) && Math.abs(v) < 0.1 ? 1 : 0));
  const bp = (v) => (fin(v) ? (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(0) + 'bp' : '—');
  const ord = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtD = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${+d} ${MON[+m - 1]} ${y}`; };
  const fmtV = (ind, v = ind.last) => {
    if (!fin(v)) return '—';
    const u = ind.unit || '', dp = ind.dp ?? 2;
    const n = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(dp);
    return u === '$' || u === '₹' ? u + n : u === '$tn' ? '$' + n + 'tn' : u === '%' ? n + '%' : u === 'pp' ? n + ' pp' : n;
  };
  const fmtChg = (ind, c) => {
    if (!fin(c)) return '—';
    if (ind.chgType === 'pct') return pctS(c, Math.abs(c) < 0.1 ? 1 : 0);
    if (ind.freq === 'monthly' && ind.unit === '%') return (c >= 0 ? '+' : '−') + Math.abs(c).toFixed(1) + 'pp';
    return ind.unit === '%' || ind.unit === 'pp' ? bp(c) : (c >= 0 ? '+' : '−') + Math.abs(c).toFixed(ind.dp ?? 1);
  };
  const sig = (v, up, dn, invert = false) => { if (!fin(v)) return null; const s = v > up ? 1 : v < dn ? -1 : 0; return invert ? -s : s; };
  const ma40 = (ind) => { const s = ind?.spark; if (!s || s.length < 30) return null; const p = s.slice(-40).map((x) => x[1]); return p.reduce((a, b) => a + b, 0) / p.length; };

  const PILLARS = [
    { k: 'growth', name: 'Growth', labels: ['Slowing', 'Stable', 'Improving'] },
    { k: 'inflation', name: 'Inflation', labels: ['Heating up', 'Sticky', 'Cooling'] },
    { k: 'liquidity', name: 'Liquidity', labels: ['Tightening', 'Neutral', 'Easing'] },
    { k: 'risk', name: 'Risk appetite', labels: ['Stressed', 'Normal', 'Calm'] },
    { k: 'valuation', name: 'Valuation', labels: ['Expensive', 'Fair', 'Cheap'] },
  ];
  const label = (P, score) => (score == null ? 'No data' : P.labels[score > 0.33 ? 2 : score < -0.33 ? 0 : 1]);

  // data: { macro, hist, global, markets, pos, n500pe }
  function create(data) {
    const I = data.macro?.indicators || {};
    const has = (id) => I[id] != null;
    const IDS = data.hist?.series ? Object.keys(data.hist.series) : [];
    const longPct = (id, w = '10y') => data.hist?.series?.[id]?.long?.percentiles?.[w]?.p ?? null;
    const glob = (name) => data.global?.markets?.find((m) => m.market === name);

    // Each rule scores +1 (good for risk assets), 0 or −1, with a plain-English reason.
    const RULES = {
      growth: [
        ['cugold', (i) => [sig(i.chg.q, 0.03, -0.03), `Copper/gold ${pp(i.chg.q)} over 3 months`]],
        ['copper', (i) => [sig(i.chg.q, 0.05, -0.05), `Copper ${pp(i.chg.q)} over 3 months`]],
        ['cli_g20', (i) => [i.last > 100 && i.chg.m > 0 ? 1 : i.last < 100 && i.chg.m < 0 ? -1 : 0, `G20 leading indicator ${f2(i.last)} and ${i.chg.m > 0 ? 'rising' : 'falling'} (${fmtD(i.asOf)})`]],
        ['cli_cn', (i) => [i.last > 100 && i.chg.m > 0 ? 1 : i.last < 100 && i.chg.m < 0 ? -1 : 0, `China leading indicator ${f2(i.last)} and ${i.chg.m > 0 ? 'rising' : 'falling'}`]],
        ['gdpnow', (i) => [sig(i.last, 2.5, 1), `US GDPNow ${f1(i.last)}%`]],
      ],
      inflation: [
        ['cpi_US', (i) => [sig(i.chg.q, 0.2, -0.2, true), `US CPI ${f1(i.last)}%, ${fmtChg(i, i.chg.q)} in 3 months`]],
        ['cpi_XM', (i) => [sig(i.chg.q, 0.2, -0.2, true), `Euro area CPI ${f1(i.last)}%, ${fmtChg(i, i.chg.q)} in 3 months`]],
        ['cpi_IN', (i) => [sig(i.chg.q, 0.3, -0.3, true), `India CPI ${f1(i.last)}%, ${fmtChg(i, i.chg.q)} in 3 months`]],
        ['be5y5y', (i) => [i.last > 2.7 ? -1 : i.last < 2.2 ? 1 : 0, `5y5y inflation expectations ${f2(i.last)}%`]],
        ['brent', (i) => [sig(i.chg.q, 0.15, -0.15, true), `Brent ${fmtV(i)}, ${pp(i.chg.q)} over 3 months`]],
      ],
      liquidity: [
        ['us10r', (i) => [sig(i.chg.q, 0.25, -0.25, true), `US real 10-year ${f2(i.last)}%, ${fmtChg(i, i.chg.q)} in 3 months`]],
        ['dxy', (i) => [sig(i.chg.q, 0.02, -0.02, true), `Dollar ${pp(i.chg.q)} over 3 months`]],
        ['fedassets', (i) => [sig(i.chg.q, 0.01, -0.01), `Fed balance sheet ${pp(i.chg.q)} over 3 months`]],
        ['pol_US', (i) => [sig(i.chg.q, 0.01, -0.01, true), `Fed funds ${f2(i.last)}%, ${fmtChg(i, i.chg.q)} in 3 months`]],
        ['hyoas', (i) => [i.chg.m > 0.5 ? -1 : i.chg.m < -0.25 ? 1 : 0, `High-yield spread ${f2(i.last)}%, ${fmtChg(i, i.chg.m)} in a month`]],
        ['hygief', (i) => (has('hyoas') ? [null, ''] : [sig(i.chg.m, 0.01, -0.02), `High-yield vs Treasuries ${pp(i.chg.m)} in a month`])],
        ['nfci', (i) => [i.last < -0.3 ? 1 : i.last > 0 ? -1 : 0, `Financial conditions index ${f2(i.last)}`]],
      ],
      risk: [
        ['vix', (i) => [i.last < 16 ? 1 : i.last > 22 ? -1 : 0, `VIX ${f1(i.last)}`]],
        ['move', (i) => [i.last < 90 ? 1 : i.last > 120 ? -1 : 0, `MOVE ${f1(i.last)}`]],
        ['spx', (i) => { const m = ma40(i); return [m == null ? null : i.last > m ? 1 : -1, `S&P 500 ${i.last > m ? 'above' : 'below'} its 40-week average`]; }],
        ['indiavix', (i) => [i.last < 13 ? 1 : i.last > 20 ? -1 : 0, `India VIX ${f1(i.last)}`]],
        ['emdm', (i) => [sig(i.chg.q, 0.03, -0.03), `EM vs developed equities ${pp(i.chg.q)} over 3 months`]],
      ],
    };

    function erp() {
      const out = [], spy = glob('United States'), r10 = I.us10r;
      if (spy?.livePE && r10) out.push({ id: 'us', name: 'United States', pe: spy.livePE, peSrc: 'S&P 500 ETF trailing PE', ey: 100 / spy.livePE, real: r10.last, realSrc: `US 10-year TIPS ${f2(r10.last)}%` });
      const m = data.macro?.manual?.india10y, cpi = I.cpi_IN, pe = data.n500pe;
      if (pe && m && cpi) out.push({ id: 'in', name: 'India (Nifty 500)', pe, peSrc: 'NSE trailing PE', ey: 100 / pe, real: m.value - cpi.last, realSrc: `10y G-sec ${f2(m.value)}% (${fmtD(m.asOf)}) − CPI ${f1(cpi.last)}%` });
      for (const e of out) e.erp = e.ey - e.real;
      return out;
    }
    function valuationRules() {
      const r = [];
      for (const e of erp()) r.push({ s: e.erp > 3 ? 1 : e.erp < 1.5 ? -1 : 0, why: `${e.name} equity risk premium ${f2(e.erp)}%` });
      for (const id of ['n500', 'small']) { const p = longPct(id); if (p != null) r.push({ s: p < 0.3 ? 1 : p > 0.7 ? -1 : 0, why: `${data.hist.series[id].name} PE at ${ord(Math.round(p * 100))} pctl of 10 years` }); }
      for (const name of ['Global (All-country)', 'Emerging markets']) { const g = glob(name); if (g?.vsAvg5 != null) r.push({ s: g.vsAvg5 > 0.1 ? -1 : g.vsAvg5 < -0.1 ? 1 : 0, why: `${name} PE ${pctS(g.vsAvg5)} vs 5-year average` }); }
      return r;
    }
    function pillar(k) {
      const rows = k === 'valuation' ? valuationRules() : RULES[k].filter(([id]) => has(id)).map(([id, f]) => { const [s, why] = f(I[id]); return { s, why, id }; }).filter((x) => x.s != null);
      const score = rows.length ? rows.reduce((a, b) => a + b.s, 0) / rows.length : null;
      const P = PILLARS.find((p) => p.k === k);
      return { rows, score, label: label(P, score), cls: score == null ? 'neutral' : score > 0.33 ? 'good' : score < -0.33 ? 'bad' : 'neutral' };
    }

    function alerts() {
      const A = [], i = I;
      const add = (id, name, on, now, rule) => A.push({ id, name, on: !!on, now, rule });
      if (i.vix) add('vix', 'Equity volatility spike', i.vix.last > 25, `VIX ${f1(i.vix.last)}`, 'VIX above 25');
      if (i.move) add('move', 'Bond volatility spike', i.move.last > 120, `MOVE ${f1(i.move.last)}`, 'MOVE above 120');
      if (i.c2s10s) { const was = i.c2s10s.last - (i.c2s10s.chg.q ?? 0); add('curve', 'Yield curve un-inverting', i.c2s10s.last > 0 && was < 0, `2s10s ${f2(i.c2s10s.last)} pp (3 months ago ${f2(was)})`, '2s10s turns positive after inversion'); }
      if (i.us10r) add('real', 'Restrictive real yields', i.us10r.last > 2.5, `US real 10y ${f2(i.us10r.last)}%`, 'Real 10-year above 2.5%');
      if (i.dxy) add('dxy', 'Dollar surge', i.dxy.chg.m > 0.03, `DXY ${pp(i.dxy.chg.m)} in a month`, 'Dollar up more than 3% in a month');
      if (i.brent) add('oil', 'Oil shock', i.brent.chg.m > 0.15, `Brent ${pp(i.brent.chg.m)} in a month`, 'Brent up more than 15% in a month');
      if (i.hyoas) add('credit', 'Credit stress', i.hyoas.chg.m > 1, `HY spread ${fmtChg(i.hyoas, i.hyoas.chg.m)} in a month`, 'High-yield spread up 100bp in a month');
      else if (i.hygief) add('credit', 'Credit stress (proxy)', i.hygief.chg.m < -0.03, `HYG/IEF ${pp(i.hygief.chg.m)} in a month`, 'High-yield underperforms Treasuries by 3% in a month');
      if (i.cugold) add('growth', 'Growth scare', i.cugold.chg.q < -0.1, `Copper/gold ${pp(i.cugold.chg.q)} in 3 months`, 'Copper/gold down more than 10% in 3 months');
      if (i.cpi_US) add('uscpi', 'US inflation re-accelerating', i.cpi_US.chg.q > 0.5, `US CPI ${f1(i.cpi_US.last)}% (${fmtChg(i.cpi_US, i.cpi_US.chg.q)} in 3m)`, 'US CPI up 0.5pp in 3 months');
      if (i.usdinr) add('inr', 'Rupee under pressure', i.usdinr.chg.m > 0.02, `USD/INR ${pp(i.usdinr.chg.m)} in a month`, 'USD/INR up more than 2% in a month');
      const fl = data.macro?.flows ? Object.entries(data.macro.flows).sort() : [];
      if (fl.length) { const l5 = fl.slice(-5); add('fii', 'Persistent FII selling', l5.length === 5 && l5.every(([, v]) => v.fii < 0), `${l5.filter(([, v]) => v.fii < 0).length} of last ${l5.length} sessions net selling`, 'FIIs net sellers 5 sessions in a row'); }
      for (const id of IDS) { const p = longPct(id); if (p != null) add('pe-' + id, `${data.hist.series[id].name} stretched`, p > 0.9, `${ord(Math.round(p * 100))} pctl of 10y PE`, 'Above 90th percentile of 10-year PE'); }
      for (const e of erp()) add('erp-' + e.id, `${e.name}: thin equity premium`, e.erp < 1.5, `ERP ${f2(e.erp)}%`, 'Equity risk premium below 1.5%');
      const m = data.macro?.manual?.india10y; if (m && i.us10y) add('gap', 'India–US yield gap narrow', m.value - i.us10y.last < 2, `${f2(m.value - i.us10y.last)} pp`, 'India 10y minus US 10y below 2pp');
      // Rate path (fed funds futures)
      const rp = data.markets?.ratePath;
      if (rp?.meetings?.length) {
        const nx = rp.meetings[0];
        add('fedmove', 'Fed move priced for next meeting', Math.abs(nx.change) >= 0.15, `${fmtD(nx.date)}: ${nx.change >= 0 ? '+' : '−'}${Math.abs(nx.change * 100).toFixed(0)}bp priced`, 'Futures price a move of 15bp or more at the next FOMC');
        add('fedrepricing', 'Big Fed repricing', fin(rp.chg1m) && Math.abs(rp.chg1m) >= 0.25, `12-month path ${bp(rp.chg1m)} vs a month ago`, 'Rate expectations move 25bp or more in a month');
      }
      // Positioning extremes and hedging
      for (const c of data.pos?.cftc || []) {
        if (c.pct3y == null) continue;
        add('cot-' + c.id, `Crowded positioning: ${c.name}`, c.pct3y > 0.95 || c.pct3y < 0.05, `${c.who} net ${pctS(c.net, 0)} of open interest (${ord(Math.round(c.pct3y * 100))} pctl of 3y)`, 'Speculative positioning beyond 5th or 95th percentile of 3 years');
      }
      const sb = data.pos?.corr?.stockBond;
      if (sb) add('stockbond', 'Bonds not hedging equities', sb.last > 0.3, `S&P 500 vs Treasuries correlation ${f2(sb.last)} (26 weeks)`, 'Stock–bond correlation above +0.3');
      return A;
    }
    return { PILLARS, pillar, alerts, erp, longPct, label: (k, s) => label(PILLARS.find((p) => p.k === k), s) };
  }
  root.PERules = { create, PILLARS, helpers: { f1, f2, pctS, pp, bp, ord, fmtD, fmtV, fmtChg, sig, ma40 } };
})(typeof window !== 'undefined' ? window : globalThis);
