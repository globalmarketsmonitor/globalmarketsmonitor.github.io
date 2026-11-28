/* Global Markets Monitor — Investment View and Beyond Equities engine.
   One copy, used by the dashboard (window.PEView) and by the daily brief (globalThis.PEView).
   Pure JavaScript: no DOM. Every call is rules-based and shows its inputs; nothing here is investment advice.

   Scores run from −1 to +1. Arrows: ▲▲ ≥ 0.45 · ▲ ≥ 0.15 · ● · ▼ ≤ −0.15 · ▼▼ ≤ −0.45.
   Tactical (3–12 months) and strategic (3–5 years) views are built separately. */
(function (root) {
  'use strict';
  const fin = (v) => v != null && isFinite(v);
  const clamp = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));
  const th = (x, s) => (fin(x) ? Math.tanh(x / s) : null);
  const avg = (a) => { const b = a.filter(fin); return b.length ? b.reduce((s, x) => s + x, 0) / b.length : null; };
  const sum = (a) => a.reduce((s, x) => s + (fin(x) ? x : 0), 0);
  const pc = (v, d = 0) => (fin(v) ? (v > 0.00005 ? '+' : v < -0.00005 ? '−' : '') + Math.abs(v * 100).toFixed(d) + '%' : '—');
  const pu = (v, d = 1) => (fin(v) ? (v * 100).toFixed(d) + '%' : '—');
  const p2 = (v, d = 2) => (fin(v) ? (+v).toFixed(d) + '%' : '—');
  const ord = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const pctl = (p) => (fin(p) ? ord(Math.round(p * 100)) + ' pctl' : '—');
  const usd = (v) => (fin(v) ? (Math.abs(v) >= 1e12 ? '$' + (v / 1e12).toFixed(1) + 'tn' : Math.abs(v) >= 1e9 ? '$' + (v / 1e9).toFixed(1) + 'bn' : Math.abs(v) >= 1e6 ? '$' + Math.round(v / 1e6) + 'm' : '$' + Math.round(v).toLocaleString('en-US')) : '—');
  const usdS = (v) => (fin(v) ? (v >= 0 ? '+' : '−') + usd(Math.abs(v)) : '—');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtD = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return d ? `${+d} ${MON[+m - 1]} ${y}` : `${MON[+m - 1]} ${y}`; };
  const ARROWS = ['▼▼', '▼', '●', '▲', '▲▲'];
  // Route for an Indian institution (used in the INR lens only).
  const ACCESS = { dom: 'In India', cap: 'Overseas · capped', none: 'No practical route' };
  const VIEWS = { '-2': 'Strong underweight', '-1': 'Underweight', '0': 'Neutral', '1': 'Overweight', '2': 'Strong overweight' };
  const notchOf = (s) => (!fin(s) ? 0 : s >= 0.45 ? 2 : s >= 0.15 ? 1 : s > -0.15 ? 0 : s > -0.45 ? -1 : -2);

  // Weighted average of the signals that have data, with a confidence grade.
  function combine(parts, { forceLow = false, minCover = 0.3 } = {}) {
    const live = parts.filter((p) => fin(p.s));
    const W = sum(parts.map((p) => p.w)), w = sum(live.map((p) => p.w));
    if (!live.length || w / W < minCover) return { score: null, notch: 0, arrow: '–', view: 'No view', conf: 'Low', parts };
    let score = sum(live.map((p) => p.w * clamp(p.s))) / w;
    if (w / W < 0.6 || forceLow) score = clamp(score, -0.44, 0.44); // thin evidence: at most one notch
    const agree = sum(live.filter((p) => Math.abs(p.s) >= 0.1 && Math.sign(p.s) === Math.sign(score)).map((p) => p.w)) / w;
    const conf = forceLow || w / W < 0.6 || (Math.abs(score) >= 0.15 && agree < 0.45) ? 'Low' : agree >= 0.65 && Math.abs(score) >= 0.3 ? 'High' : 'Medium';
    const notch = notchOf(score);
    return { score, notch, arrow: ARROWS[notch + 2], view: VIEWS[notch], conf, parts, coverage: w / W };
  }
  // The strongest reasons behind a score, in words.
  const why = (res, n = 2) => (res?.parts || []).filter((p) => fin(p.s) && Math.abs(p.s) >= 0.15 && Math.sign(p.s) === Math.sign(res.score || 0)).sort((a, b) => b.w * Math.abs(b.s) - a.w * Math.abs(a.s)).slice(0, n);
  const against = (res) => (res?.parts || []).filter((p) => fin(p.s) && Math.abs(p.s) >= 0.15 && Math.sign(p.s) !== Math.sign(res.score || 0)).sort((a, b) => b.w * Math.abs(b.s) - a.w * Math.abs(a.s))[0] || null;

  function create(D, lens = 'fii') {
    const R = D.research || {}, A = R.assets || {}, C = R.config || {}, I = D.macro?.indicators || {};
    const rules = root.PERules && D.macro ? root.PERules.create({ macro: D.macro, hist: D.hist, global: D.global, markets: D.markets, pos: D.pos, n500pe: D.n500pe }) : null;
    const pil = Object.fromEntries(['growth', 'inflation', 'liquidity', 'risk', 'valuation'].map((k) => [k, rules?.pillar(k) || { score: null, label: 'No data' }]));
    const INR = lens === 'inr', CCY = INR ? 'INR' : 'USD';
    const perf = (a) => (a ? (INR ? a.inr : a.usd) : null);
    const pol = R.bis?.policy || {}, cpi = R.bis?.cpi || {}, reer = R.bis?.reer || {};
    const G = (name) => (D.global?.markets || []).find((m) => m.market === name);
    // Weekly USD total-return series (R.spark from R.sparkFrom). Price ratio between two dates strips accrued distributions.
    const SPK0 = R.sparkFrom ? Date.parse(R.sparkFrom) : null;
    const trAt = (a, d) => { if (!SPK0 || !a?.spark) return null; const t = Date.parse(d), dw = (new Date(t).getUTCDay() + 6) % 7, i = Math.round((t - dw * 864e5 - SPK0) / (7 * 864e5)); return i >= 0 && i < a.spark.length ? a.spark[i] : null; };
    const priceRatio = (a, d1, d2) => { const x1 = trAt(a, d1), x2 = trAt(a, d2); if (!fin(x1) || !fin(x2)) return null; return x2 / x1 / (1 + (fin(a.dist) ? a.dist : 0) * ((Date.parse(d2) - Date.parse(d1)) / (365 * 864e5))); };
    const IMFY = C.imfYears || [2026, 2027, 2031];

    /* ---------- anchors: cash, inflation, currencies ---------- */
    const usCash = fin(I.us3m?.last) ? I.us3m.last / 100 : fin(pol.US?.last) ? pol.US.last / 100 : 0.04;
    const inCash = fin(pol.IN?.last) ? pol.IN.last / 100 : fin(I.pol_IN?.last) ? I.pol_IN.last / 100 : 0.055;
    const infUS = fin(I.be10?.last) ? I.be10.last / 100 : 0.025, infIN = 0.04;
    const cashRealUSD = usCash - infUS, cashRealINR = inCash - infIN;
    const cash = INR ? inCash : usCash, cashReal = INR ? cashRealINR : cashRealUSD;
    // Real exchange rates drift back halfway to their 10-year average over five years.
    const fxRev = (code) => { const r = reer[code]; return r?.last && r?.avg10 ? (r.last / r.avg10) ** -0.1 - 1 : 0; };
    const usdRev = fxRev('US'), inrRev = fxRev('IN');
    const lensFxUSD = INR ? usdRev - inrRev : 0; // added to real returns of dollar assets in the rupee lens
    const yieldOf = (a) => (fin(a?.dist) && a.dist > 0 ? a.dist : fin(a?.etf?.yield) && a.etf.yield > 0 ? a.etf.yield : null);
    const accDown = A.acwi?.cond?.eqDown?.avg;
    function divers(a) {
      const d = a?.cond?.eqDown?.avg; if (!fin(d) || !fin(accDown) || accDown >= 0) return { s: null, t: 'No stress history' };
      const cap = d / accDown;
      return { s: clamp(1 - 2 * cap), t: `Worst 10% of weeks for global stocks: ${pc(d, 1)} on average (global stocks ${pc(accDown, 1)})` };
    }
    const dxy3m = A.dxy?.usd?.r3m;
    const regimeWord = { growth: () => pil.growth.label, inflation: () => pil.inflation.label, liquidity: () => pil.liquidity.label, 'risk appetite': () => pil.risk.label, dollar: () => `dollar ${pc(dxy3m, 1)} in 3 months` };
    function macroFit(e) {
      if (!e) return { s: null, t: 'No macro link' };
      const terms = [];
      const add = (x, p, name) => { if (x && fin(p)) terms.push([x * p, Math.abs(x), name]); };
      add(e.g, pil.growth.score, 'growth'); add(e.i, fin(pil.inflation.score) ? -pil.inflation.score : null, 'inflation');
      add(e.l, pil.liquidity.score, 'liquidity'); add(e.r, pil.risk.score, 'risk appetite'); add(e.usd, th(dxy3m, 0.04), 'dollar');
      const w = sum(terms.map((x) => x[1])); if (!w) return { s: null, t: 'Regime data unavailable' };
      const s = sum(terms.map((x) => x[0])) / w, top = [...terms].sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]))[0];
      return { s, t: `${s > 0.15 ? 'Fits' : s < -0.15 ? 'Fights' : 'Neutral to'} today’s regime; biggest factor: ${top[2]} (${regimeWord[top[2]]()})` };
    }
    const trendPart = (pf, w = 0.2) => ({ k: 'trend', name: 'Trend', w, s: pf && fin(pf.mom) && fin(pf.trend) ? 0.5 * th(pf.mom, 0.15) + 0.5 * th(pf.trend, 0.05) : null, t: pf ? `12-month momentum ${pc(pf.mom)}; price ${pc(pf.trend)} vs its 40-week average` : 'No price history' });

    /* ---------- equity markets ---------- */
    const acwiG = G('Global (All-country)');
    const hs = D.hist?.series || {}, n500 = hs.n500;
    const n500pe = D.n500pe ?? n500?.pe?.at(-1), n500med = n500?.long?.medians?.pe?.['10y'], n500pct = rules?.longPct('n500');
    const n500dy = D.live?.indices?.n500?.dy ?? n500?.dy?.at(-1);
    const epsIN = (() => { const e = n500?.eps, d = n500?.d; if (!e?.length) return null; const last = e.at(-1), cut = new Date(Date.parse(d.at(-1)) - 365 * 864e5).toISOString().slice(0, 10); let i = d.findIndex((x) => x >= cut); return i >= 0 && e[i] ? last / e[i] - 1 : null; })();
    const fxA = (sym) => A['fx_' + sym];
    const localVsUsd3m = (e) => { if (!e.fx) return 0; const f = fxA(e.fx[0])?.usd?.r3m; return fin(f) ? (e.fx[1] ? 1 / (1 + f) - 1 : f) : null; };
    const inr3m = A['fx_INR=X']?.usd?.r3m; // USD/INR change (+ = rupee weaker)
    const equity = (C.equity || []).map((e) => {
      const a = A['eq_' + e.code], g = G(e.name), pf = perf(a), eer = e.eer || e.bis;
      // Valuation
      const v = [], vt = [];
      if (fin(g?.vsAvg5)) { v.push(th(-g.vsAvg5, 0.15)); vt.push(`PE ${g.siblisPE.toFixed(1)}x vs 5-year average ${g.avg5.toFixed(1)}x`); }
      if (g?.yearEnds?.every(fin) && acwiG?.yearEnds?.every(fin) && fin(g.siblisPE) && fin(acwiG.siblisPE)) {
        const relNow = g.siblisPE / acwiG.siblisPE, relAvg = avg(g.yearEnds.map((x, i) => x / acwiG.yearEnds[i]));
        v.push(th(-(relNow / relAvg - 1), 0.15)); vt.push(`${relNow >= relAvg ? 'premium' : 'discount'} to world PE ${pc(relNow - 1)} vs usual ${pc(relAvg - 1)}`);
      }
      if (e.code === 'IN' && fin(n500pct)) { v.push((0.5 - n500pct) * 2); vt.push(`Nifty 500 PE ${fin(n500pe) ? n500pe.toFixed(1) + 'x, ' : ''}${pctl(n500pct)} of 10 years`); }
      if (!v.length && fin(g?.siblisPE)) {
        const peers = (D.global?.markets || []).filter((m) => m.group === (e.grp === 'DM' ? 'Developed' : 'Emerging') && fin(m.siblisPE)).map((m) => m.siblisPE).sort((x, y) => x - y);
        const med = peers[Math.floor(peers.length / 2)]; if (med) { v.push(th(-(g.siblisPE / med - 1), 0.25)); vt.push(`PE ${g.siblisPE.toFixed(1)}x vs ${e.grp} median ${med.toFixed(1)}x (no history)`); }
      }
      if (fin(a?.real?.zDet)) { v.push(-th(a.real.zDet, 1.5)); vt.push(`real total return ${pc(a.real.vsTrend)} vs its 10-year trend`); }
      // Earnings momentum
      let eps = null, epsT = 'No earnings history';
      if (e.code === 'IN' && fin(epsIN)) { eps = th(epsIN - 0.1, 0.1); epsT = `Nifty 500 trailing EPS ${pc(epsIN)} over 12 months (INR)`; }
      else if (fin(g?.siblisPE) && g?.siblisAsOf && D.global?.yearEndYears) {
        // EPS growth implied by price and PE measured on the same dates: from the latest year-end at least 60 days before the PE reading.
        const yrs = D.global.yearEndYears; let k = yrs.length - 1;
        while (k >= 0 && Date.parse(g.siblisAsOf) - Date.UTC(yrs[k], 11, 31) < 60 * 864e5) k--;
        const peYE = k >= 0 ? g.yearEnds?.[k] : null, pr = k >= 0 ? priceRatio(a, `${yrs[k]}-12-31`, g.siblisAsOf) : null;
        if (fin(peYE) && fin(pr)) { const gr = pr / (g.siblisPE / peYE) - 1, mo = Math.round((Date.parse(g.siblisAsOf) - Date.UTC(yrs[k], 11, 31)) / (30.44 * 864e5)); eps = th(gr * (12 / Math.max(mo, 3)) - 0.06, 0.1); epsT = `Trailing EPS ${pc(gr)} from Dec ${yrs[k]} to ${new Date(g.siblisAsOf + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} (${mo} months, USD, implied from price and PE)`; }
      }
      // Policy
      const b = e.bis ? pol[e.bis] : null, ci = e.bis ? cpi[e.bis] : null;
      let polS = null, polT = 'No policy-rate data';
      if (b) { const real = fin(ci?.last) ? b.last - ci.last : null; polS = 0.6 * -th(b.chg6m ?? 0, 0.5) + (fin(real) ? 0.4 * -th(real - 1.5, 2) : 0); polT = `Policy rate ${p2(b.last)} (${b.chg6m > 0 ? 'hiked' : b.chg6m < 0 ? 'cut' : 'unchanged'} over 6 months${fin(b.chg6m) && b.chg6m ? ' ' + (b.chg6m > 0 ? '+' : '−') + Math.abs(b.chg6m * 100).toFixed(0) + 'bp' : ''})${fin(real) ? `; real rate ${p2(real, 1)}` : ''}`; }
      // Currency
      let fxS = null, fxT = 'Home currency';
      const z = reer[eer]?.z10;
      if (!INR && e.code !== 'US') { const m3 = localVsUsd3m(e); fxS = (fin(z) ? 0.6 * -th(z, 1.5) : 0) + (fin(m3) ? 0.4 * th(m3, 0.05) : 0); fxT = `${e.ccy} real exchange rate ${fin(z) ? (z < -0.5 ? 'cheap' : z > 0.5 ? 'expensive' : 'near average') + ` (${pctl(reer[eer].pct10)} of 10y)` : 'n/a'}; ${pc(m3, 1)} vs USD in 3 months`; }
      if (INR && e.code !== 'IN') { const zi = reer.IN?.z10, m3 = localVsUsd3m(e), x3 = fin(m3) && fin(inr3m) ? (1 + m3) * (1 + inr3m) - 1 : null; fxS = (fin(z) && fin(zi) ? 0.6 * -th(z - zi, 1.5) : 0) + (fin(x3) ? 0.4 * th(x3, 0.05) : 0); fxT = `${e.ccy} vs INR: ${pc(x3, 1)} in 3 months; real value ${fin(z) && fin(zi) ? (z - zi > 0.5 ? 'rich' : z - zi < -0.5 ? 'cheap' : 'fair') : 'n/a'} relative to the rupee`; }
      // Growth (IMF): acceleration
      const gr = e.g ? 0.5 * th(e.g[1] - e.g[0], 0.8) + 0.5 * th(e.g[1] - e.g[2], 0.8) : null;
      const tac = combine([
        { k: 'value', name: 'Valuation', w: 0.3, s: avg(v), t: vt.join('; ') || 'No valuation data' },
        { k: 'eps', name: 'Earnings', w: 0.15, s: eps, t: epsT },
        trendPart(pf, 0.15),
        { k: 'policy', name: 'Policy', w: 0.15, s: polS, t: polT },
        { k: 'fx', name: 'Currency', w: 0.15, s: fxS, t: fxT },
        { k: 'growth', name: 'Growth', w: 0.1, s: gr, t: e.g ? `IMF GDP growth ${e.g[0]}% (${IMFY[0]}) → ${e.g[1]}% (${IMFY[1]}); medium term (${IMFY[2]}) ${e.g[2]}%${e.old ? ' (older IMF vintage)' : ''}` : 'n/a' },
      ]);
      // Strategic: expected real return (5 years) from dividend yield + per-share real growth + valuation drift + currency
      const dy = e.code === 'IN' && fin(n500dy) ? n500dy / 100 : yieldOf(a);
      const dil = e.code === 'US' ? 0.005 : e.grp === 'DM' ? 0.01 : 0.015;
      let rev = null, revT = '';
      if (e.code === 'IN' && fin(n500pe) && fin(n500med)) { rev = (n500med / n500pe) ** 0.1 - 1; revT = `PE ${n500pe.toFixed(1)}x → 10-year median ${n500med.toFixed(1)}x`; }
      else if (fin(g?.avg5) && fin(g?.siblisPE)) { rev = (g.avg5 / g.siblisPE) ** 0.1 - 1; revT = `PE ${g.siblisPE.toFixed(1)}x → 5-year average ${g.avg5.toFixed(1)}x`; }
      const fx = INR ? (e.code === 'IN' ? 0 : fxRev(eer) - inrRev) : e.code === 'US' ? 0 : fxRev(eer) - usdRev;
      const parts = [['Dividend yield', dy], ['Real EPS growth (IMF trend growth − dilution)', e.g ? e.g[2] / 100 - dil : null], ['Valuation drift' + (revT ? ` (${revT}, half over 5 years)` : ' (no history: none assumed)'), rev ?? 0], [INR ? 'Currency vs rupee (real)' : 'Currency vs dollar (real)', fx]];
      const real = parts.every(([, x]) => fin(x)) ? sum(parts.map(([, x]) => x)) : null;
      return { id: e.code, code: e.code, name: e.name, grp: e.grp, ccy: e.ccy, acwi: e.acwi, approx: e.approx, etf: e.etf, a, perf: pf, g, tac, er: { real, parts }, pe: g?.siblisPE, vsAvg5: g?.vsAvg5, access: e.code === 'IN' ? 'dom' : 'cap' };
    });
    // Strategic score relative to the benchmark-weighted average.
    const benchW = (rows) => {
      const tot = sum(rows.map((r) => r.acwi)), rest = Math.max(0, 100 - tot);
      if (!INR) return { w: Object.fromEntries(rows.map((r) => [r.id, r.acwi])), rest };
      const home = (C.policy?.inr?.homeShare ?? 0.85) * 100, fx = rows.filter((r) => r.id !== 'IN'), ft = sum(fx.map((r) => r.acwi)) + rest;
      return { w: Object.fromEntries(rows.map((r) => [r.id, r.id === 'IN' ? home : ((100 - home) * r.acwi) / ft])), rest: ((100 - home) * rest) / ft };
    };
    const BW = benchW(equity);
    // World equities (MSCI ACWI weights) in the lens currency: the yardstick for every market.
    const eqER = sum(equity.map((r) => (fin(r.er.real) ? r.acwi * r.er.real : 0))) / sum(equity.map((r) => (fin(r.er.real) ? r.acwi : 0)));
    for (const r of equity) {
      r.strat = combine([{ k: 'er', name: 'Expected real return vs world equities', w: 1, s: fin(r.er.real) ? th(r.er.real - eqER, 0.025) : null, t: fin(r.er.real) ? `${pc(r.er.real, 1)} a year vs ${pc(eqER, 1)} for world equities (real, ${CCY})` : 'Not enough data' }], { forceLow: !r.g?.avg5 && r.id !== 'IN' });
      r.bench = BW.w[r.id];
    }
    // Model equity weights: benchmark tilted by strategic (±20% per notch) and tactical (±25% per notch) views.
    (function weights() {
      const rest = BW.rest, f = (r, t) => clamp(1 + 0.2 * r.strat.notch + (t ? 0.25 * r.tac.notch : 0), 0.4, 1.6);
      const cap = (r, w) => clamp(w, r.bench - 5, r.bench + 5); // active weight capped at ±5 points per market
      for (const t of [false, true]) {
        const key = t ? 'wTac' : 'wStrat';
        if (!INR) { const raw = equity.map((r) => cap(r, r.bench * f(r, t))), tot = sum(raw); equity.forEach((r, i) => { r[key] = (raw[i] * (100 - rest)) / tot; }); }
        else {
          const ind = equity.find((r) => r.id === 'IN'), home = clamp(ind.bench + 2.5 * ind.strat.notch + (t ? 2.5 * ind.tac.notch : 0), 75, 92);
          const fx = equity.filter((r) => r.id !== 'IN'), raw = fx.map((r) => r.bench * f(r, t)), tot = sum(raw) + rest;
          ind[key] = home; fx.forEach((r, i) => { r[key] = (raw[i] * (100 - home)) / tot; });
        }
      }
      equity.rest = rest; equity.restTac = INR ? (rest * (100 - equity.find((r) => r.id === 'IN').wTac)) / (sum(equity.filter((r) => r.id !== 'IN').map((r) => r.bench * f(r, true))) + rest) : rest;
    })();
    const eqTac = sum(equity.map((r) => (fin(r.tac.score) ? r.bench * r.tac.score : 0))) / sum(equity.map((r) => (fin(r.tac.score) ? r.bench : 0)));

    /* ---------- alternatives ---------- */
    const cotFor = (id) => { const c = R.cot?.[id === 'brent' ? 'wti' : id]; return c && !c.error ? c : null; };
    function altER(c, a) {
      const y = yieldOf(a), det = ['reit', 'infra'].includes(c.model), vs = det ? a.real?.vsTrend : a.real?.vsAvg, rev = fin(vs) ? (1 + vs) ** -0.1 - 1 : 0;
      const revName = det ? `Drift back to trend (${pc(vs)} vs 10-year trend, half closes over 5 years)` : `Real-price drift (${pc(vs)} vs 10-year average, half closes over 5 years)`;
      let parts = [];
      switch (c.model) {
        case 'gold': parts = [['Long-run real return of gold', 0.005], [revName, rev]]; break;
        case 'cmdty': parts = [['Real return on cash collateral', cashRealUSD], ['Roll yield (20% today’s, 80% long-run −1%)', fin(a.carry?.roll) ? 0.2 * a.carry.roll - 0.008 : -0.01], [revName, rev]]; break;
        case 'bcom': parts = [['Real return on cash collateral', cashRealUSD], [revName, rev]]; break;
        case 'reit': parts = [['Distribution yield', y], ['Real rent growth', 0.005], [revName, rev]]; break;
        case 'infra': parts = [['Distribution yield', y], ['Real cash-flow growth', 0.01], [revName, rev]]; break;
        case 'tips': parts = [['US 10-year real yield', fin(I.us10r?.last) ? I.us10r.last / 100 : null]]; break;
        case 'hy': parts = [['Yield', y], ['Expected credit losses', -0.02], ['US inflation (breakeven)', -infUS]]; break;
        case 'emd': parts = [['Yield', y], ['Expected credit losses', -0.01], ['US inflation (breakeven)', -infUS]]; break;
        case 'bdc': parts = [['Yield', y], ['Credit losses and NAV erosion', -0.04], ['US inflation (breakeven)', -infUS]]; break;
        case 'pe': parts = [['Expected real return of global equities', eqER], ['Leverage and illiquidity premium', 0.01]]; break;
        default: return { real: null, parts: [], note: c.id === 'mf' ? 'Returns come from trends, not cash flows: no building-block estimate' : 'No cash flows, so no expected-return anchor' };
      }
      if (!parts.every(([, x]) => fin(x))) return { real: null, parts, note: 'Missing an input' };
      if (c.inr && !INR) parts.push(['Rupee vs dollar (real)', inrRev - usdRev]);
      if (!c.inr && INR) parts.push(['Dollar vs rupee (real)', usdRev - inrRev]);
      return { real: sum(parts.map(([, x]) => x)), parts };
    }
    const alts = (C.alts || []).map((c) => {
      const a = A[c.id]; if (!a) return null;
      const pf = perf(a);
      let val = null, valT = 'No valuation anchor';
      if (['gold', 'cmdty', 'bcom'].includes(c.model) && a.real) { val = -th(a.real.z, 1.5); valT = `Real price ${pc(a.real.vsAvg)} vs its ${Math.round(a.real.years)}-year average (${pctl(a.real.pct)})`; }
      if (['reit', 'infra', 'pe'].includes(c.model) && fin(a.real?.zDet)) { val = -th(a.real.zDet, 1.5); valT = `Real total return ${pc(a.real.vsTrend)} vs its 10-year trend (${pctl(a.real.pctDet)})`; }
      if (c.id === 'tips' && I.us10r) { val = (I.us10r.pct10 - 0.5) * 2; valT = `US 10-year real yield ${p2(I.us10r.last)}, ${pctl(I.us10r.pct10)} of 10 years (high = cheap)`; }
      if (c.id === 'hy' || c.id === 'pcredit') { if (I.hyoas) { val = (I.hyoas.pct10 - 0.5) * 2; valT = `US high-yield spread ${p2(I.hyoas.last)}, ${pctl(I.hyoas.pct10)} of 10 years (wide = cheap)`; } else valT = 'Needs credit spreads (add the free FRED key)'; }
      let car = null, carT = '—';
      if (a.carry) { car = th(a.carry.roll, 0.08); carT = `Futures ${a.carry.roll >= 0 ? 'backwardation' : 'contango'} ${pc(a.carry.roll, 1)} a year (${a.carry.front} → ${a.carry.far})`; }
      else if (['reit', 'infra', 'tips', 'hy', 'emd', 'bdc', 'pe'].includes(c.model) && fin(yieldOf(a))) { const hurdle = c.inr ? inCash : usCash; car = th(yieldOf(a) - hurdle, 0.03); carT = `Yield ${pu(yieldOf(a))} vs cash ${pu(hurdle)}`; }
      else if (c.id === 'btc' || c.id === 'eth') { car = th(-usCash, 0.08); carT = `No yield: gives up ${pu(usCash)} on cash`; }
      const fit = macroFit(c.exp), cot = cotFor(c.id);
      let posS = null, posT = 'No CFTC data';
      if (cot) { posS = cot.pct3y > 0.85 ? -(cot.pct3y - 0.85) / 0.15 : cot.pct3y < 0.15 ? (0.15 - cot.pct3y) / 0.15 : 0; posT = `${cot.who} ${pc(cot.netPct)} of open interest, ${pctl(cot.pct3y)} of 3 years${cot.pct3y > 0.85 ? ' — crowded' : cot.pct3y < 0.15 ? ' — washed out' : ''}${c.id === 'brent' ? ' (WTI data)' : ''}`; }
      const tac = combine([
        { k: 'value', name: 'Valuation', w: 0.3, s: val, t: valT },
        { k: 'carry', name: 'Carry', w: 0.2, s: car, t: carT },
        trendPart(pf, 0.2),
        { k: 'macro', name: 'Macro fit', w: 0.2, s: fit.s, t: fit.t },
        { k: 'pos', name: 'Positioning', w: 0.1, s: posS, t: posT },
      ]);
      const er = altER(c, a), dv = divers(a);
      const strat = fin(er.real)
        ? combine([{ k: 'er', name: 'Expected real return vs cash', w: 0.7, s: th(er.real - cashReal, 0.03), t: `${pc(er.real, 1)} a year vs cash ${pc(cashReal, 1)} (real, ${CCY})` }, { k: 'div', name: 'Diversification', w: 0.3, s: dv.s, t: dv.t }])
        : combine([{ k: 'div', name: 'Diversification only', w: 1, s: fin(dv.s) ? dv.s * 0.5 : null, t: `${er.note}. ${dv.t}` }], { forceLow: true });
      return { id: c.id, name: c.name, group: c.group, cfg: c, a, perf: pf, tac, strat, er, cot, divers: dv, yield: yieldOf(a), access: c.access || 'cap' };
    }).filter(Boolean);
    const altById = Object.fromEntries(alts.map((x) => [x.id, x]));

    /* ---------- asset classes (house view) ---------- */
    const regimeEq = avg([pil.risk.score, pil.liquidity.score, pil.valuation.score, pil.growth.score]);
    const cotUst = (D.pos?.cftc || []).find((c) => c.id === 'ust10');
    const in10 = D.macro?.manual?.india10y, ind10 = in10?.value, inCPI = cpi.IN?.last ?? I.cpi_IN?.last;
    function bondRow(id, name) {
      if (id === 'ust') {
        const a = A.ust, pf = perf(a);
        const tac = combine([
          { k: 'value', name: 'Valuation', w: 0.3, s: I.us10r ? (I.us10r.pct10 - 0.5) * 2 : null, t: I.us10r ? `Real 10-year yield ${p2(I.us10r.last)}, ${pctl(I.us10r.pct10)} of 10 years` : '—' },
          { k: 'carry', name: 'Carry', w: 0.2, s: I.c3m10y ? th(I.c3m10y.last, 1) : null, t: I.c3m10y ? `10-year minus 3-month ${I.c3m10y.last >= 0 ? '+' : '−'}${Math.abs(I.c3m10y.last * 100).toFixed(0)}bp` : '—' },
          trendPart(pf),
          { k: 'macro', name: 'Macro fit', w: 0.2, ...macroFit({ g: -1, i: -1, l: 1, r: -1 }) },
          { k: 'pos', name: 'Positioning', w: 0.1, s: cotUst ? (cotUst.pct3y > 0.85 ? -1 : cotUst.pct3y < 0.15 ? 1 : 0) : null, t: cotUst ? `Leveraged funds ${pctl(cotUst.pct3y)} of 3 years` : '—' },
        ]);
        const real = fin(I.us10y?.last) ? I.us10y.last / 100 - infUS + lensFxUSD : null, dv = divers(a);
        const strat = combine([{ k: 'er', name: 'Expected real return vs cash', w: 0.7, s: fin(real) ? th(real - cashReal, 0.03) : null, t: `10-year yield ${p2(I.us10y?.last)} − breakeven ${pu(infUS)}${INR ? ' + dollar vs rupee' : ''} = ${pc(real, 1)} real` }, { k: 'div', name: 'Diversification', w: 0.3, s: dv.s, t: dv.t }]);
        return { id, name, tac, strat, er: { real, parts: [['10-year yield', I.us10y?.last / 100], ['Expected inflation', -infUS], ...(INR ? [['Dollar vs rupee (real)', usdRev - inrRev]] : [])] } };
      }
      if (id === 'ig') {
        const a = A.ig, pf = perf(a), y = yieldOf(a);
        const tac = combine([
          { k: 'value', name: 'Valuation', w: 0.3, s: I.igoas ? (I.igoas.pct10 - 0.5) * 2 : null, t: I.igoas ? `IG spread ${p2(I.igoas.last)}, ${pctl(I.igoas.pct10)} of 10 years` : 'Spreads need a FRED key' },
          { k: 'carry', name: 'Carry', w: 0.2, s: fin(y) ? th(y - usCash, 0.03) : null, t: `Yield ${pu(y)} vs cash ${pu(usCash)}` },
          trendPart(pf), { k: 'macro', name: 'Macro fit', w: 0.2, ...macroFit({ g: 0.5, i: -0.5, l: 1, r: 0.5 }) },
        ]);
        const real = fin(y) ? y - 0.002 - infUS + lensFxUSD : null;
        const strat = combine([{ k: 'er', name: 'Expected real return vs cash', w: 0.7, s: fin(real) ? th(real - cashReal, 0.03) : null, t: `${pc(real, 1)} real a year vs cash ${pc(cashReal, 1)}` }, { k: 'div', name: 'Diversification', w: 0.3, ...divers(a) }]);
        return { id, name, tac, strat, er: { real, parts: [['Yield', y], ['Credit losses', -0.002], ['Expected inflation', -infUS], ...(INR ? [['Dollar vs rupee (real)', usdRev - inrRev]] : [])] } };
      }
      if (id === 'ingsec' || id === 'incorp') {
        const extra = id === 'incorp' ? 0.004 : 0, y = fin(ind10) ? ind10 / 100 + extra : null;
        const realNow = fin(ind10) && fin(inCPI) ? (ind10 - inCPI) / 100 : null, b = pol.IN;
        const tac = combine([
          { k: 'value', name: 'Valuation', w: 0.35, s: fin(realNow) ? th(realNow - 0.02, 0.015) : null, t: `10-year G-sec ${p2(ind10)} − CPI ${p2(inCPI, 1)} = ${pc(realNow, 1)} real` },
          { k: 'carry', name: 'Carry', w: 0.25, s: fin(ind10) ? th(ind10 / 100 - inCash - 0.01, 0.01) : null, t: `${p2(ind10)} vs repo ${pu(inCash, 2)}` },
          { k: 'policy', name: 'Policy', w: 0.25, s: b ? -th(b.chg6m ?? 0, 0.5) : null, t: b ? `RBI repo ${p2(b.last)} (${b.chg6m > 0 ? 'hiked' : b.chg6m < 0 ? 'cut' : 'unchanged'} over 6 months)` : '—' },
          { k: 'infl', name: 'Inflation trend', w: 0.15, s: fin(cpi.IN?.chg3m) ? -th(cpi.IN.chg3m, 1) : null, t: `India CPI ${p2(inCPI, 1)}, ${fin(cpi.IN?.chg3m) ? (cpi.IN.chg3m >= 0 ? '+' : '−') + Math.abs(cpi.IN.chg3m).toFixed(1) + 'pp' : '—'} over 3 months` },
        ]);
        const real = fin(y) ? y - (id === 'incorp' ? 0.002 : 0) - infIN : null;
        const strat = combine([{ k: 'er', name: 'Expected real return vs cash', w: 1, s: fin(real) ? th(real - cashRealINR, 0.015) : null, t: `${pc(real, 1)} real a year vs INR cash ${pc(cashRealINR, 1)}` }]);
        return { id, name, tac, strat, er: { real, parts: [['Yield', y], ...(id === 'incorp' ? [['Credit losses', -0.002]] : []), ['Expected inflation (RBI target)', -infIN]] }, yieldNote: in10 ? `10-year G-sec ${p2(ind10)} · ${in10.auto ? 'live' : 'entered by hand'} ${fmtD(in10.asOf)}${in10.stale ? ' · stale' : ''}` : null };
      }
      return null;
    }
    const NAMES = { eq: INR ? 'Equities (85% India / 15% global)' : 'Global equities', ust: 'US Treasuries (7–10y)', ig: 'US investment-grade credit', ingsec: 'India government bonds (10y)', incorp: 'India corporate bonds (AAA)', cash: INR ? 'Cash (INR liquid funds)' : 'Cash (US T-bills)' };
    const eqRealLens = INR ? (() => { const ind = equity.find((r) => r.id === 'IN'); const fx = equity.filter((r) => r.id !== 'IN' && fin(r.er.real)); const f = sum(fx.map((r) => r.acwi * r.er.real)) / sum(fx.map((r) => r.acwi)); return 0.85 * (ind?.er.real ?? f) + 0.15 * f; })() : eqER;
    function classRow(key) {
      if (key === 'eq') {
        const tac = combine([{ k: 'markets', name: 'Market views (benchmark-weighted)', w: 0.7, s: eqTac, t: `Average of the country views below, weighted by benchmark` }, { k: 'regime', name: 'Regime', w: 0.3, s: regimeEq, t: `Growth ${pil.growth.label.toLowerCase()}, liquidity ${pil.liquidity.label.toLowerCase()}, risk ${pil.risk.label.toLowerCase()}, valuation ${pil.valuation.label.toLowerCase()}` }]);
        // The cash hurdle depends on the inflation assumption, so test the call under several reasonable ones.
        const nominal = INR ? inCash : usCash;
        const variants = (INR ? [['RBI target', infIN, true], ['India CPI now', fin(inCPI) ? inCPI / 100 : null]] : [['Market (10y breakeven)', infUS, true], ['Fed target', 0.02], ['US CPI now', fin(I.cpi_US?.last) ? I.cpi_US.last / 100 : null]]).filter(([, v]) => fin(v));
        const sens = variants.map(([label, inf, base]) => { const cr = nominal - inf, sc = th(eqRealLens - cr - 0.025, 0.05), n = notchOf(sc); return { label, inf, cashReal: cr, score: sc, notch: n, arrow: ARROWS[n + 2], base: !!base }; });
        const spread = sens.length ? Math.max(...sens.map((x) => x.notch)) - Math.min(...sens.map((x) => x.notch)) : 0, fragile = spread >= 2;
        const strat = combine([{ k: 'er', name: 'Expected real return vs cash + 2.5% risk premium', w: 1, s: fin(eqRealLens) ? th(eqRealLens - cashReal - 0.025, 0.05) : null, t: `${pc(eqRealLens, 1)} a year vs cash ${pc(cashReal, 1)}; equities need to beat cash by about 2.5% to pay for their risk. Under other inflation assumptions: ${sens.map((x) => `${x.label} ${pu(x.inf)} → ${x.arrow}`).join(', ')}.` }], { forceLow: fragile });
        strat.sens = sens; strat.fragile = fragile; strat.sensText = sens.length > 1 ? `${sens.map((x) => `${x.label} ${pu(x.inf)} ${x.arrow}`).join(' · ')} — ${fragile ? 'fragile: the call changes with the inflation assumption' : spread ? 'direction holds; size depends on the inflation assumption' : 'the call holds under each assumption'}` : null;
        // Benchmark-weighted building blocks (FII: MSCI ACWI weights; INR: 85% India, 15% the rest).
        const wOf = (r) => (INR ? (r.id === 'IN' ? 85 : (15 * r.acwi) / sum(equity.filter((q) => q.id !== 'IN').map((q) => q.acwi))) : r.acwi);
        const rows = equity.filter((r) => fin(r.er.real)), wt = sum(rows.map(wOf));
        const labels = ['Dividend yield', 'Real EPS growth (IMF trend growth − dilution)', 'Valuation drift (half way back to normal PE over 5 years)', INR ? 'Currency vs rupee (real)' : 'Currency vs dollar (real)'];
        const parts = labels.map((l, i) => [l, sum(rows.map((r) => wOf(r) * r.er.parts[i][1])) / wt]);
        return { id: key, name: NAMES.eq, tac, strat, er: { real: eqRealLens, parts } };
      }
      if (key === 'cash') {
        const tac = combine([{ k: 'mirror', name: 'Opposite of the equity view', w: 1, s: fin(eqTac) ? -0.6 * (0.7 * eqTac + 0.3 * (regimeEq ?? 0)) : null, t: 'Cash is where underweights go' }]);
        return { id: key, name: NAMES.cash, tac, strat: { score: 0, notch: 0, arrow: '●', view: 'Neutral', conf: 'High', parts: [{ k: 'h', name: 'Hurdle', w: 1, s: 0, t: `Pays ${pu(cash, 2)} (${pc(cashReal, 1)} real)` }] }, er: { real: cashReal, parts: [['Cash yield', cash], ['Expected inflation', INR ? -infIN : -infUS]] } };
      }
      const b = bondRow(key, NAMES[key]); if (b) return b;
      const x = altById[key]; return x ? { id: key, name: x.name, tac: x.tac, strat: x.strat, er: x.er, alt: true } : null;
    }
    const pol0 = (C.policy || {})[INR ? 'inr' : 'fii'] || { sleeves: [] };
    const CLASS_ACCESS = { eq: 'dom', ingsec: 'dom', incorp: 'dom', cash: 'dom', ust: 'cap', ig: 'cap' };
    const classes = pol0.sleeves.map(([k, w]) => { const r = classRow(k); return r ? { ...r, policy: w, access: CLASS_ACCESS[k] || altById[k]?.access || 'cap' } : null; }).filter(Boolean);
    // Tactical model weights: each notch moves a sleeve by 10% of its weight (0.5–3 points); cash takes the other side.
    // How much: the 3–5 year call sets a target (half a step per notch — policy portfolios move slowly);
    // the 3–12 month call tilts around that target (a full step per notch). Step = 10% of the sleeve, 0.5–3 points.
    // Cash takes the other side. In the INR lens, sleeves without an Indian route are never raised above policy.
    (function tilt() {
      const capped = (r) => INR && r.access !== 'dom';
      for (const r of classes) {
        r.step = r.id === 'cash' ? 0 : clamp(r.policy * 0.1, 0.5, 3);
        r.target = Math.max(0, r.policy + 0.5 * r.step * (r.strat?.notch ?? 0));
        r.model = Math.max(0, r.target + r.step * r.tac.notch);
        if (capped(r)) { r.target = Math.min(r.target, r.policy); r.model = Math.min(r.model, r.policy); r.capped = true; }
      }
      const c = classes.find((r) => r.id === 'cash'), others = classes.filter((r) => r.id !== 'cash');
      // If the tilts leave less than 1% cash, scale back the raises (target vs policy, then model vs target),
      // so a neutral 3–12 month view always leaves the model equal to the target.
      let rest = 100 - sum(others.map((r) => r.target));
      if (rest < 1) { const over = 1 - rest, pos = others.filter((r) => r.target > r.policy), ex = sum(pos.map((r) => r.target - r.policy)); for (const r of pos) { const cut = (over * (r.target - r.policy)) / ex; r.target -= cut; r.model -= cut; } rest = 1; }
      if (c) c.target = rest;
      rest = 100 - sum(others.map((r) => r.model));
      if (rest < 1) { const over = 1 - rest, pos = others.filter((r) => r.model > r.target), ex = sum(pos.map((r) => r.model - r.target)); for (const r of pos) r.model -= (over * (r.model - r.target)) / ex; rest = 1; }
      if (c) c.model = rest;
    })();

    /* ---------- deployment ---------- */
    function deploy() {
      const valS = INR ? (fin(n500pct) ? (0.5 - n500pct) * 2 : pil.valuation.score) : pil.valuation.score;
      const expensive = fin(valS) && valS < -0.33, cheap = fin(valS) && valS > 0.33;
      const vix = I.vix, stressed = (fin(pil.risk.score) && pil.risk.score < -0.33) || (vix && vix.pct10 > 0.85);
      const tr = INR ? A.eq_IN?.inr?.trend : A.acwi?.usd?.trend, up = fin(tr) && tr > 0;
      const mkt = INR ? 'Indian equities' : 'global equities', tight = fin(pil.liquidity.score) && pil.liquidity.score < -0.33;
      let why, pace, tranches, months;
      if (cheap && up && tight && !stressed) { why = `${mkt} are cheap and trending up, but global liquidity is tightening`; pace = '40% now, the rest over 3 months'; tranches = [40, 20, 20, 20]; months = 3; }
      else if (stressed && !expensive) { why = `${mkt} are under stress but not expensive, so buy into the weakness`; pace = 'half now, the rest within 2 months'; tranches = [50, 25, 25]; months = 2; }
      else if (cheap && up) { why = `${mkt} are cheap and trending up`; pace = 'half now, the rest over 2 months'; tranches = [50, 25, 25]; months = 2; }
      else if (expensive && up) { why = `${mkt} are expensive but still trending up; buy faster on a 7–10% pullback`; pace = 'equal monthly tranches over 6 months'; tranches = [17, 17, 17, 17, 16, 16]; months = 6; }
      else if (expensive && !up) { why = `${mkt} are expensive and below their 40-week average; speed up only once the trend recovers`; pace = 'stage over 9–12 months'; tranches = [12, 11, 11, 11, 11, 11, 11, 11, 11]; months = 9; }
      else if (!up) { why = `${mkt} are fairly valued but trending down`; pace = 'stage over 3–6 months'; tranches = [25, 25, 25, 25]; months = 4; }
      else { why = `${mkt} are fairly valued and trending up`; pace = '40% now, the rest over 3 months'; tranches = [40, 20, 20, 20]; months = 3; }
      const eqc = classes.find((r) => r.id === 'eq'), w = (v) => (fin(v) ? (Math.round(v * 10) / 10).toString() : '—');
      const target = eqc ? { policy: eqc.policy, target: eqc.target, model: eqc.model, sView: eqc.strat.view, tView: eqc.tac.view } : null;
      const howMuch = target ? `How much: equities ${w(target.policy)}% policy → ${w(target.target)}% target (3–5 years: ${target.sView.toLowerCase()})${Math.abs(target.model - target.target) >= 0.05 ? ` → ${w(target.model)}% with the 3–12 month tilt (${target.tView.toLowerCase()})` : ` — the 3–12 month view (${target.tView.toLowerCase()}) adds no tilt`}.` : '';
      const howFast = `How fast: ${pace} — ${why}.`;
      const plan = `${howFast.replace(/^How fast: /, '').replace(/^./, (m) => m.toUpperCase())}`;
      const rp = I.us10r?.pct10, bondNow = INR ? fin(ind10) && fin(inCPI) && ind10 - inCPI > 2 : fin(rp) && rp > 0.6;
      const bonds = bondNow ? `Bonds: real yields are high against history${INR ? ` (10-year G-sec ${p2(ind10)} vs CPI ${p2(inCPI, 1)})` : ` (US real 10-year ${p2(I.us10r?.last)}, ${pctl(rp)})`} — lock in the bond sleeve now.` : 'Bonds: yields are not unusually high — ladder in over 3 months.';
      const triggers = {
        faster: [INR ? 'Nifty 500 PE falls below its 10-year median' : 'MSCI ACWI falls 10% from its high', INR ? 'India VIX above 20' : 'VIX above 30', 'Credit spreads stop widening after a sell-off'],
        slower: [`${INR ? 'Nifty 500' : 'MSCI ACWI'} closes below its 40-week average`, 'High-yield spreads widen sharply (alert)', INR ? 'Rupee falls more than 3% in a month' : 'Dollar index rises more than 3% in a month'],
      };
      return { plan, howMuch, howFast, target, why, pace, tranches, months, bonds, tight, alts: 'Listed alternatives can go in with the bond sleeve. Private funds (PE, private credit, infrastructure): commit across 3 vintage years, since capital is called over 3–5 years.', park: `While waiting, undeployed money earns ${pu(cash, 2)} in ${INR ? 'INR liquid funds or T-bills (repo-linked)' : 'US T-bills'} — ${pc(cashReal, 1)} after expected inflation.`, triggers, inputs: { expensive, cheap, stressed, up, trend: tr, vix: vix?.last, valuation: INR ? `Nifty 500 PE ${pctl(n500pct)} of 10 years` : `Valuation pillar: ${pil.valuation.label}` } };
    }

    /* ---------- currency hedging ---------- */
    function hedging() {
      const seen = new Set(), rows = [];
      for (const e of C.equity || []) {
        if (e.ccy === 'USD' || seen.has(e.ccy) || (INR && e.ccy === 'INR')) continue; seen.add(e.ccy);
        const b = e.bis ? pol[e.bis] : null, z = reer[e.eer || e.bis]?.z10, pct = reer[e.eer || e.bis]?.pct10;
        const base = INR ? pol.IN?.last : pol.US?.last;
        const carry = fin(b?.last) && fin(base) ? (base - b.last) / 100 : null; // + = hedging earns
        let rec, why;
        if (!fin(carry)) { rec = 'Partial'; why = 'No policy-rate data for the hedge cost'; }
        else if (carry >= 0) { rec = fin(z) && z < -1.5 ? 'Partial' : 'Hedge'; why = `Hedging ${carry > 0 ? 'earns' : 'costs nothing:'} ${pc(carry, 1)} a year${fin(z) && z < -1.5 ? ', but the currency is very cheap' : ''}`; }
        else if (carry < -0.025) { rec = fin(z) && z > 1.5 ? 'Partial' : 'Unhedged'; why = `Hedging costs ${pc(-carry, 1)} a year${fin(z) && z > 1.5 ? ', but the currency is expensive' : ''}`; }
        else { rec = fin(z) && z > 1 ? 'Hedge' : fin(z) && z < -1 ? 'Unhedged' : 'Partial'; why = `Hedge cost ${pc(-carry, 1)} a year; currency ${fin(z) ? (z > 1 ? 'expensive' : z < -1 ? 'cheap' : 'near fair value') : 'n/a'}`; }
        rows.push({ ccy: e.ccy, market: e.name, carry, z, pct, rec, why });
      }
      let home = null;
      if (INR) {
        const cost = fin(pol.IN?.last) && fin(pol.US?.last) ? (pol.IN.last - pol.US.last) / 100 : null, dep = R.usdinr?.cagr10, z = reer.IN?.z10;
        const rec = fin(z) && z < -1.5 ? 'Partial (25–50%)' : 'Mostly unhedged';
        home = { cost, dep, z, pct: reer.IN?.pct10, rec, text: `Hedging dollar assets back to rupees costs about ${pu(cost)} a year (the rate gap). Over 10 years the rupee lost ${pu(dep)} a year against the dollar, so an unhedged position usually did better, and dollar exposure cushions Indian sell-offs. ${fin(z) && z < -1.5 ? `But the rupee is unusually cheap in real terms (${pctl(reer.IN.pct10)} of 10 years), which raises the odds of a rebound: hedge part of it.` : 'The rupee is not unusually cheap, so stay mostly unhedged.'}` };
      } else {
        home = { text: 'Bonds: hedge foreign-currency bonds fully — currency swings would swamp the yield. Equities: decide by hedge cost and currency value, as below.' };
      }
      return { rows, home };
    }

    /* ---------- what is priced in ---------- */
    function pricedIn() {
      const out = [];
      const rp = D.markets?.ratePath;
      if (rp?.horizon) out.push({ k: 'Fed', what: `Fed funds futures: ${rp.horizon.cum >= 0 ? '+' : '−'}${Math.abs(rp.horizon.cum * 100).toFixed(0)}bp by ${fmtD(rp.horizon.date)}`, read: rp.horizon.cum > 0.1 ? `Markets price hikes (${(rp.horizon.cum / 0.25).toFixed(1)} of 25bp). A hawkish surprise is partly in the price; a pause would be a relief.` : rp.horizon.cum < -0.1 ? `Markets price ${(-rp.horizon.cum / 0.25).toFixed(1)} cuts of 25bp. Sticky inflation would disappoint this.` : 'Markets price a steady Fed.' });
      if (I.be10 && I.cpi_US) out.push({ k: 'Inflation', what: `US 10-year breakeven ${p2(I.be10.last)} vs CPI ${p2(I.cpi_US.last, 1)}`, read: I.be10.last < I.cpi_US.last - 0.3 ? 'Bonds expect inflation to fall back. If it does not, TIPS and real assets gain.' : I.be10.last > I.cpi_US.last + 0.3 ? 'Bonds expect inflation to rise from here.' : 'Bonds expect inflation to stay near today’s level.' });
      const us = G('United States');
      if (us?.siblisPE && us.avg5) { const req = (us.siblisPE / us.avg5) ** (1 / 3) - 1; out.push({ k: 'US equities', what: `S&P trailing PE ${us.siblisPE.toFixed(1)}x vs 5-year average ${us.avg5.toFixed(1)}x`, read: `To get back to the average PE in 3 years with flat prices, earnings must grow ${pc(req, 1)} a year — the price assumes strong earnings.` }); }
      if (fin(n500pe) && fin(n500med)) { const req = (n500pe / n500med) ** (1 / 3) - 1; out.push({ k: 'India equities', what: `Nifty 500 PE ${n500pe.toFixed(1)}x vs 10-year median ${n500med.toFixed(1)}x (${pctl(n500pct)})`, read: req > 0 ? `Needs ${pc(req, 1)} a year of earnings growth for 3 years to reach the median PE at flat prices.` : `Below its 10-year median PE: the price builds in weaker-than-usual earnings. Re-rating to the median would add about ${pc(-req, 1)} a year for 3 years.` }); }
      const br = A.brent?.carry; if (br) { const ch = br.farPx / br.frontPx - 1; out.push({ k: 'Oil', what: `Brent futures ${br.front} $${br.frontPx.toFixed(1)} → ${br.far} $${br.farPx.toFixed(1)}`, read: `The curve prices ${pc(ch)} over ${br.months} months: ${ch < -0.05 ? 'the market expects today’s tight supply to ease' : ch > 0.05 ? 'the market expects prices to rise' : 'no big change'}.` }); }
      if (fin(pol.IN?.last) && fin(pol.US?.last) && fin(R.usdinr?.cagr10)) { const gap = (pol.IN.last - pol.US.last) / 100; out.push({ k: 'Rupee', what: `Forward premium ≈ ${pu(gap)} a year (RBI ${p2(pol.IN.last)} vs Fed ${p2(pol.US.last)})`, read: `Forwards price the rupee to lose about ${pu(gap)} a year; it lost ${pu(R.usdinr.cagr10)} a year over the past decade.` }); }
      if (I.hyoas) out.push({ k: 'Credit', what: `US high-yield spread ${p2(I.hyoas.last)} (${pctl(I.hyoas.pct10)} of 10 years)`, read: `At a 40% recovery this prices about ${pu(I.hyoas.last / 100 / 0.6)} of defaults a year.` });
      if (I.vix) out.push({ k: 'Volatility', what: `VIX ${I.vix.last.toFixed(1)} (${pctl(I.vix.pct10)} of 10 years)${D.pos?.corr?.vol?.realised ? `; realised ${D.pos.corr.vol.realised.last.toFixed(1)}` : ''}`, read: I.vix.pct10 > 0.8 ? 'Options price heavy turbulence; protection is expensive.' : I.vix.pct10 < 0.3 ? 'Options price calm; protection is cheap — a good time to buy hedges.' : 'Options price a normal amount of risk.' });
      return out;
    }

    /* ---------- scenarios ---------- */
    const universe = [...alts.map((x) => ({ id: x.id, name: x.name, a: x.a })), { id: 'acwi', name: 'Global equities', a: A.acwi }, { id: 'ust', name: 'US Treasuries', a: A.ust }, { id: 'ig', name: 'US IG credit', a: A.ig }, { id: 'eq_IN', name: 'India equities', a: A.eq_IN }].filter((x) => x.a?.cond);
    const rank = (k, inr) => universe.map((x) => ({ ...x, v: (inr ? x.a.condInr?.[k] : x.a.cond[k])?.avg })).filter((x) => fin(x.v)).sort((a, b) => b.v - a.v);
    function scenarios() {
      const flows = D.macro?.flows ? Object.entries(D.macro.flows).sort().slice(-20) : [];
      const fii20 = flows.length ? sum(flows.map(([, v]) => v.fii)) : null;
      const sc = [
        { k: 'inflUp', name: 'Inflation flare-up', desc: 'Oil or supply shock pushes inflation and real yields higher.', sig: [
          ['Brent up more than 10% in 3 months', A.brent?.usd?.r3m, (v) => v > 0.1, (v) => pc(v)], ['10-year breakeven up 15bp+ in 3 months', I.be10?.chg?.q, (v) => v > 0.15, (v) => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(0) + 'bp'],
          ['Inflation pillar: heating up', pil.inflation.score, (v) => v < -0.33, () => pil.inflation.label], ['US CPI rising over 3 months', I.cpi_US?.chg?.q, (v) => v > 0, (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + 'pp']] },
        { k: 'eqDown', name: 'Growth scare / recession', desc: 'Earnings and growth disappoint; risk assets sell off.', sig: [
          ['Growth pillar: slowing', pil.growth.score, (v) => v < -0.33, () => pil.growth.label], ['Copper/gold falling (3 months)', I.cugold?.chg?.q, (v) => v < -0.05, (v) => pc(v)],
          ['Yield curve inverted (3m10y)', I.c3m10y?.last, (v) => v < 0, (v) => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(0) + 'bp'], ['Global stocks below 40-week average', A.acwi?.usd?.trend, (v) => v < 0, (v) => pc(v)]] },
        { k: 'ratesUp', name: 'Bond sell-off', desc: 'Term premium and real yields jump (fiscal worries, hawkish central banks).', sig: [
          ['US 10-year up 30bp+ in 3 months', I.us10y?.chg?.q, (v) => v > 0.3, (v) => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(0) + 'bp'], ['Bond volatility (MOVE) above 70th pctl', I.move?.pct10, (v) => v > 0.7, (v) => pctl(v)],
          ['Real 10-year yield above 80th pctl', I.us10r?.pct10, (v) => v > 0.8, (v) => pctl(v)], ['Fed hikes priced over 12 months', D.markets?.ratePath?.horizon?.cum, (v) => v > 0.1, (v) => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(0) + 'bp']] },
        { k: 'usdUp', name: 'Dollar surge', desc: 'A strong dollar tightens global financial conditions; EM and commodities suffer.', sig: [
          ['Dollar index up 3%+ in 3 months', dxy3m, (v) => v > 0.03, (v) => pc(v, 1)], ['EM lagging DM (3 months)', I.emdm?.chg?.q, (v) => v < -0.03, (v) => pc(v, 1)],
          ['Liquidity pillar: tightening', pil.liquidity.score, (v) => v < -0.33, () => pil.liquidity.label]] },
      ];
      if (INR) sc.push({ k: 'inrDown', inr: true, name: 'Rupee and FII outflow stress', desc: 'Foreign investors sell, the rupee falls and Indian assets reprice.', sig: [
        ['Rupee down 2%+ vs USD in 3 months', inr3m, (v) => v > 0.02, (v) => pc(v, 1)], ['FII net selling over 20 sessions', fii20, (v) => v < 0, (v) => `${v >= 0 ? '+' : '−'}₹${Math.abs(Math.round(v)).toLocaleString('en-IN')} cr`],
        ['India VIX above 70th pctl', I.indiavix?.pct10, (v) => v > 0.7, (v) => pctl(v)]] });
      return sc.map((s) => {
        const sig = s.sig.map(([t, v, f, fmt]) => ({ t, v: fin(v) ? fmt(v) : '—', on: fin(v) ? !!f(v) : null }));
        const live = sig.filter((x) => x.on != null), on = live.filter((x) => x.on).length;
        const level = !live.length ? 'n/a' : on / live.length >= 0.66 ? 'Elevated' : on / live.length >= 0.33 ? 'Watch' : 'Low';
        const r = rank(s.k, s.inr);
        return { ...s, sig, on, n: live.length, level, holds: r.slice(0, 4).map((x) => ({ name: x.name, v: x.v })), hurts: r.slice(-4).reverse().map((x) => ({ name: x.name, v: x.v })), def: R.thresholds?.[s.k] };
      });
    }

    /* ---------- alternatives tab extras ---------- */
    function setups() {
      const early = [], late = [];
      for (const x of alts) {
        const a = x.a, pf = x.perf; if (!pf) continue;
        const plain = ['gold', 'cmdty', 'bcom'].includes(x.cfg.model), det = ['reit', 'infra', 'pe'].includes(x.cfg.model);
        const z = plain ? a.real?.z : det ? a.real?.zDet : null, gap = plain ? a.real?.vsAvg : a.real?.vsTrend, gapWord = plain ? 'real price' : 'real total return', vsWord = plain ? '10-year average' : '10-year trend';
        const cheap = fin(z) && z <= -0.5, rich = fin(z) && z >= 1;
        const turnUp = (pf.cross?.dir === 1 && pf.cross.weeks <= 8) || (pf.r3m > 0 && pf.mom < 0);
        const turnDn = (pf.cross?.dir === -1 && pf.cross.weeks <= 8) || (pf.r3m < 0 && pf.mom > 0);
        const washed = x.cot && x.cot.pct3y < 0.15, crowded = x.cot && x.cot.pct3y > 0.85;
        const ma = a.usd?.ma40;
        if ((cheap || washed) && turnUp) early.push({ id: x.id, name: x.name, why: [cheap ? `${gapWord} ${pc(gap)} vs ${vsWord}` : null, washed ? `speculators washed out (${pctl(x.cot.pct3y)})` : null, pf.cross?.dir === 1 ? `back above its 40-week average ${pf.cross.weeks} week${pf.cross.weeks > 1 ? 's' : ''} ago` : `3-month return ${pc(pf.r3m)} after a ${pc(pf.mom)} year`].filter(Boolean), confirm: `Holds above its 40-week average${fin(ma) ? ` (≈${ma >= 100 ? Math.round(ma).toLocaleString('en-US') : ma.toFixed(2)} in USD)` : ''} for 4 more weeks`, cancel: 'Closes back below the 40-week average, or makes a new 52-week low', score: x.tac.score });
        if ((rich || crowded) && turnDn) late.push({ id: x.id, name: x.name, why: [rich ? `${gapWord} ${pc(gap)} vs ${vsWord}` : null, crowded ? `speculators crowded long (${pctl(x.cot.pct3y)})` : null, pf.cross?.dir === -1 ? `fell below its 40-week average ${pf.cross.weeks} week${pf.cross.weeks > 1 ? 's' : ''} ago` : `3-month return ${pc(pf.r3m)} after a ${pc(pf.mom)} year`].filter(Boolean), score: x.tac.score });
      }
      return { early: early.sort((a, b) => b.score - a.score), late: late.sort((a, b) => a.score - b.score) };
    }
    function flows() {
      const rows = alts.filter((x) => x.cot?.chg4wUSD != null).map((x) => ({ id: x.id, name: x.name + (x.id === 'brent' ? ' (WTI)' : ''), v: x.cot.chg4wUSD, w1: x.cot.chg1wUSD, net: x.cot.netUSD, pct: x.cot.pct3y, asOf: x.cot.asOf, who: x.cot.who })).filter((r, i, arr) => arr.findIndex((q) => q.name.replace(' (WTI)', '') === r.name.replace(' (WTI)', '')) === i && r.id !== 'brent');
      const mom = alts.filter((x) => fin(x.perf?.r3m)).map((x) => ({ id: x.id, name: x.name, v: x.perf.r3m })).sort((a, b) => b.v - a.v);
      return { cftc: rows.sort((a, b) => b.v - a.v), mom };
    }
    function depth(ticketUSD) {
      return alts.map((x) => {
        const e = x.a.etf || {}, f = x.a.fut || {};
        const adv = Math.max(e.advUSD || 0, f.advUSD || 0) || null;
        const days = adv ? ticketUSD / (0.1 * adv) : null;
        const tier = !fin(days) ? 'n/a' : days <= 1 ? 'Deep' : days <= 5 ? 'Good' : days <= 20 ? 'Moderate' : 'Thin';
        return { id: x.id, name: x.name, adv, via: f.advUSD && f.advUSD >= (e.advUSD || 0) ? `${f.sym} futures` : e.sym, aum: e.aum, oi: f.oiUSD, mcap: x.a.mcap, days, tier, india: x.cfg.india, privateNote: ['pcredit', 'pe', 'infra'].includes(x.id) };
      });
    }
    function altSummary() {
      const pfs = alts.filter((x) => fin(x.perf?.r1y));
      const beat = pfs.filter((x) => x.perf.r1y > (INR ? inCash : usCash)).length;
      const top = [...pfs].sort((a, b) => b.perf.r1y - a.perf.r1y), firm = [...alts].filter((x) => fin(x.tac.score) && x.tac.conf !== 'Low').sort((a, b) => b.tac.score - a.tac.score);
      const ranked = INR ? firm.filter((x) => x.access === 'dom') : firm, abroad = INR ? firm.filter((x) => x.access === 'cap' && x.tac.score >= 0.15).slice(0, 3) : [];
      const fl = flows().cftc;
      return { beat, n: pfs.length, best: top.slice(0, 3), worst: top.slice(-3).reverse(), most: ranked.filter((x) => x.tac.score >= 0.15).slice(0, 3), least: ranked.filter((x) => x.tac.score <= -0.15).slice(-3).reverse(), abroad, inflow: fl.filter((r) => r.v > 0).slice(0, 3), outflow: fl.filter((r) => r.v < 0).slice(-3).reverse(), flows: fl };
    }

    /* ---------- the call (summary) ---------- */
    function summary() {
      const eq = classes.find((r) => r.id === 'eq'), cashR = classes.find((r) => r.id === 'cash');
      const all = [...classes.filter((r) => !['eq', 'cash'].includes(r.id)), ...equity.map((r) => ({ ...r, name: r.name + ' equities' })), ...alts.filter((x) => !classes.some((c) => c.id === x.id))].filter((r) => fin(r.tac.score));
      // INR lens: lists show what an Indian institution can buy at home; overseas-only ideas are listed separately.
      const pool = INR ? all.filter((r) => r.access === 'dom') : all, abroad = INR ? all.filter((r) => r.access === 'cap') : [];
      const uniq = (a) => a.filter((r, i) => a.findIndex((q) => q.name === r.name) === i);
      const firm = pool.filter((r) => r.tac.conf !== 'Low');
      const favT = uniq(firm.filter((r) => r.tac.score >= 0.15).sort((a, b) => b.tac.score - a.tac.score)).slice(0, 4);
      const avoidT = uniq(firm.filter((r) => r.tac.score <= -0.15).sort((a, b) => a.tac.score - b.tac.score)).slice(0, 4);
      const sp = pool.filter((r) => fin(r.strat?.score) && r.strat.conf !== 'Low');
      const favS = uniq(sp.filter((r) => r.strat.score >= 0.15).sort((a, b) => b.strat.score - a.strat.score)).slice(0, 4);
      const avoidS = uniq(sp.filter((r) => r.strat.score <= -0.15).sort((a, b) => a.strat.score - b.strat.score)).slice(0, 4);
      const abroadT = uniq(abroad.filter((r) => r.tac.conf !== 'Low' && r.tac.score >= 0.15).sort((a, b) => b.tac.score - a.tac.score)).slice(0, 3);
      const abroadS = uniq(abroad.filter((r) => fin(r.strat?.score) && r.strat.conf !== 'Low' && r.strat.score >= 0.15).sort((a, b) => b.strat.score - a.strat.score)).slice(0, 3);
      const stance = !fin(eq?.tac.score) ? 'No view' : eq.tac.score >= 0.15 ? 'Risk-on' : eq.tac.score <= -0.15 ? 'Defensive' : 'Balanced';
      const dp = deploy();
      const list = (a) => (a.length ? a.map((r) => r.name).join(', ') : 'nothing stands out');
      const overseas = (a) => (INR && a.length ? ` With an overseas route (capped): ${list(a)}.` : '');
      const lines = [
        `${stance}: ${eq ? `${INR ? 'equities (85% India, 15% global)' : 'global equities'} ${eq.tac.view.toLowerCase()} for the next 3–12 months and ${eq.strat.view.toLowerCase()} for 3–5 years` : ''}. The regime: growth ${pil.growth.label.toLowerCase()}, inflation ${pil.inflation.label.toLowerCase()}, liquidity ${pil.liquidity.label.toLowerCase()}, valuations ${pil.valuation.label.toLowerCase()}.`,
        `Next 3–12 months — favour ${list(favT)}; avoid ${list(avoidT)}.${overseas(abroadT)}`,
        `Next 3–5 years — favour ${list(favS)}; avoid ${list(avoidS)}.${overseas(abroadS)}`,
        `${dp.howMuch} ${dp.howFast} ${dp.bonds}`,
      ];
      return { stance, lines, favT, avoidT, favS, avoidS, abroadT, abroadS, cash: cashR, deploy: dp, sens: eq?.strat?.sensText || null, fragile: !!eq?.strat?.fragile };
    }

    /* ---------- what changed in a week (signals recomputed with last week’s prices) ---------- */
    function changes() {
      const prevPerf = (a) => (a?.prev ? (INR ? a.prev.inr : a.prev.usd) : null);
      const out = [];
      for (const x of alts) {
        const pp = prevPerf(x.a); if (!pp) continue;
        const parts = x.tac.parts.map((p) => {
          if (p.k === 'trend') return { ...p, s: fin(pp.mom) && fin(pp.trend) ? 0.5 * th(pp.mom, 0.15) + 0.5 * th(pp.trend, 0.05) : p.s };
          if (p.k === 'value' && fin(x.a.real?.zPrev) && ['gold', 'cmdty', 'bcom'].includes(x.cfg.model)) return { ...p, s: -th(x.a.real.zPrev, 1.5) };
          if (p.k === 'value' && fin(x.a.real?.zDetPrev) && ['reit', 'infra', 'pe'].includes(x.cfg.model)) return { ...p, s: -th(x.a.real.zDetPrev, 1.5) };
          return p;
        });
        const prev = combine(parts);
        if (prev.notch !== x.tac.notch) out.push({ name: x.name, from: prev.arrow, to: x.tac.arrow, up: x.tac.notch > prev.notch, why: x.perf.r1w != null ? `${pc(x.perf.r1w, 1)} this week` : '' });
      }
      for (const r of equity) {
        const pp = prevPerf(r.a); if (!pp) continue;
        const prev = combine(r.tac.parts.map((p) => (p.k === 'trend' ? { ...p, s: fin(pp.mom) && fin(pp.trend) ? 0.5 * th(pp.mom, 0.15) + 0.5 * th(pp.trend, 0.05) : p.s } : p)));
        if (prev.notch !== r.tac.notch) out.push({ name: r.name + ' equities', from: prev.arrow, to: r.tac.arrow, up: r.tac.notch > prev.notch, why: r.perf?.r1w != null ? `${pc(r.perf.r1w, 1)} this week` : '' });
      }
      return out;
    }
    function snapshot() {
      const s = (x) => [fin(x.tac.score) ? +x.tac.score.toFixed(2) : null, fin(x.strat?.score) ? +x.strat.score.toFixed(2) : null];
      return { alts: Object.fromEntries(alts.map((x) => [x.id, [...s(x), x.a.usd?.last ?? null]])), eq: Object.fromEntries(equity.map((r) => [r.id, [...s(r), r.a?.usd?.last ?? null]])), classes: Object.fromEntries(classes.map((r) => [r.id, s(r)])) };
    }

    return {
      lens, CCY, INR, pil, cash, cashReal, infUS, infIN, usCash, inCash, eqER, eqRealLens,
      alts, equity, classes, policy: pol0, deploy, hedging, pricedIn, scenarios, setups, flows, depth, altSummary, summary, changes, snapshot,
      backtest: R.backtest, limits: C.limits || [], sources: C.sources || {}, msci: C.msci, imf: C.imf, imfYears: IMFY, watch: C.watch || [], limitsVerified: C.limitsVerified || null, rank,
    };
  }

  root.PEView = { create, helpers: { pc, pu, p2, pctl, usd, usdS, fin, ord, notchOf, ARROWS, VIEWS, ACCESS, why, against, fmtD } };
})(typeof window !== 'undefined' ? window : globalThis);
