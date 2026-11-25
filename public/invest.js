/* Global Markets Monitor — Investment View and Beyond Equities tabs.
   Loaded before app.js, which calls window.PEInvest(ctx). All judgements come from view.js (shared with the daily brief). */
window.PEInvest = function (ctx) {
  'use strict';
  const { state, el, showTip, hideTip, frame, statsFor } = ctx;
  const H = window.PEView.helpers, { pc, pu, p2, pctl, usd, usdS, fin } = H;
  const $ = (id) => document.getElementById(id);
  state.lens ||= (() => { try { return localStorage.getItem('pe-lens') || 'fii'; } catch { return 'fii'; } })();
  state.ivOpen ||= new Set();
  let V = null;
  const view = () => (V = window.PEView.create({ research: state.research, macro: state.macro, markets: state.markets, pos: state.pos, global: state.global, hist: state.hist, live: state.live?.ok ? state.live : null, n500pe: statsFor('n500')?.cur }, state.lens));

  /* ---------- small building blocks ---------- */
  const NCLS = { '-2': 'n-2', '-1': 'n-1', '0': 'n0', '1': 'n1', '2': 'n2' };
  function arrow(res, { big = false } = {}) {
    const s = el('span', `arr ${NCLS[res?.notch ?? 0]}${big ? ' big' : ''}`, res?.arrow ?? '–');
    s.title = res ? `${res.view} · confidence ${res.conf}${fin(res.score) ? ` · score ${res.score >= 0 ? '+' : '−'}${Math.abs(res.score).toFixed(2)}` : ''}` : '';
    return s;
  }
  const confTag = (res) => el('span', `conf c-${(res?.conf || 'Low').toLowerCase()}`, res?.conf || '—');
  function sbar(score) {
    const b = el('span', 'sbar'); if (!fin(score)) return b;
    const i = el('i'); const w = Math.min(50, Math.abs(score) * 50);
    i.style.left = score >= 0 ? '50%' : `${50 - w}%`; i.style.width = `${w}%`; i.className = score >= 0 ? 'pos' : 'neg';
    b.append(i); return b;
  }
  const td = (content, cls) => { const c = el('td', cls); if (content instanceof Node) c.append(content); else if (Array.isArray(content)) c.append(...content.filter(Boolean)); else c.textContent = content ?? '—'; return c; };
  const th = (t, cls, title) => { const c = el('th', cls, t); if (title) c.title = title; return c; };
  const sub = (main, s) => { const f = document.createDocumentFragment(); f.append(main); if (s) f.append(el('span', 'sub', s)); return f; };
  // Route for an Indian institution: shown in the INR lens only.
  const accessTag = (a) => (V?.INR && a ? el('span', `acc a-${a}`, H.ACCESS[a]) : null);
  const nameCell = (main, subs) => { const f = document.createDocumentFragment(); f.append(main); const parts = subs.filter(Boolean); if (parts.length) { const s = el('span', 'sub'); parts.forEach((x, i) => { if (i) s.append(' · '); s.append(x); }); f.append(s); } return f; };
  const colorPct = (v, scale = 0.2) => { const c = el('span', 'cv'); c.textContent = pc(v, Math.abs(v) < 0.1 ? 1 : 0); if (fin(v)) c.style.color = v > 0.0005 ? 'var(--good)' : v < -0.0005 ? 'var(--bad)' : ''; return c; };
  function heatCell(v, scale, d = 1) {
    const c = el('td', 'heat', fin(v) ? pc(v, d) : '—');
    if (fin(v)) { const a = Math.min(1, Math.abs(v) / scale); c.style.background = `color-mix(in srgb, ${v >= 0 ? 'var(--good)' : 'var(--bad)'} ${Math.round(6 + a * 40)}%, var(--panel))`; }
    return c;
  }
  const link = (t, u) => { const a = el('a', null, t); a.href = u; a.target = '_blank'; a.rel = 'noopener'; return a; };
  // Strongest reason and what would change the call.
  const mainReason = (res) => { const w = H.why(res, 1)[0]; return w ? w.t : res?.parts?.find((p) => fin(p.s))?.t || '—'; };
  function changeIf(res, a) {
    if (!fin(res?.score)) return '—';
    if (res.notch === 0) {
      const live = (res.parts || []).filter((p) => fin(p.s) && Math.abs(p.s) >= 0.15);
      const pos = live.filter((p) => p.s > 0).sort((x, y) => y.w * y.s - x.w * x.s)[0], neg = live.filter((p) => p.s < 0).sort((x, y) => x.w * x.s - y.w * y.s)[0];
      return pos && neg ? `${pos.name} (+) and ${neg.name.toLowerCase()} (−) offset each other; the call moves when one of them gives way` : pos ? `Stronger ${pos.name.toLowerCase()} would make it an overweight` : neg ? `Weaker ${neg.name.toLowerCase()} would make it an underweight` : 'Signals are flat; any decisive move';
    }
    const w = H.why(res, 1)[0]; if (!w) return 'Any signal moving decisively';
    const up = res.score > 0, ma = a?.usd?.ma40;
    switch (w.k) {
      case 'trend': return up ? `Price closes below its 40-week average${fin(ma) ? ` (≈${ma >= 100 ? Math.round(ma).toLocaleString('en-US') : ma.toFixed(2)} USD)` : ''}` : `Price recovers above its 40-week average${fin(ma) ? ` (≈${ma >= 100 ? Math.round(ma).toLocaleString('en-US') : ma.toFixed(2)} USD)` : ''}`;
      case 'value': return /yield|spread/i.test(w.t) ? (up ? 'Yields fall back towards their 10-year average' : 'Yields rise towards their 10-year average') : up ? 'Price rises back towards long-run value' : 'Price falls back towards long-run value';
      case 'carry': return up ? 'Futures curve flattens or yield falls towards cash' : 'Curve flips to backwardation or yields rise above cash';
      case 'macro': return up ? 'The regime turns (e.g. inflation cools, liquidity tightens)' : 'The regime turns in its favour';
      case 'pos': return up ? 'Speculators pile in (positioning above 85th pctl)' : 'Speculators cut (positioning normalises)';
      case 'policy': return up ? 'Central bank turns hawkish' : 'Central bank starts cutting';
      case 'eps': return up ? 'Earnings momentum fades' : 'Earnings start upgrading';
      case 'fx': return up ? 'The currency rebounds sharply' : 'The currency stabilises or cheapens further';
      case 'markets': case 'regime': return up ? 'Country signals and regime weaken' : 'Country signals and regime improve';
      case 'er': return up ? 'Prices rally enough to erode the expected return' : 'Prices fall or yields rise enough to lift the expected return';
      case 'div': return up ? 'It starts falling with equities in sell-offs' : 'It starts holding up in sell-offs';
      case 'growth': return up ? 'IMF growth forecasts are cut' : 'Growth forecasts are raised';
      case 'infl': return up ? 'Inflation turns up' : 'Inflation turns down';
      default: return 'The main signal reverses';
    }
  }
  // Expandable reasoning beneath a table row.
  function drill(res, strat, er, extra) {
    const box = el('div', 'drillbox');
    const col = (title, r) => {
      const c = el('div', 'dcol'); c.append(el('h4', null, title));
      if (!r) return c;
      const head = el('div', 'dhead'); head.append(arrow(r), el('b', null, r.view), confTag(r)); c.append(head);
      const ul = el('ul', 'parts');
      for (const p of r.parts) {
        const li = el('li'); const top = el('div', 'ptop');
        top.append(el('span', 'pname', `${p.name} · ${Math.round(p.w * 100)}%`), sbar(p.s), el('span', 'pval', fin(p.s) ? (p.s >= 0 ? '+' : '−') + Math.abs(p.s).toFixed(2) : 'n/a'));
        li.append(top, el('div', 'ptext', p.t)); ul.append(li);
      }
      c.append(ul); return c;
    };
    box.append(col('Tactical · 3–12 months', res), col('Strategic · 3–5 years', strat));
    if (er?.parts?.length) {
      const c = el('div', 'dcol'); c.append(el('h4', null, `Expected real return, 5 years (${V.CCY})`));
      const t = el('table', 'mini');
      for (const [k, v] of er.parts) { const r = el('tr'); r.append(el('td', null, k), el('td', 'num', fin(v) ? pc(v, 1) : '—')); t.append(r); }
      const tot = el('tr', 'tot'); tot.append(el('td', null, 'Total (real, a year)'), el('td', 'num', fin(er.real) ? pc(er.real, 1) : '—')); t.append(tot);
      c.append(t);
      if (!fin(er.real) && er.note) c.append(el('p', 'muted small', er.note));
      box.append(c);
    }
    if (extra) box.append(extra);
    return box;
  }
  function toggleRow(tbody, tr, key, cols, build) {
    tr.classList.add('click'); tr.tabIndex = 0;
    const open = () => { const d = el('tr', 'drill'); const c = el('td'); c.colSpan = cols; c.append(build()); d.append(c); tr.after(d); tr.classList.add('open'); };
    if (state.ivOpen.has(key)) open();
    const flip = () => { if (state.ivOpen.has(key)) { state.ivOpen.delete(key); tr.classList.remove('open'); if (tr.nextSibling?.classList?.contains('drill')) tr.nextSibling.remove(); } else { state.ivOpen.add(key); open(); } };
    tr.addEventListener('click', flip); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  }
  // In-page section links scroll without touching the tab hash.
  document.querySelectorAll('.subnav a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  function lensSegs() {
    document.querySelectorAll('.lens-seg').forEach((box) => {
      box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === state.lens));
      if (box.dataset.wired) return; box.dataset.wired = '1';
      box.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.dataset.v === state.lens) return; state.lens = b.dataset.v; try { localStorage.setItem('pe-lens', state.lens); } catch { /* private mode */ } render(state.tab); });
    });
  }
  const asOf = () => { const R = state.research; if (!R?.ok) return ''; const d = new Date(R.builtAt); return `Data built ${d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${R.stale ? ' (stale copy)' : ''} · weekly history to ${R.asOfWeek}`; };

  /* ======================= INVESTMENT VIEW ======================= */
  function renderCall() {
    const s = V.summary(), box = $('iv-call'); box.replaceChildren();
    const top = el('div', 'ctop');
    const st = el('span', `stance ${s.stance === 'Risk-on' ? 'n1' : s.stance === 'Defensive' ? 'n-1' : 'n0'}`, s.stance);
    top.append(st, el('span', 'muted small', V.INR ? 'Indian institution investing globally · returns in INR' : 'Foreign institution · returns in USD'));
    box.append(top);
    const ol = el('div', 'clines');
    s.lines.slice(1, 3).forEach((l) => { const p = el('p'); const m = l.match(/^(Next [^—]+—)(.*)$/); if (m) p.append(el('b', null, m[1]), m[2]); else p.textContent = l; ol.append(p); });
    const dp = s.deploy, lab = (t, k) => { const p = el('p'); p.append(el('b', null, k + ' '), t.replace(/^How (much|fast): /, '')); return p; };
    if (dp.howMuch) ol.append(lab(dp.howMuch, 'How much:'));
    ol.append(lab(dp.howFast, 'How fast:'), el('p', 'muted', dp.bonds));
    box.append(el('p', 'cfirst', s.lines[0]), ol);
    const chips = el('div', 'chips');
    const eq = V.classes.find((r) => r.id === 'eq'), cash = V.classes.find((r) => r.id === 'cash');
    const chip = (k, v, cls) => { const c = el('span', 'kchip ' + (cls || '')); c.append(el('span', 'k', k), el('b', null, v)); return c; };
    const wt = (v) => (fin(v) ? (Math.round(v * 10) / 10).toString() : '—');
    chips.append(
      chip('Equities 3–12m', `${eq?.tac.arrow ?? '–'} ${eq?.tac.view ?? ''}`, NCLS[eq?.tac.notch ?? 0]),
      chip('Equities 3–5y', `${eq?.strat.arrow ?? '–'} ${eq?.strat.view ?? ''}${eq?.strat.fragile ? ' · fragile' : ''}`, NCLS[eq?.strat.notch ?? 0]),
      chip('Equity target', `${wt(eq?.target)}% (policy ${eq?.policy ?? '—'}%)`),
      chip('Pace', `${dp.months} month${dp.months > 1 ? 's' : ''} · ${dp.tranches[0]}% now`),
      chip('Cash pays', `${pu(V.cash, 2)} (${pc(V.cashReal, 1)} real)`),
    );
    box.append(chips);
    if (s.sens) { const p = el('p', 'sens small'); p.append(el('b', null, '3–5y equity call by inflation assumption: '), s.sens + '.'); box.append(p); }
    $('iv-asof').textContent = asOf();
  }
  function renderClasses() {
    const t = $('tbl-classes'); t.replaceChildren();
    const thead = el('thead'), hr = el('tr');
    hr.append(th('Asset class'), th('Tactical', null, '3–12 months'), th('', 'sbcol'), th('Strategic', null, '3–5 years'), th(`5y real (${V.CCY})`, null, 'Expected real return a year over 5 years (building-block estimate)'), th('Policy %'), th('3–5y target %', null, 'Policy ± half a step per notch of the 3–5 year call (step = 10% of the sleeve, 0.5–3 points)'), th('3–12m model %', null, 'Target ± a full step per notch of the 3–12 month call; cash takes the other side'), th('Main reason', 'left'), th('What would change it', 'left'));
    thead.append(hr); t.append(thead);
    const tb = el('tbody');
    for (const r of V.classes) {
      const tr = el('tr');
      const wcell = (v, base) => { const d = fin(v) && fin(base) ? v - base : 0, c = el('span', null, fin(v) ? v.toFixed(1) : '—'); if (Math.abs(d) >= 0.05) c.append(el('span', `delta ${d > 0 ? 'up' : 'dn'}`, ` ${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}`)); return c; };
      const strat = [arrow(r.strat), confTag(r.strat)]; if (r.strat.fragile) strat.push(el('span', 'fragile', 'fragile'));
      const mcell = wcell(r.model, r.target); if (r.capped && r.tac.notch > 0) mcell.title = 'Not raised above policy: no route to buy this from India';
      tr.append(td(nameCell(r.name, [r.yieldNote, accessTag(r.access)]), 'strong'), td([arrow(r.tac), confTag(r.tac)]), td(sbar(r.tac.score), 'sbcol'), td(strat), td(fin(r.er.real) ? pc(r.er.real, 1) : '—'), td(String(r.policy)), td(wcell(r.target, r.policy)), td(mcell), td(mainReason(r.tac), 'left why'), td(changeIf(r.tac, r.alt ? state.research.assets[r.id] : null), 'left why muted'));
      tb.append(tr);
      toggleRow(tb, tr, 'c:' + r.id, 10, () => drill(r.tac, r.strat, r.er));
    }
    t.append(tb);
  }
  function renderCountries() {
    const t = $('tbl-eqmk'); t.replaceChildren();
    const thead = el('thead'), hr = el('tr');
    hr.append(th('Market'), th('Bench %', null, (V.INR ? 'Benchmark: 85% India, 15% MSCI ACWI ex-India' : 'Benchmark: MSCI ACWI weight') + (V.msci?.drift ? ` (factsheet ${V.msci.drift.from}, rolled forward with market moves to ${V.msci.drift.to})` : '')), th('Tactical'), th('', 'sbcol'), th('Strategic'), th('3–5y target %', null, 'Benchmark tilted by the 3–5 year view (±20% per notch; active weight capped at ±5 points)'), th('3–12m model %', null, 'Target plus the 3–12 month view (±25% per notch)'), th('PE', null, 'Siblis Research trailing PE vs its 5-year average'), th(`12m (${V.CCY})`, null, '12-month total return'), th(`5y real (${V.CCY})`, null, 'Expected real return a year over 5 years (building-block estimate)'), th('Main reason', 'left'));
    thead.append(hr); t.append(thead);
    const tb = el('tbody');
    const rows = [...V.equity].sort((a, b) => (b.tac.score ?? -9) - (a.tac.score ?? -9));
    let lastBand = null;
    for (const r of rows) {
      const band = r.tac.notch > 0 ? 'Overweight' : r.tac.notch < 0 ? 'Underweight' : 'Neutral';
      if (band !== lastBand) { const g = el('tr', 'grp'); const c = el('td', null, band); c.colSpan = 11; g.append(c); tb.append(g); lastBand = band; }
      const tr = el('tr');
      const wc = (v, base) => { const d = v - base, c = el('span', null, v.toFixed(2)); if (Math.abs(d) >= 0.005) c.append(el('span', `delta ${d > 0 ? 'up' : 'dn'}`, ` ${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}`)); return c; };
      const pe = fin(r.pe) ? sub(`${r.pe.toFixed(1)}x`, fin(r.vsAvg5) ? `${pc(r.vsAvg5)} vs 5y avg` : 'no history') : '—';
      tr.append(td(nameCell(r.name, [`${r.grp === 'DM' ? 'Developed' : 'Emerging'} · ${r.etf}${r.approx ? ' · weight ≈' : ''}`, accessTag(r.access)]), 'strong'), td(r.bench.toFixed(2)), td([arrow(r.tac), confTag(r.tac)]), td(sbar(r.tac.score), 'sbcol'), td([arrow(r.strat), confTag(r.strat)]), td(wc(r.wStrat, r.bench)), td(wc(r.wTac, r.wStrat)), td(pe), td(colorPct(r.perf?.r1y)), td(fin(r.er.real) ? pc(r.er.real, 1) : '—'), td(mainReason(r.tac), 'left why'));
      tb.append(tr);
      toggleRow(tb, tr, 'e:' + r.id, 11, () => drill(r.tac, r.strat, r.er));
    }
    const rest = el('tr', 'muted'); rest.append(td('Rest of world'), td((V.equity.rest ?? 0).toFixed(2)), td(''), td('', 'sbcol'), td(''), td((V.equity.rest ?? 0).toFixed(2)), td((V.equity.restTac ?? V.equity.rest ?? 0).toFixed(2)), td(''), td(''), td(''), td('Other markets held at benchmark', 'left why')); tb.append(rest);
    t.append(tb);
  }
  function renderDeploy() {
    const dp = V.deploy(), box = $('iv-deploy'); box.replaceChildren();
    const lead = (k, t) => { const p = el('p', 'lead'); p.append(el('b', null, k + ' '), t.replace(/^How (much|fast): /, '')); return p; };
    if (dp.howMuch) box.append(lead('How much:', dp.howMuch));
    box.append(lead('How fast:', dp.howFast));
    const bar = el('div', 'tranches'); dp.tranches.forEach((p, i) => { const s = el('span', i === 0 ? 'now' : null, `${p}%`); s.style.flex = p; s.title = i === 0 ? 'Now' : `Tranche ${i + 1}`; bar.append(s); });
    box.append(bar, el('p', 'muted small', `Equity sleeve: ${dp.tranches.length} tranches over ${dp.months} month${dp.months > 1 ? 's' : ''} · ${dp.inputs.valuation} · trend ${pc(dp.inputs.trend, 1)} vs 40-week average${fin(dp.inputs.vix) ? ` · VIX ${dp.inputs.vix.toFixed(1)}` : ''}${dp.tight ? ' · liquidity tightening' : ''}`));
    const ul = el('ul', 'dlist'); [dp.bonds, dp.alts, dp.park].forEach((x) => ul.append(el('li', null, x))); box.append(ul);
    const g = el('div', 'trig');
    const col = (h, items, cls) => { const c = el('div', cls); c.append(el('b', null, h)); const u = el('ul'); items.forEach((x) => u.append(el('li', null, x))); c.append(u); return c; };
    g.append(col('Speed up if', dp.triggers.faster, 'fast'), col('Slow down if', dp.triggers.slower, 'slow'));
    box.append(g);
    const ev = el('p', 'muted small'); ev.append('Evidence: investing a lump sum beat spreading it over 12 months about two-thirds of the time, because markets rise more often than they fall; staging trades some return for lower regret and valuation risk. ', link(V.sources.vanguard?.t || 'Vanguard (2012)', V.sources.vanguard?.u || '#'));
    box.append(ev);
  }
  function renderPriced() {
    const box = $('iv-priced'); box.replaceChildren();
    for (const p of V.pricedIn()) { const r = el('div', 'prow'); r.append(el('span', 'pk', p.k), el('div', null)); r.lastChild.append(el('b', null, p.what), el('p', 'muted', p.read)); box.append(r); }
  }
  function renderScenarios() {
    const box = $('iv-scen'); box.replaceChildren();
    for (const s of V.scenarios()) {
      const c = el('div', 'scard');
      const h = el('div', 'shead'); h.append(el('b', null, s.name), el('span', `lvl ${s.level.toLowerCase().replace('/', '')}`, s.level)); c.append(h, el('p', 'muted small', s.desc));
      const ul = el('ul', 'sigs'); for (const x of s.sig) { const li = el('li', x.on ? 'on' : x.on === false ? 'off' : 'na'); li.append(el('i', null, x.on ? '●' : '○'), el('span', null, x.t), el('b', null, x.v)); ul.append(li); } c.append(ul);
      const hl = (title, items, cls) => { const d = el('div', 'hl ' + cls); d.append(el('span', 'muted small', title)); const w = el('div', 'tags'); items.forEach((x) => w.append(el('span', 'tag', `${x.name} ${pc(x.v, 1)}`))); d.append(w); return d; };
      c.append(hl('Held up best (avg weekly return in such weeks)', s.holds, 'good'), hl('Suffered most', s.hurts, 'bad'));
      box.append(c);
    }
  }
  function renderHedge() {
    const h = V.hedging(); $('iv-hedge-home').textContent = h.home?.text || '';
    const t = $('tbl-hedge'); t.replaceChildren();
    const hr = el('tr'); hr.append(th('Currency'), th(V.INR ? 'Hedge carry vs INR' : 'Hedge carry vs USD', null, 'Positive = hedging earns (your home rate is higher)'), th('Real value', null, 'BIS real effective exchange rate vs its 10-year history'), th('Equities: hedge?', 'left'));
    const thead = el('thead'); thead.append(hr); t.append(thead);
    const tb = el('tbody');
    for (const r of h.rows) {
      const tr = el('tr'); const rec = el('span', `rec ${r.rec.startsWith('Hedge') ? 'h' : r.rec.startsWith('Unhedged') ? 'u' : 'p'}`, r.rec);
      const recCell = el('div', 'recc'); recCell.append(rec, el('span', 'sub', r.why));
      tr.append(td(sub(r.ccy, r.market)), td(colorPct(r.carry)), td(fin(r.pct) ? `${pctl(r.pct)}${r.z > 1 ? ' · rich' : r.z < -1 ? ' · cheap' : ''}` : '—'), td(recCell, 'left wrap'));
      tb.append(tr);
    }
    t.append(tb);
  }
  function renderChanges() {
    const box = $('iv-changes'); box.replaceChildren();
    const B = state.brief, logged = B?.viewChanges?.[state.lens];
    const ch = logged || V.changes();
    box.append(el('h3', null, 'Since last week'));
    if (!ch.length) box.append(el('p', 'muted', logged ? 'No tactical call has changed notch since last week.' : 'No tactical call changed notch on last week’s price moves.'));
    else { const ul = el('ul', 'chg'); for (const c of ch) { const li = el('li'); li.append(el('span', `arr ${c.up ? 'n1' : 'n-1'}`, c.up ? '↑' : '↓'), el('b', null, c.name), ` ${c.from} → ${c.to}`, c.why ? el('span', 'muted', ` · ${c.why}`) : ''); ul.append(li); } box.append(ul); }
    const lg = B?.viewLog;
    box.append(el('p', 'muted small', logged ? `Compared with the logged view of ${B.viewChanges.basis}. The full view is logged every weekday at 07:00 IST${lg?.days ? ` (${lg.days} days since ${lg.since})` : ''}.` : `Recomputed with last week’s prices; macro and positioning inputs held constant. The full view is logged every weekday at 07:00 IST from launch${lg?.days ? ` (${lg.days} day${lg.days > 1 ? 's' : ''} so far)` : ''}; after a week this list switches to the logged calls.`));
    const bt = V.backtest; if (!bt?.alts) return;
    box.append(el('h3', null, 'Track record (backtest)'));
    const t = el('table', 'mini bt'); const hr = el('tr'); hr.append(el('th', null, 'Signal skill (IC)'), el('th', null, '3m'), el('th', null, '6m'), el('th', null, '12m'));
    t.append(hr);
    const row = (label, g, k) => { const r = el('tr'); r.append(el('td', null, label)); for (const h of ['h13', 'h26', 'h52']) { const v = bt[g]?.ic?.[h]?.[k]; const c = el('td', 'num', fin(v) ? v.toFixed(2) : '—'); if (fin(v)) c.style.color = v >= 0.05 ? 'var(--good)' : v < 0 ? 'var(--bad)' : ''; r.append(c); } t.append(r); };
    row('Beyond equities · trend', 'alts', 'trend'); row('Beyond equities · value', 'alts', 'value'); row('Beyond equities · blend', 'alts', 'blend');
    row('Countries · trend', 'eq', 'trend'); row('Countries · value', 'eq', 'value'); row('Countries · blend', 'eq', 'blend');
    box.append(t);
    const a = bt.alts.rank, e = bt.eq.rank;
    box.append(el('p', 'small', `Ranking test (top third minus bottom third by the blended signal, 6-month holds): beyond-equity assets ${pc(a?.spread, 1)} a year, right ${pu(a?.hit, 0)} of the time; countries ${pc(e?.spread, 1)} a year, right ${pu(e?.hit, 0)} of the time. Period ${bt.alts.from} to ${bt.alts.to}.`));
    box.append(el('p', 'muted small', 'Reading: value (cheap vs own history) predicted better than trend in this decade, so the tactical score weights valuation and carry above trend. Price signals alone are weak for countries; their calls also use earnings, policy and currency, which cannot be backtested here. IC = correlation of signal with the next period’s volatility-scaled return over T-bills; 0.05 is useful, 0.10 strong.'));
  }
  function renderLimits() {
    const sec = $('iv-limits-sec'); sec.hidden = !V.INR; if (!V.INR) return;
    const t = $('tbl-limits'); t.replaceChildren();
    const hr = el('tr'); hr.append(th('Route', 'left'), th('Limit', 'left'), th('Note', 'left'), th('Source', 'left')); const thead = el('thead'); thead.append(hr); t.append(thead);
    const tb = el('tbody');
    for (const l of V.limits) { const tr = el('tr'); tr.append(td(l.k, 'left strong'), td(l.v, 'left why'), td(l.note, 'left why muted'), td(link(l.src, l.u), 'left')); tb.append(tr); }
    t.append(tb);
    // Regulator watch: RBI and SEBI items that may change these limits (checked automatically; values are never rewritten by a machine).
    const w = $('iv-watch'); w.replaceChildren();
    const ver = V.limitsVerified, fresh = (V.watch || []).filter((x) => !ver || x.date > ver);
    const dmy = (s) => (s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'n/a');
    w.append(el('p', 'muted small', `Limits last checked against the sources on ${dmy(ver)}. RBI and SEBI releases are scanned automatically for anything on overseas investment, LRS, GIFT City, AIFs, REITs or commodity derivatives${fresh.length ? ':' : '.'}`));
    const items = (V.watch || []).slice(0, 6);
    if (items.length) {
      const ul = el('ul', 'watch-list');
      for (const x of items) { const li = el('li'); if (!ver || x.date > ver) li.append(el('span', 'acc a-cap', 'New: check')); li.append(el('span', 'muted', ` ${dmy(x.date)} · ${x.src} · `), link(x.title, x.url)); ul.append(li); }
      w.append(ul);
    } else w.append(el('p', 'muted small', 'Nothing relevant in the latest releases.'));
  }
  function renderView() {
    lensSegs();
    if (!state.research?.ok || !state.macro?.ok) { $('iv-call').replaceChildren(el('div', 'empty pad', state.research?.error ? 'Research data unavailable right now — retrying' : 'Loading the investment view…')); return; }
    view();
    renderCall(); renderClasses(); renderCountries(); renderDeploy(); renderPriced(); renderScenarios(); renderHedge(); renderChanges(); renderLimits();
  }

  /* ======================= ALTERNATIVES ======================= */
  function renderAltCall() {
    const s = V.altSummary(), box = $('alt-call'); box.replaceChildren();
    const nm = (x) => `${x.name} ${pc(x.perf.r1y)}`;
    const fl = (r) => `${r.name} ${usdS(r.v)}`;
    const lines = [
      ['How they are doing', `${s.beat} of ${s.n} assets beat cash (${pu(V.INR ? V.inCash : V.usCash, 1)}) over 12 months in ${V.CCY}. Leaders: ${s.best.map(nm).join(', ')}. Laggards: ${s.worst.map(nm).join(', ')}.`],
      ['Where money is flowing', !s.flows.length ? 'CFTC flow data unavailable.' : !s.inflow.length ? `Speculators cut positions in all ${s.flows.length} commodity futures tracked over the last 4 weeks (CFTC); the biggest cuts: ${s.outflow.map(fl).join(', ')}.` : !s.outflow.length ? `Speculators added to all ${s.flows.length} commodity futures tracked over the last 4 weeks (CFTC), most to ${s.inflow.map(fl).join(', ')}.` : `Over the last 4 weeks speculators (CFTC) added to ${s.inflow.map(fl).join(', ')} and cut ${s.outflow.map(fl).join(', ')}.`],
      ['Most attractive now', `${s.most.length ? s.most.map((x) => `${x.name} ${x.tac.arrow}`).join(', ') : 'no firm overweight'}. Least: ${s.least.length ? s.least.map((x) => `${x.name} ${x.tac.arrow}`).join(', ') : 'no firm underweight'}.${V.INR ? ` These lists cover assets traded in India.${s.abroad.length ? ` With an overseas route (capped): ${s.abroad.map((x) => `${x.name} ${x.tac.arrow}`).join(', ')}.` : ''}` : ''} (Calls with low confidence are left out here.)`],
    ];
    for (const [k, v] of lines) { const p = el('p'); p.append(el('b', null, k + ' — '), v); box.append(p); }
    $('alt-asof').textContent = asOf();
  }
  function altDrillExtra(x) {
    const c = el('div', 'dcol');
    c.append(el('h4', null, `Price, 2 years (${V.CCY}, total return)`));
    const chart = el('div', 'chart'); chart.style.height = '150px'; c.append(chart);
    requestAnimationFrame(() => drawSpark(chart, x));
    const facts = el('ul', 'facts');
    const add = (k, v) => { if (v == null || v === '—') return; const li = el('li'); li.append(el('span', 'muted', k + ' '), el('b', null, v)); facts.append(li); };
    add('Role:', x.cfg.role); add('Volatility (1y):', pu(x.a.usd?.vol1y, 0)); add('Correlation with global stocks (3y):', fin(x.a.corr?.acwi?.c) ? x.a.corr.acwi.c.toFixed(2) : '—');
    add('From 10-year high:', pc(x.a.usd?.ddMax)); add('Access from India:', x.cfg.india);
    c.append(facts);
    const src = el('p', 'muted small'); src.append('Sources: ', link('Yahoo Finance', `https://finance.yahoo.com/quote/${encodeURIComponent(x.cfg.sym)}`));
    if (x.cot) src.append(' · ', link('CFTC COT', V.sources.cftc?.u || 'https://www.cftc.gov'));
    if (['gold', 'cmdty', 'bcom'].includes(x.cfg.model)) src.append(' · ', link('BIS (US CPI)', V.sources.bis?.u || 'https://data.bis.org'));
    if (x.cfg.model === 'gold') src.append(' · ', link('Erb & Harvey on gold valuation', V.sources.erb?.u || '#'));
    c.append(src);
    return c;
  }
  function drawSpark(node, x) {
    const R = state.research, pts = x.a.spark; if (!pts?.length || !node.clientWidth) return;
    const fx = R.usdinr?.spark || [];
    const vals = pts.map((v, i) => (v == null ? null : V.INR ? v * (fx[i] ?? fx.at(-1)) : v));
    const start = Date.parse(R.sparkFrom), data = vals.map((v, i) => ({ d: new Date(start + i * 7 * 864e5), v })).filter((p) => p.v != null);
    const ma = data.map((p, i) => ({ d: p.d, v: i >= 39 ? d3.mean(data.slice(i - 39, i + 1), (q) => q.v) : null })).filter((p) => p.v != null);
    const { svg, M, iw, ih } = frame(node, 150, { t: 8, r: 8, b: 20, l: 44 });
    const xs = d3.scaleUtc().domain(d3.extent(data, (p) => p.d)).range([0, iw]);
    const ys = d3.scaleLinear().domain(d3.extent(data, (p) => p.v)).nice().range([ih, 0]);
    const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
    g.append('g').attr('class', 'grid').call(d3.axisLeft(ys).ticks(4).tickSize(-iw).tickFormat('')).call((s) => s.select('.domain').remove());
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(xs).ticks(4).tickFormat(d3.utcFormat("%b '%y")));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(ys).ticks(4).tickFormat(d3.format('~s')));
    g.append('path').datum(ma).attr('fill', 'none').attr('stroke', 'var(--ref)').attr('stroke-dasharray', '4 3').attr('d', d3.line().x((p) => xs(p.d)).y((p) => ys(p.v)));
    g.append('path').datum(data).attr('fill', 'none').attr('stroke', 'var(--c-n500)').attr('stroke-width', 1.8).attr('d', d3.line().x((p) => xs(p.d)).y((p) => ys(p.v)));
    g.append('text').attr('x', iw).attr('y', 10).attr('text-anchor', 'end').attr('font-size', 10.5).attr('fill', 'var(--muted)').text('dashed: 40-week average');
  }
  function renderAltTable() {
    const t = $('tbl-alts'); t.replaceChildren();
    const hr = el('tr'); hr.append(th('Asset (rank)', 'left'), th('Tactical'), th('', 'sbcol'), th('Strategic'), th(`5y real (${V.CCY})`), th(`1y (${V.CCY})`), th('Yield / carry', null, 'Distribution yield, or futures roll yield a year'), th('Valuation'), th('Trend'), th('Main reason', 'left'));
    const thead = el('thead'); thead.append(hr); t.append(thead);
    const tb = el('tbody');
    const rows = [...V.alts].sort((a, b) => (b.tac.score ?? -9) - (a.tac.score ?? -9));
    rows.forEach((x, i) => {
      const tr = el('tr');
      const carry = x.a.carry ? `${pc(x.a.carry.roll, 1)} roll` : x.cfg.model === 'none' ? 'none' : fin(x.yield) ? `${pu(x.yield)} yield` : '—';
      const valP = x.tac.parts.find((p) => p.k === 'value'), trP = x.tac.parts.find((p) => p.k === 'trend');
      const tag = (p) => (fin(p?.s) ? el('span', `vtag ${p.s > 0.25 ? 'g' : p.s < -0.25 ? 'b' : ''}`, p.k === 'value' ? (p.s > 0.25 ? 'Cheap' : p.s < -0.25 ? 'Rich' : 'Fair') : p.s > 0.25 ? 'Up' : p.s < -0.25 ? 'Down' : 'Flat') : el('span', 'muted', 'n/a'));
      tr.append(td(nameCell(`${i + 1}. ${x.name}`, [x.group, accessTag(x.access)]), 'left strong'), td([arrow(x.tac), confTag(x.tac)]), td(sbar(x.tac.score), 'sbcol'), td([arrow(x.strat), confTag(x.strat)]), td(fin(x.er.real) ? pc(x.er.real, 1) : 'n/a'), td(colorPct(x.perf?.r1y)), td(carry), td(tag(valP)), td(tag(trP)), td(mainReason(x.tac), 'left why'));
      tb.append(tr);
      toggleRow(tb, tr, 'a:' + x.id, 10, () => drill(x.tac, x.strat, x.er, altDrillExtra(x)));
    });
    t.append(tb);
  }
  function renderAltPerf() {
    const t = $('tbl-altperf'); t.replaceChildren();
    const cols = [['r1m', '1M', 0.1], ['r3m', '3M', 0.2], ['ytd', 'YTD', 0.3], ['r1y', '1Y', 0.4], ['r3y', '3Y a yr', 0.2], ['r5y', '5Y a yr', 0.15]];
    const hr = el('tr'); hr.append(th('Asset', 'left'), ...cols.map(([, l]) => th(l)), th('Volatility'), th('From 10y high'));
    const thead = el('thead'); thead.append(hr); t.append(thead);
    const tb = el('tbody'); let grp = null;
    const add = (name, pf, a, g) => {
      if (g !== grp) { const r = el('tr', 'grp'); const c = el('td', null, g); c.colSpan = 9; r.append(c); tb.append(r); grp = g; }
      const tr = el('tr'); tr.append(td(name, 'left strong'), ...cols.map(([k, , sc]) => heatCell(pf?.[k], sc)), td(pu(a?.usd?.vol1y, 0)), td(pc(a?.usd?.ddMax)));
      tb.append(tr);
    };
    for (const x of V.alts) add(x.name, x.perf, x.a, x.group);
    const A = state.research.assets, P = (a) => (V.INR ? a?.inr : a?.usd);
    for (const [id, nm] of [['acwi', 'Global equities (ACWI)'], ['ust', 'US Treasuries 7–10y'], ['cash', 'US T-bills']]) add(nm, P(A[id]), A[id], 'For comparison');
    t.append(tb);
  }
  function renderFlows() {
    const node = $('alt-flows'); const F = V.flows().cftc;
    if (!F.length) { node.replaceChildren(el('div', 'empty', 'CFTC data unavailable')); return; }
    if (!node.clientWidth) return;
    const rowH = 28, h = F.length * rowH + 34;
    node.style.height = h + 'px';
    const { svg, M, iw, ih } = frame(node, h, { t: 6, r: 64, b: 24, l: Math.min(140, node.clientWidth * 0.3) });
    const ext = d3.max(F, (r) => Math.abs(r.v)) || 1;
    const x = d3.scaleLinear().domain([-ext, ext]).nice().range([0, iw]), y = d3.scaleBand().domain(F.map((r) => r.name)).range([0, ih]).padding(0.28);
    const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
    g.append('g').attr('class', 'grid').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(5).tickSize(-ih).tickFormat('')).call((s) => s.select('.domain').remove());
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(5).tickFormat((v) => (v === 0 ? '0' : (v > 0 ? '+' : '−') + '$' + d3.format('~s')(Math.abs(v)).replace('G', 'bn'))));
    g.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', ih).attr('stroke', 'var(--ref)');
    g.selectAll('text.n').data(F).join('text').attr('x', -8).attr('y', (r) => y(r.name) + y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 12).attr('fill', 'currentColor').text((r) => r.name);
    g.selectAll('rect.b').data(F).join('rect').attr('x', (r) => x(Math.min(0, r.v))).attr('width', (r) => Math.abs(x(r.v) - x(0))).attr('y', (r) => y(r.name)).attr('height', y.bandwidth()).attr('rx', 3)
      .attr('fill', (r) => (r.v >= 0 ? 'var(--good)' : 'var(--bad)')).attr('opacity', 0.85)
      .on('pointermove', (ev, r) => showTip(ev, r.name, [['4-week change', usdS(r.v)], ['Last week', usdS(r.w1)], ['Net position', usdS(r.net)], ['Positioning vs 3 years', pctl(r.pct)], ['Who', r.who], ['Report date', r.asOf]])).on('pointerleave', hideTip);
    g.selectAll('text.v').data(F).join('text').attr('x', iw + 8).attr('y', (r) => y(r.name) + y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'start').attr('font-size', 11).attr('font-weight', 600).attr('fill', (r) => (r.v >= 0 ? 'var(--good)' : 'var(--bad)')).text((r) => usdS(r.v));
    $('alt-flows-note').textContent = `CFTC Commitments of Traders, report of ${F[0]?.asOf ?? '—'}: change in managed-money net futures positions over 4 weeks, valued at today’s prices. Brent has no CFTC report; WTI stands in for crude.`;
  }
  function renderSetups() {
    const box = $('alt-setups'); box.replaceChildren(); const S = V.setups();
    const block = (title, items, cls, empty) => {
      const d = el('div', 'setblock'); d.append(el('h3', null, title));
      if (!items.length) { d.append(el('p', 'muted small', empty)); return d; }
      const grid = el('div', 'setgrid'); d.append(grid);
      for (const x of items) {
        const c = el('div', 'setup ' + cls); const h = el('div', 'shead'); h.append(el('b', null, x.name), arrow(V.alts.find((a) => a.id === x.id)?.tac)); c.append(h);
        c.append(el('p', 'small', 'Why now: ' + x.why.join('; ') + '.'));
        if (x.confirm) { c.append(el('p', 'small muted', 'Confirms if: ' + x.confirm + '.'), el('p', 'small muted', 'Cancels if: ' + x.cancel + '.')); }
        grid.append(c);
      }
      return d;
    };
    box.append(block('Early setups — cheap or washed out, turning up', S.early, 'early', 'None right now: nothing cheap has started to turn up.'), block('Stretched — rich or crowded, turning down', S.late, 'late', 'None right now.'));
  }
  function renderProtect() {
    const t = $('tbl-protect'); t.replaceChildren(); const R = state.research;
    const cols = [['eqDown', 'Stocks sell off'], ['ratesUp', 'Bond sell-off'], ['inflUp', 'Inflation surprise'], ['usdUp', 'Dollar jumps'], ['oilUp', 'Oil spike'], ...(V.INR ? [['inrDown', 'Rupee slides']] : [])];
    const tip = { eqDown: 'Worst 10% of weeks for MSCI ACWI', ratesUp: 'Worst 10% of weeks for 7–10y Treasuries (yields up)', inflUp: 'Best 10% of weeks for TIPS vs Treasuries (breakevens up)', usdUp: 'Best 10% of weeks for the dollar index', oilUp: 'Best 10% of weeks for Brent', inrDown: 'Worst 10% of weeks for the rupee (returns in INR)' };
    const hr = el('tr'); hr.append(th('Average weekly return when…', 'left'), ...cols.map(([k, l]) => th(l, null, `${tip[k]}; threshold ${pc(R.thresholds?.[k], 1)}`)));
    const thead = el('thead'); thead.append(hr); t.append(thead);
    const tb = el('tbody');
    const rows = [...V.alts.map((x) => ({ name: x.name, a: x.a })), { name: 'Global equities (ACWI)', a: R.assets.acwi, ref: true }, { name: 'US Treasuries 7–10y', a: R.assets.ust, ref: true }, { name: 'US T-bills', a: R.assets.cash, ref: true }];
    for (const r of rows) {
      const tr = el('tr', r.ref ? 'ref' : null); tr.append(td(r.name, 'left strong'));
      for (const [k] of cols) { const c = (k === 'inrDown' ? r.a?.condInr?.[k] : r.a?.cond?.[k]); const cell = heatCell(c?.avg, 0.03, 1); if (c) cell.title = `${c.n} weeks; positive ${pu(c.hit, 0)} of the time`; tr.append(cell); }
      tb.append(tr);
    }
    t.append(tb);
  }
  function renderDepth() {
    const fx = state.research.usdinr?.last || 90, ticket = V.INR ? 1000 * 1e7 / fx : 100e6;
    $('depth-note').textContent = `Days to buy a ${V.INR ? '₹1,000 crore' : '$100 million'} position trading 10% of average daily value, a common institutional rule of thumb. Futures and the largest ETF shown; the underlying physical or private market is often much bigger.`;
    const t = $('tbl-depth'); t.replaceChildren();
    const hr = el('tr'); hr.append(th('Asset', 'left'), th('Most liquid route', 'left'), th('Avg daily value'), th('Size', null, 'Fund assets, futures open interest or market cap'), th('Days'), th('Depth'), th('Access from India', 'left'));
    const thead = el('thead'); thead.append(hr); t.append(thead);
    const tb = el('tbody');
    for (const r of V.depth(ticket)) {
      const tr = el('tr'); const tier = el('span', `tier t-${r.tier.toLowerCase().replace('/', '')}`, r.tier);
      tr.append(td(r.name, 'left strong'), td(r.via || '—', 'left'), td(usd(r.adv)), td(r.mcap ? usd(r.mcap) + ' mkt cap' : r.oi ? usd(r.oi) + ' OI' : r.aum ? usd(r.aum) + ' AUM' : '—'), td(fin(r.days) ? (r.days < 0.1 ? '<0.1' : r.days < 10 ? r.days.toFixed(1) : Math.round(r.days)) : '—'), td(tier), td(r.india + (r.privateNote ? ' · listed proxy; private funds lock up capital for years' : ''), 'left why muted'));
      tb.append(tr);
    }
    t.append(tb);
  }
  function renderCurves() {
    const t = $('tbl-curves'); t.replaceChildren();
    const hr = el('tr'); hr.append(th('Futures', 'left'), th('Front'), th('~12 months out'), th('Carry a year'), th('Shape', 'left'));
    const thead = el('thead'); thead.append(hr); t.append(thead);
    const tb = el('tbody');
    for (const x of V.alts.filter((a) => a.a.carry)) {
      const c = x.a.carry, f = (v) => (v >= 100 ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : v.toFixed(v >= 10 ? 2 : 3));
      const tr = el('tr'); tr.append(td(x.name, 'left strong'), td(sub(f(c.frontPx), c.front)), td(sub(f(c.farPx), c.far)), td(colorPct(c.roll)), td(c.roll > 0.02 ? 'Backwardation: tight supply; long holders earn the roll' : c.roll < -0.02 ? 'Contango: ample supply or storage cost; long holders pay the roll' : 'Flat', 'left why muted'));
      tb.append(tr);
    }
    t.append(tb);
  }
  function renderAlts() {
    lensSegs();
    if (!state.research?.ok) { $('alt-call').replaceChildren(el('div', 'empty pad', state.research?.error ? 'Research data unavailable right now — retrying' : 'Loading alternatives…')); return; }
    view();
    renderAltCall(); renderAltTable(); renderAltPerf(); renderFlows(); renderSetups(); renderProtect(); renderDepth(); renderCurves();
  }

  function render(tab) { try { if (tab === 'view') renderView(); if (tab === 'beyond') renderAlts(); } catch (e) { console.error(e); } }
  return { renderTab: render, view: () => V };
};
