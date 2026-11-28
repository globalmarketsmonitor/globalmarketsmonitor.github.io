/* Global Markets Monitor — macro layer: regime, alerts, checklist, indicator cards, curve, CPI, India.
   Loaded before app.js, which calls window.PEMacro(ctx) with shared state and helpers. */
window.PEMacro = function (ctx) {
  'use strict';
  const { state, el, f1, f2, pctS, ord, showTip, hideTip, cssVar, frame, fmtD, parseD, statsFor, IDS } = ctx;
  const I = () => state.macro?.indicators || {};
  const has = (id) => I()[id] != null;
  const fmtV = (ind, v = ind.last) => {
    if (v == null || !isFinite(v)) return '—';
    const u = ind.unit || '', dp = ind.dp ?? 2;
    const n = Math.abs(v) >= 1000 ? d3.format(',.' + Math.min(dp, 0) + 'f')(v) : v.toFixed(dp);
    return u === '$' || u === '₹' ? u + n : u === '$tn' ? '$' + n + 'tn' : u === '%' ? n + '%' : u === 'pp' ? n + ' pp' : n;
  };
  const fmtChg = (ind, c) => {
    if (c == null || !isFinite(c)) return '—';
    if (ind.chgType === 'pct') return pctS(c, Math.abs(c) < 0.1 ? 1 : 0);
    if (ind.freq === 'monthly' && ind.unit === '%') return (c >= 0 ? '+' : '−') + Math.abs(c).toFixed(1) + 'pp';
    const bp = ind.unit === '%' || ind.unit === 'pp';
    return bp ? (c >= 0 ? '+' : '−') + Math.abs(c * 100).toFixed(0) + 'bp' : (c >= 0 ? '+' : '−') + Math.abs(c).toFixed(ind.dp ?? 1);
  };
  const daysOld = (d) => (Date.now() - Date.parse(d)) / 864e5;
  // Policy rates only print when they change, so allow them longer before calling them stale.
  const stale = (ind) => (ind.freq === 'monthly' ? daysOld(ind.asOf) > 75 : daysOld(ind.asOf) > (ind.name.startsWith('Policy rate') ? 45 : 10));
  const ma40 = (ind) => { const s = ind?.spark; if (!s || s.length < 30) return null; const pts = s.slice(-40).map((p) => p[1]); return pts.reduce((a, b) => a + b, 0) / pts.length; };
  const pp = (v) => (v != null && Math.abs(v) < 0.0005 ? 'flat' : pctS(v, v != null && Math.abs(v) < 0.1 ? 1 : 0));
  const sig = (v, up, dn, invert = false) => { if (v == null || !isFinite(v)) return null; const s = v > up ? 1 : v < dn ? -1 : 0; return invert ? -s : s; };

  /* ---------------- regime and alert rules: shared with the daily brief (rules.js) ---------------- */
  const R = () => window.PERules.create({ macro: state.macro, hist: state.hist, global: state.global, markets: state.markets, pos: state.pos, n500pe: statsFor('n500')?.cur });
  const PILLARS = window.PERules.PILLARS;
  const erp = () => R().erp();
  const longPct = (id, w) => R().longPct(id, w);
  const pillar = (k) => R().pillar(k);

  /* ---------------- sparkline ---------------- */
  function spark(node, pts, { color = 'var(--c-n500)', h = 36, ind } = {}) {
    node.replaceChildren();
    if (!pts || pts.length < 2) return;
    const W = Math.max(80, node.clientWidth || 160), H = h, P = 3;
    const svg = d3.select(node).append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('aria-hidden', 'true');
    const data = pts.map(([d, v]) => ({ date: parseD(d), v }));
    const x = d3.scaleUtc().domain(d3.extent(data, (p) => p.date)).range([P, W - P - 4]);
    const y = d3.scaleLinear().domain(d3.extent(data, (p) => p.v)).range([H - P, P]);
    svg.append('path').datum(data).attr('d', d3.area().x((p) => x(p.date)).y0(H).y1((p) => y(p.v))).attr('fill', color).attr('opacity', 0.08);
    svg.append('path').datum(data).attr('d', d3.line().x((p) => x(p.date)).y((p) => y(p.v))).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 1.5);
    const last = data.at(-1);
    svg.append('circle').attr('cx', x(last.date)).attr('cy', y(last.v)).attr('r', 2.6).attr('fill', color);
    if (ind) {
      const dot = svg.append('circle').attr('r', 3).attr('fill', color).attr('opacity', 0);
      const bis = d3.bisector((p) => p.date).center;
      svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'transparent')
        .on('pointermove', (ev) => { const p = data[bis(data, x.invert(d3.pointer(ev)[0]))]; dot.attr('cx', x(p.date)).attr('cy', y(p.v)).attr('opacity', 1); showTip(ev, fmtD(p.date), [[ind.name, fmtV(ind, p.v)]]); })
        .on('pointerleave', () => { dot.attr('opacity', 0); hideTip(); });
    }
  }

  /* ---------------- indicator card ---------------- */
  function icard(id, opts = {}) {
    const ind = I()[id]; if (!ind) return null;
    const c = el('div', 'icard');
    const head = el('div', 'ih'); const nm = el('span', 'iname', opts.name || ind.name); head.append(nm);
    if (stale(ind)) head.append(el('span', 'badge warn', 'as of ' + fmtD(parseD(ind.asOf))));
    const val = el('div', 'ival', fmtV(ind));
    const chips = el('div', 'ichips');
    for (const [k, lab] of (ind.freq === 'monthly' ? [['m', '1M'], ['q', '3M'], ['y', '1Y']] : [['w', '1W'], ['m', '1M'], ['y', '1Y']])) {
      const v = ind.chg[k]; const ch = el('span', 'ichip'); ch.append(el('i', null, lab), el('b', null, fmtChg(ind, v))); chips.append(ch);
    }
    const sp = el('div', 'ispark');
    const pr = el('div', 'iprow'); const bar = el('div', 'pct mini'); const dot = el('span'); dot.style.left = ((ind.pct10 ?? 0.5) * 100).toFixed(1) + '%'; bar.append(dot);
    pr.append(el('span', 'muted', '10y range'), bar, el('b', null, ind.pct10 == null ? '—' : ord(Math.round(ind.pct10 * 100)) + ' pctl'));
    const foot = el('div', 'ifoot muted', `${ind.src} · ${fmtD(parseD(ind.asOf))}`);
    c.append(head, val, chips, sp, pr);
    if (ind.note || opts.note) c.append(el('div', 'inote', opts.note || ind.note));
    c.append(foot);
    c.title = `10-year range ${fmtV(ind, ind.min10)} – ${fmtV(ind, ind.max10)}, average ${fmtV(ind, ind.mean10)}`;
    requestAnimationFrame(() => spark(sp, ind.spark, { ind, color: opts.color || 'var(--c-n500)' }));
    return c;
  }
  function fillCards(sel, ids) { const box = document.querySelector(sel); if (!box) return; box.replaceChildren(...ids.map((x) => (typeof x === 'string' ? icard(x) : x)).filter(Boolean)); }
  function staticCard(name, value, sub, note) {
    const c = el('div', 'icard'); const h = el('div', 'ih'); h.append(el('span', 'iname', name)); c.append(h, el('div', 'ival', value));
    if (sub) c.append(el('div', 'ichips muted small', sub)); if (note) c.append(el('div', 'inote', note)); return c;
  }

  /* ---------------- overview ---------------- */
  function renderRegime() {
    const box = document.getElementById('regime'); if (!state.macro) return;
    box.replaceChildren(...PILLARS.map((P) => {
      const p = pillar(P.k);
      const d = el('div', 'pillar ' + p.cls);
      const top = el('div', 'ptop'); top.append(el('span', 'pname', P.name), el('span', 'light ' + p.cls));
      const lab = el('div', 'plabel', p.score == null ? 'No data' : P.labels[p.score > 0.33 ? 2 : p.score < -0.33 ? 0 : 1]);
      const meter = el('div', 'meter'); const m = el('span'); m.style.left = (((p.score ?? 0) + 1) / 2 * 100).toFixed(0) + '%'; meter.append(m);
      const ul = el('ul', 'pwhy');
      for (const r of p.rows) { const li = el('li', r.s > 0 ? 'up' : r.s < 0 ? 'down' : ''); li.append(el('i', null, r.s > 0 ? '▲' : r.s < 0 ? '▼' : '●'), r.why); ul.append(li); }
      d.append(top, lab, meter, ul);
      return d;
    }));
    document.getElementById('regime-asof').textContent = state.macro.stale ? `Showing saved data from ${new Date(state.macro.savedAt).toLocaleString()}` : `Macro data as of ${new Date(state.macro.fetchedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
  }
  const TILES = ['spx', 'stoxx', 'nikkei', 'nifty', 'csi300', 'us10y', 'dxy', 'usdinr', 'brent', 'gold', 'vix', 'btc'];
  function renderTiles() {
    const box = document.getElementById('tiles');
    box.replaceChildren(...TILES.filter(has).map((id) => {
      const ind = I()[id], t = el('div', 'tile');
      const short = { spx: 'S&P 500', stoxx: 'Euro Stoxx 50', nikkei: 'Nikkei 225', nifty: 'Nifty 50', csi300: 'China A (CSI 300)', us10y: 'US 10Y', dxy: 'Dollar (DXY)', usdinr: 'USD/INR', brent: 'Brent', gold: 'Gold', vix: 'VIX', btc: 'Bitcoin' }[id];
      const c = ind.chg.w; const good = ['vix', 'us10y', 'dxy', 'usdinr', 'brent'].includes(id) ? c < 0 : c > 0;
      t.append(el('span', 'tname', short), el('span', 'tval', fmtV(ind)), el('span', 'tchg ' + (c == null ? '' : good ? 'up' : 'down'), fmtChg(ind, c)));
      const sp = el('div', 'tspark'); t.append(sp); requestAnimationFrame(() => spark(sp, ind.spark, { h: 28, ind, color: good ? 'var(--cheap)' : 'var(--rich)' }));
      return t;
    }));
  }
  function renderChanged() {
    const box = document.getElementById('changed');
    const list = Object.entries(I()).filter(([, v]) => v.zw != null && isFinite(v.zw) && !v.name.startsWith('Policy rate')).sort((a, b) => Math.abs(b[1].zw) - Math.abs(a[1].zw)).slice(0, 8);
    box.replaceChildren(...list.map(([id, ind]) => {
      const r = el('div', 'crow');
      const z = Math.abs(ind.zw); const b = el('span', 'zb ' + (z >= 2 ? 'hi' : z >= 1 ? 'mid' : ''), z.toFixed(1) + 'σ');
      const nm = el('div', 'cname'); nm.append(el('b', null, ind.name), el('span', 'muted small', fmtV(ind)));
      const sp = el('div', 'cspark');
      r.append(nm, el('span', 'cchg ' + (ind.chg.w >= 0 ? 'pos' : 'neg'), fmtChg(ind, ind.chg.w)), b, sp);
      r.title = `A ${z.toFixed(1)}× normal weekly move`;
      requestAnimationFrame(() => spark(sp, ind.spark.slice(-26), { h: 26, ind }));
      return r;
    }));
  }

  /* ---------------- alerts ---------------- */
  const alerts = () => R().alerts();
  function renderAlerts() {
    const A = alerts().sort((a, b) => b.on - a.on), box = document.getElementById('alerts');
    document.getElementById('alert-count').textContent = `${A.filter((a) => a.on).length} triggered of ${A.length}`;
    box.replaceChildren(...A.map((a) => { const r = el('div', 'arow' + (a.on ? ' on' : '')); const t = el('div'); t.append(el('b', null, a.name), el('span', 'muted small', a.rule)); r.append(el('span', 'adot'), t, el('span', 'anow', a.now)); return r; }));
  }

  /* ---------------- pre-trade checklist ---------------- */
  const MARKETS = {
    US: { eq: 'spx', fx: null, cpi: 'cpi_US', cb: 'US', siblis: 'United States' },
    Europe: { eq: 'stoxx', fx: ['eurusd', 1], cpi: 'cpi_XM', cb: 'XM', siblis: 'Germany' },
    Japan: { eq: 'nikkei', fx: ['usdjpy', -1], cpi: 'cpi_JP', cb: 'JP', siblis: 'Japan' },
    China: { eq: 'csi300', fx: ['usdcny', -1], cpi: 'cpi_CN', cb: 'CN', siblis: 'China' },
    India: { eq: 'nifty', fx: ['usdinr', -1], cpi: 'cpi_IN', cb: 'IN', siblis: 'India' },
    EM: { eq: 'eem', fx: ['dxy', -1], cpi: null, cb: null, siblis: 'Emerging markets' },
  };
  function checklist(mk) {
    const M = MARKETS[mk], i = I(), rows = [];
    const row = (k, s, text) => rows.push({ k, s, text });
    // 1 valuation
    if (mk === 'India' && longPct('n500') != null) { const p = longPct('n500'); row('Valuation', p < 0.4 ? 1 : p > 0.75 ? -1 : 0, `Nifty 500 PE at the ${ord(Math.round(p * 100))} percentile of 10 years`); }
    else { const g = state.global?.markets?.find((m) => m.market === M.siblis); if (g?.vsAvg5 != null) row('Valuation', g.vsAvg5 < -0.05 ? 1 : g.vsAvg5 > 0.1 ? -1 : 0, `${M.siblis} PE ${pctS(g.vsAvg5)} vs its 5-year average${g.livePE ? `; live ETF PE ${f1(g.livePE)}x` : ''}`); }
    // 2 trend
    const eq = i[M.eq]; if (eq) { const m = ma40(eq); if (m) row('Price trend', eq.last > m ? 1 : -1, `${eq.name} ${pctS(eq.last / m - 1, 1)} vs its 40-week average`); }
    // 3 currency
    if (M.fx && i[M.fx[0]]) { const f = i[M.fx[0]], c = f.chg.q * M.fx[1]; row('Currency (for a USD investor)', c > 0.01 ? 1 : c < -0.02 ? -1 : 0, `${f.name} ${pp(f.chg.q)} over 3 months — local currency ${c > 0 ? 'strengthening' : 'weakening'}`); }
    else if (mk === 'US' && i.dxy) row('Currency (for a USD investor)', 0, `Home currency. Dollar ${pp(i.dxy.chg.q)} over 3 months`);
    // 4 inflation & policy
    if (M.cpi && i[M.cpi]) { const c = i[M.cpi], ctry = state.macro.countries.find((x) => x.code === M.cb); const real = ctry?.real; row('Inflation & policy', c.chg.q < -0.2 ? 1 : c.chg.q > 0.3 ? -1 : 0, `CPI ${f1(c.last)}% (${fmtChg(c, c.chg.q)} in 3m)${real != null ? `; real policy rate ${f2(real)}%` : ''}`); }
    // 5 global liquidity, 6 risk
    const L = pillar('liquidity'), R = pillar('risk');
    if (L.score != null) row('Global liquidity', L.score > 0.33 ? 1 : L.score < -0.33 ? -1 : 0, PILLARS[2].labels[L.score > 0.33 ? 2 : L.score < -0.33 ? 0 : 1] + ` (score ${L.score >= 0 ? '+' : ''}${L.score.toFixed(2)})`);
    if (R.score != null) row('Risk appetite', R.score > 0.33 ? 1 : R.score < -0.33 ? -1 : 0, PILLARS[3].labels[R.score > 0.33 ? 2 : R.score < -0.33 ? 0 : 1] + (i.vix ? `; VIX ${f1(i.vix.last)}` : ''));
    // 7 event risk
    const next = upcoming().filter((e) => e.imp >= 3 && (e.country === M.cb || e.country === 'US' || (mk === 'EM' && e.country === 'CN')))[0];
    if (next) { const d = daysTo(next.date); row('Event risk', d <= 7 ? -1 : d <= 21 ? 0 : 1, `${next.title} ${d <= 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`} (${fmtD(parseD(next.date))})`); }
    return rows;
  }
  function renderChecklist() {
    const mk = state.market || 'US', rows = checklist(mk), box = document.getElementById('checklist');
    const g = rows.filter((r) => r.s > 0).length, b = rows.filter((r) => r.s < 0).length;
    const verdict = g >= Math.ceil(rows.length * 0.6) && b <= 1 ? ['good', 'Supportive — conditions favour adding exposure'] : b >= Math.ceil(rows.length * 0.45) ? ['bad', 'Unfavourable — wait or reduce size'] : ['neutral', 'Mixed — proceed selectively, size down'];
    const head = el('div', 'cl-head ' + verdict[0]); head.append(el('span', 'light ' + verdict[0]), el('b', null, verdict[1]), el('span', 'muted small', `${g} supportive · ${rows.length - g - b} neutral · ${b} against`));
    const list = el('div', 'cl-list');
    for (const r of rows) { const d = el('div', 'cl-row'); d.append(el('span', 'light sm ' + (r.s > 0 ? 'good' : r.s < 0 ? 'bad' : 'neutral')), el('b', null, r.k), el('span', null, r.text)); list.append(d); }
    box.replaceChildren(head, list, el('p', 'muted small', 'A starting point for judgement, not a signal. Based on the rules shown on this page.'));
  }
  const daysTo = (d) => Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')) / 864e5);
  const upcoming = () => (state.macro?.calendar || []).filter((e) => daysTo(e.date) >= 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.imp - a.imp));
  const FLAG = { IN: 'India', US: 'US', XM: 'Euro area', GB: 'UK', JP: 'Japan', CN: 'China', GL: 'Global' };
  const CAT = { cb: 'Central banks', data: 'Economic data', markets: 'Markets & flows', fiscal: 'Fiscal & policy', earnings: 'Earnings', holiday: 'Holidays' };
  const when = (e) => { const d = daysTo(e.date); return d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d}d`; };
  function nowReading(e) {
    const ind = e.ind && I()[e.ind]; if (!ind) return null;
    const lbl = ind.name.startsWith('Policy rate') ? 'Rate now' : ind.name.startsWith('CPI') ? 'Latest ' + ind.name.replace('CPI inflation — ', '').replace('United States', 'US') + ' CPI' : ind.name + ' now';
    return `${lbl} ${fmtV(ind)}${ind.freq === 'monthly' ? ` (${d3.utcFormat('%b')(parseD(ind.asOf))})` : ''}`;
  }
  function renderCalendar() {
    const box = document.getElementById('calendar');
    const cal = upcoming().filter((e) => e.cat === 'cb' && e.imp >= 2).slice(0, 6);
    box.replaceChildren(...cal.map((e) => {
      const c = state.macro.countries.find((x) => x.code === e.country);
      const r = el('div', 'evrow'); const w = el('div', 'evdate'); w.append(el('b', null, d3.utcFormat('%d %b')(parseD(e.date))), el('span', 'muted small', when(e)));
      const what = el('div'); what.append(el('b', null, e.title), el('span', 'muted small', [e.time, c?.policy ? `Current ${f2(c.policy.last)}%${c.policy.lastChange ? `, last move ${(c.policy.lastChange.date ? fmtD(parseD(c.policy.lastChange.date)) : `after ${fmtD(parseD(c.policy.lastChange.after))}`)} (${c.policy.lastChange.to > c.policy.lastChange.from ? '+' : '−'}${Math.abs((c.policy.lastChange.to - c.policy.lastChange.from) * 100).toFixed(0)}bp)` : ''}` : ''].filter(Boolean).join(' · ')));
      r.append(w, what); return r;
    }));
  }

  /* ---------------- calendar tab ---------------- */
  state.cal ||= { region: 'all', cats: new Set(Object.keys(CAT)), high: false, months: 3 };
  function calFiltered() {
    const C = state.cal;
    const until = new Date(Date.now() + (C.months || 3) * 30.5 * 864e5).toISOString().slice(0, 10);
    return upcoming().filter((e) => e.date <= until && (C.region === 'all' || (C.region === 'GL' ? !['IN', 'US'].includes(e.country) : e.country === C.region)) && C.cats.has(e.cat) && (!C.high || e.imp >= 3));
  }
  function evRow(e) {
    const r = el('div', 'cal-row imp' + e.imp);
    const d = el('div', 'cal-date'); d.append(el('b', null, d3.utcFormat('%d')(parseD(e.date))), el('span', 'cal-mon', d3.utcFormat('%b')(parseD(e.date))), el('span', null, d3.utcFormat('%a')(parseD(e.date))), el('span', 'muted', when(e)));
    const body = el('div', 'cal-body');
    const top = el('div', 'cal-top'); top.append(el('span', 'ctry c-' + e.country, FLAG[e.country] || e.country), el('b', null, e.title));
    const imp = el('span', 'imp', '●'.repeat(e.imp) + '○'.repeat(3 - e.imp)); imp.title = ['Background', 'Important', 'Market-moving'][e.imp - 1]; top.append(imp);
    body.append(top);
    const meta = el('div', 'cal-meta');
    if (e.time) meta.append(el('span', null, e.time));
    meta.append(el('span', 'st ' + e.status, e.status[0].toUpperCase() + e.status.slice(1)), el('span', 'muted', CAT[e.cat]));
    const nr = nowReading(e); if (nr) meta.append(el('span', 'nowr', nr));
    body.append(meta);
    if (e.detail) body.append(el('p', 'cal-detail', e.detail));
    const tail = el('div', 'cal-tail');
    if (e.url) { const a = el('a', null, 'Source'); a.href = e.url; a.target = '_blank'; a.rel = 'noopener'; a.title = e.src; tail.append(a); }
    if (!window.PE_PREVIEW) { const b = el('button', 'btn ghost small', '+ Calendar'); b.type = 'button'; b.onclick = () => ics([e], `${e.date}-${e.title.slice(0, 30).replace(/[^a-z0-9]+/gi, '-')}.ics`); tail.append(b); }
    r.append(d, body, tail);
    return r;
  }
  function renderCalendarTab() {
    const list = calFiltered();
    const next = document.getElementById('cal-next');
    const wk = list.filter((e) => daysTo(e.date) <= 7 && e.imp >= 2);
    next.replaceChildren(...(wk.length ? wk.slice(0, 8).map((e) => {
      const c = el('div', 'nextcard imp' + e.imp);
      c.append(el('span', 'muted small', `${d3.utcFormat('%a %d %b')(parseD(e.date))} · ${when(e)}`), el('b', null, e.title), el('span', 'small', [FLAG[e.country], e.time].filter(Boolean).join(' · ')));
      const nr = nowReading(e); if (nr) c.append(el('span', 'nowr small', nr));
      return c;
    }) : [el('p', 'muted small', 'No important events in the next 7 days for this filter.')]));
    // timeline grouped by week (weeks start Monday)
    const box = document.getElementById('cal-list'); box.replaceChildren();
    let wkKey = null;
    for (const e of list) {
      const dt = parseD(e.date), mon = d3.utcMonday.floor(dt), k = mon.toISOString();
      if (k !== wkKey) { wkKey = k; const h = el('div', 'cal-week', 'Week of ' + d3.utcFormat('%d %b %Y')(mon)); box.append(h); }
      box.append(evRow(e));
    }
    if (!list.length) box.append(el('div', 'empty', 'No events match these filters.'));
    renderRefSources();
    const hz = document.getElementById('cal-horizon');
    const H = (state.macro.horizon || []).filter((x) => state.cal.region === 'all' || (state.cal.region === 'GL' ? !['IN', 'US'].includes(x.country) : x.country === state.cal.region));
    hz.replaceChildren(...H.map((x) => { const r = el('div', 'cal-row'); const d = el('div', 'cal-date'); d.append(el('span', 'muted', 'TBC')); const b = el('div', 'cal-body'); const t = el('div', 'cal-top'); t.append(el('span', 'ctry c-' + x.country, FLAG[x.country]), el('b', null, x.title)); b.append(t, el('div', 'cal-meta', x.when), el('p', 'cal-detail', x.detail)); r.append(d, b); return r; }));
  }
  // Where the calendar comes from: one row per source, with how it is read, when it was last confirmed and its state.
  function renderRefSources() {
    const t = document.getElementById('tbl-refsrc'); if (!t) return;
    const R = state.macro?.refdata, rows = R?.rows || [];
    const LBL = { live: ['Live', 'up'], 'last-good': ['Last good copy', 'warn'], 'needs-key': ['Needs key', 'warn'], failed: ['Not reachable', 'down'], pending: ['Not yet checked', 'warn'], rule: ['Issuer rule', ''], static: ['Official list', ''], manual: ['Checked by hand', 'warn'] };
    const ago = (s) => { if (!s) return '—'; const m = Math.round((Date.now() - Date.parse(s)) / 60e3); return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
    t.replaceChildren();
    const hr = el('tr'); ['Source', 'How it is read', 'State', 'Last confirmed', 'Coverage / note'].forEach((h, i) => hr.append(el('th', i === 0 || i === 1 || i === 4 ? 'left' : null, h)));
    const thead = el('thead'); thead.append(hr); t.append(thead);
    const tb = el('tbody');
    for (const r of rows) {
      const tr = el('tr'), [lab, cls] = LBL[r.state] || [r.state, ''];
      const st = el('td'); st.append(el('span', 'pill-s ' + cls, lab));
      const note = r.state === 'needs-key' ? `Add ${r.key} in Netlify → Environment variables` : r.error && r.state !== 'live' ? `${r.note ? r.note + '. ' : ''}Last check failed: ${r.error}` : r.note || '';
      tr.append(el('td', 'left strong', r.name), el('td', 'left', r.how || ''), st, el('td', null, ago(r.checked)), el('td', 'left why', note));
      tb.append(tr);
    }
    if (!rows.length) { const tr = el('tr'); tr.append(el('td', 'left muted', 'Reference data not built yet; showing the verified calendar.')); tb.append(tr); }
    t.append(tb);
    const n = document.getElementById('cal-src-note');
    if (n) n.textContent = `Each source is re-checked automatically (calendars every 6 hours, IMF weekly); Refresh re-checks anything older than an hour.${R?.builtAt ? ` Last check ${ago(R.builtAt)}.` : ''} Every event shows whether it is official, scheduled by the issuer’s rule, or estimated.`;
  }
  function ics(events, name) {
    const esc = (t) => String(t || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Global Markets Monitor//EN', 'CALSCALE:GREGORIAN'];
    for (const e of events) {
      const d = e.date.replace(/-/g, ''), d2 = new Date(Date.parse(e.date) + 864e5).toISOString().slice(0, 10).replace(/-/g, '');
      lines.push('BEGIN:VEVENT', `UID:${d}-${e.title.replace(/[^a-z0-9]/gi, '').slice(0, 40)}@gmm`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d2}`, `SUMMARY:${esc(`[${FLAG[e.country]}] ${e.title}`)}`, `DESCRIPTION:${esc([e.time, e.detail, `Status: ${e.status}`, e.url].filter(Boolean).join(' — '))}`, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' })); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  // World markets controls
  (() => {
    const sg = document.getElementById('seg-heat');
    if (sg) sg.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b) return; sg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); state.heatPer = b.dataset.v; renderWorld(); });
    const so = document.getElementById('heat-sort'); if (so) so.onchange = renderWorld;
  })();
  // Calendar controls
  (() => {
    const cats = document.getElementById('cal-cats');
    if (cats) cats.replaceChildren(...Object.entries(CAT).map(([k, v]) => { const b = el('button', 'chipbtn on', v); b.type = 'button'; b.setAttribute('aria-pressed', 'true'); b.onclick = () => { const C = state.cal.cats; C.has(k) ? C.delete(k) : C.add(k); b.classList.toggle('on', C.has(k)); b.setAttribute('aria-pressed', String(C.has(k))); renderCalendarTab(); }; return b; }));
    const seg = document.getElementById('seg-cal-region');
    if (seg) seg.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b) return; seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); state.cal.region = b.dataset.v; renderCalendarTab(); });
    const hi = document.getElementById('cal-high'); if (hi) hi.onchange = () => { state.cal.high = hi.checked; renderCalendarTab(); };
    const rg = document.getElementById('seg-cal-range');
    if (rg) rg.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b) return; rg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); state.cal.months = +b.dataset.v; renderCalendarTab(); });
    const all = document.getElementById('ics-all');
    if (all) { if (window.PE_PREVIEW) all.hidden = true; else all.onclick = () => ics(calFiltered(), 'market-events.ics'); }
  })();

  /* ---------------- growth & inflation tab ---------------- */
  function renderMacroTab() {
    fillCards('#cards-growth', ['cugold', 'copper', 'gdpnow', 'cli_g20', 'cli_us', 'cli_cn', 'cli_in']);
    fillCards('#cards-inflation', ['be10', 'be5y5y', 'brent']);
    const C = state.macro.countries;
    const t = document.getElementById('tbl-countries');
    const thead = el('thead'), hr = el('tr'); ['Economy', 'CPI', '3M change', '1Y change', 'Policy rate', 'Real rate', 'Last move', 'CPI as of'].forEach((h) => hr.append(el('th', null, h))); thead.append(hr);
    const tb = el('tbody');
    for (const c of C) {
      const r = el('tr');
      const cells = [c.name, c.cpi ? f1(c.cpi.last) + '%' : '—', c.cpi ? (c.cpi.chg3m >= 0 ? '+' : '−') + Math.abs(c.cpi.chg3m).toFixed(1) + 'pp' : '—', c.cpi ? (c.cpi.chg1y >= 0 ? '+' : '−') + Math.abs(c.cpi.chg1y).toFixed(1) + 'pp' : '—',
        c.policy ? f2(c.policy.last) + '%' : '—', c.real != null ? (c.real >= 0 ? '+' : '−') + Math.abs(c.real).toFixed(2) + '%' : '—',
        c.policy?.lastChange ? `${c.policy.lastChange.to > c.policy.lastChange.from ? 'Hike' : 'Cut'} ${Math.abs((c.policy.lastChange.to - c.policy.lastChange.from) * 100).toFixed(0)}bp · ${(c.policy.lastChange.date ? fmtD(parseD(c.policy.lastChange.date)) : `after ${fmtD(parseD(c.policy.lastChange.after))}`)}` : '—', c.cpi ? d3.utcFormat('%b %Y')(parseD(c.cpi.asOf)) : '—'];
      cells.forEach((v, k) => { const td = el('td', k === 2 && c.cpi ? (c.cpi.chg3m > 0.2 ? 'down' : c.cpi.chg3m < -0.2 ? 'up' : '') : k === 5 && c.real != null ? (c.real > 0 ? 'strong' : '') : '', v); r.append(td); });
      tb.append(r);
    }
    t.replaceChildren(thead, tb);
    renderCpiChart();
  }
  const CPI_COLORS = { US: 'var(--c-n500)', XM: 'var(--c-mid)', GB: 'var(--c-agg)', JP: 'var(--c-small)', CN: 'var(--c-em)', IN: 'var(--c-micro)', BR: 'var(--muted)' };
  state.cpiHidden ||= new Set(['BR']);
  function renderCpiChart() {
    const node = document.getElementById('cpi-chart'); if (!node || !node.clientWidth) return;
    const C = state.macro.countries.filter((c) => c.cpi?.spark?.length);
    const leg = document.getElementById('cpi-legend');
    leg.replaceChildren(...C.map((c) => { const b = el('button', 'li' + (state.cpiHidden.has(c.code) ? ' off' : '')); const i = el('i'); i.style.background = CPI_COLORS[c.code]; b.append(i, `${c.name} ${f1(c.cpi.last)}%`); b.onclick = () => { state.cpiHidden.has(c.code) ? state.cpiHidden.delete(c.code) : state.cpiHidden.add(c.code); renderCpiChart(); }; return b; }));
    const vis = C.filter((c) => !state.cpiHidden.has(c.code)).map((c) => ({ c, pts: c.cpi.spark.map(([d, v]) => ({ date: parseD(d), v })) }));
    const { svg, M, iw, ih } = frame(node, 280, { t: 10, r: 52, b: 26, l: 40 });
    if (!vis.length) return;
    const all = vis.flatMap((d) => d.pts);
    const x = d3.scaleUtc().domain(d3.extent(all, (p) => p.date)).range([0, iw]);
    const y = d3.scaleLinear().domain(d3.extent([0, ...all.map((p) => p.v)])).range([ih, 0]).nice();
    const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
    g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat('')).call((s) => s.select('.domain').remove());
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(iw / 100))).tickSizeOuter(0));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat((v) => v + '%'));
    g.append('line').attr('x1', 0).attr('x2', iw).attr('y1', y(2)).attr('y2', y(2)).attr('stroke', 'var(--ref)').attr('stroke-dasharray', '4 4');
    g.append('text').attr('x', 4).attr('y', y(2) - 4).attr('font-size', 10.5).attr('fill', 'var(--muted)').text('2% target');
    for (const d of vis) g.append('path').datum(d.pts).attr('fill', 'none').attr('stroke', CPI_COLORS[d.c.code]).attr('stroke-width', 1.8).attr('d', d3.line().x((p) => x(p.date)).y((p) => y(p.v)));
    const labs = vis.map((d) => ({ code: d.c.code, v: d.pts.at(-1).v, y: y(d.pts.at(-1).v) })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < 13) labs[k].y = labs[k - 1].y + 13;
    for (const l of labs) g.append('text').attr('x', iw + 6).attr('y', l.y).attr('dy', '0.35em').attr('font-size', 11).attr('font-weight', 600).attr('fill', CPI_COLORS[l.code]).text(f1(l.v) + '%');
    const bis = d3.bisector((p) => p.date).center, cross = g.append('line').attr('y1', 0).attr('y2', ih).attr('stroke', 'var(--muted)').attr('opacity', 0);
    g.append('rect').attr('width', iw).attr('height', ih).attr('fill', 'transparent')
      .on('pointermove', (ev) => { const dt = x.invert(d3.pointer(ev)[0]); cross.attr('x1', x(dt)).attr('x2', x(dt)).attr('opacity', 0.5); showTip(ev, d3.utcFormat('%b %Y')(dt), vis.map((d) => [d.c.name, f1(d.pts[bis(d.pts, dt)].v) + '%', cssVar(CPI_COLORS[d.c.code])])); })
      .on('pointerleave', () => { cross.attr('opacity', 0); hideTip(); });
    svg.attr('role', 'img').attr('aria-label', 'CPI inflation by economy over two years');
  }

  /* ---------------- liquidity & risk tab ---------------- */
  function renderLiquidityTab() {
    fillCards('#cards-liquidity', ['pol_US', 'us2y', 'us10y', 'us10r', 'c2s10s', 'c3m10y', 'dxy', 'fedassets', 'hyoas', 'igoas', 'nfci', 'hygief']);
    fillCards('#cards-risk', ['vix', 'move', 'gold', 'btc', 'emdm', 'usdjpy', 'eurusd', 'usdcny']);
    fillCards('#cards-equities', ['spx', 'acwi', 'stoxx', 'nikkei', 'csi300', 'nifty', 'eem']);
    document.getElementById('fred-note').textContent = state.macro.fredEnabled ? 'Credit spreads and financial conditions from FRED.' : 'Credit spreads (ICE BofA), the Chicago Fed financial conditions index and GDPNow switch on when a free FRED API key is added to the site (see README). Until then, credit appetite uses the HYG/IEF ratio.';
    renderCurve();
  }
  function renderCurve() {
    const node = document.getElementById('curve-chart'), cv = state.macro.curve; if (!node || !cv || !node.clientWidth) return;
    const sets = [{ k: 'now', name: `Today (${fmtD(parseD(cv.asOf))})`, pts: cv.now, color: 'var(--c-n500)', w: 2.4 }, cv.monthAgo && { k: 'm', name: `1 month ago`, pts: cv.monthAgo.pts, color: 'var(--c-mid)', w: 1.5, dash: '5 4' }, cv.yearAgo && { k: 'y', name: `1 year ago`, pts: cv.yearAgo.pts, color: 'var(--c-agg)', w: 1.5, dash: '2 3' }].filter(Boolean);
    document.getElementById('curve-legend').replaceChildren(...sets.map((s) => { const sp = el('span', 'li'); const i = el('i'); i.style.background = s.color; sp.append(i, s.name); return sp; }));
    const tenors = cv.now.map(([t]) => t);
    const { svg, M, iw, ih } = frame(node, 260, { t: 14, r: 20, b: 28, l: 44 });
    const x = d3.scalePoint().domain(tenors).range([0, iw]).padding(0.3);
    const vals = sets.flatMap((s) => s.pts.map((p) => p[1]));
    const y = d3.scaleLinear().domain(d3.extent(vals)).range([ih, 0]).nice();
    const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
    g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat('')).call((s) => s.select('.domain').remove());
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).tickFormat((t) => t));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat((v) => v.toFixed(1) + '%'));
    for (const s of [...sets].reverse()) {
      const pts = s.pts.filter(([t]) => tenors.includes(t));
      g.append('path').datum(pts).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', s.w).attr('stroke-dasharray', s.dash || null).attr('d', d3.line().x((p) => x(p[0])).y((p) => y(p[1])));
      if (s.k === 'now') g.selectAll('circle.n').data(pts).join('circle').attr('cx', (p) => x(p[0])).attr('cy', (p) => y(p[1])).attr('r', 3).attr('fill', s.color);
    }
    g.selectAll('rect.h').data(tenors).join('rect').attr('x', (t) => x(t) - x.step() / 2).attr('width', x.step()).attr('height', ih).attr('fill', 'transparent')
      .on('pointermove', (ev, t) => showTip(ev, t.replace('M', '-month').replace('Y', '-year'), sets.map((s) => [s.name, f2(s.pts.find((p) => p[0] === t)?.[1]) + '%', cssVar(s.color)])))
      .on('pointerleave', hideTip);
    svg.attr('role', 'img').attr('aria-label', 'US Treasury yield curve today, one month ago and one year ago');
  }

  /* ---------------- India tab ---------------- */
  function renderIndiaTab() {
    const i = I(), m = state.macro.manual?.india10y, cpi = i.cpi_IN, ctry = state.macro.countries.find((c) => c.code === 'IN');
    const extra = [];
    if (m) extra.push(staticCard('India 10-year G-sec yield', f2(m.value) + '%', `${m.auto ? 'Live (CNBC quote feed)' : 'Entered by hand'} · as of ${fmtD(parseD(m.asOf))}${m.stale ? ' · stale' : ''}`, m.auto ? 'Updated daily. Falls back to the last live value, then the hand-entered one in lib/macro-config.mjs.' : 'The daily feed is unavailable; showing the hand-entered value from lib/macro-config.mjs.'));
    if (m && cpi) extra.push(staticCard('Real 10-year yield (India)', f2(m.value - cpi.last) + '%', `10y ${f2(m.value)}% − CPI ${f1(cpi.last)}%`, 'Compare with the US TIPS yield to judge relative bond value.'));
    if (m && i.us10y) extra.push(staticCard('India – US 10-year spread', f2(m.value - i.us10y.last) + ' pp', `US 10y ${f2(i.us10y.last)}%`, 'The carry foreign bond investors earn for rupee risk. Below 2pp historically means thin compensation.'));
    if (ctry?.real != null) extra.push(staticCard('RBI real policy rate', (ctry.real >= 0 ? '+' : '−') + Math.abs(ctry.real).toFixed(2) + '%', `Repo ${f2(ctry.policy.last)}% − CPI ${f1(cpi.last)}%`, ctry.real < 0 ? 'Negative: policy is still accommodative relative to inflation.' : 'Positive: policy is restrictive.'));
    fillCards('#cards-india', ['nifty', 'usdinr', 'indiavix', 'pol_IN', 'cpi_IN', ...extra, 'brent', 'cli_in']);
    renderFlows(); renderEps();
  }
  function renderFlows() {
    const box = document.getElementById('flows'), fl = Object.entries(state.macro.flows || {}).sort();
    if (!fl.length) { box.replaceChildren(el('div', 'empty', 'Flow data unavailable right now')); return; }
    const [d, v] = fl.at(-1);
    const tiles = el('div', 'flowtiles');
    for (const [k, lab] of [['fii', 'FII / FPI'], ['dii', 'DII']]) { const t = el('div', 'flowt'); t.append(el('span', 'muted small', lab + ' net, ' + fmtD(parseD(d))), el('b', v[k] >= 0 ? 'up' : 'down', (v[k] >= 0 ? '+' : '−') + '₹' + d3.format(',.0f')(Math.abs(v[k])) + ' cr')); tiles.append(t); }
    box.replaceChildren(tiles);
    if (fl.length >= 3) {
      const node = el('div', 'chart'); node.style.height = '180px'; box.append(node);
      requestAnimationFrame(() => {
        const { svg, M, iw, ih } = frame(node, 180, { t: 8, r: 8, b: 22, l: 52 });
        const data = fl.slice(-60).map(([dd, x]) => ({ d: dd, fii: x.fii, dii: x.dii }));
        const x0 = d3.scaleBand().domain(data.map((p) => p.d)).range([0, iw]).padding(0.2);
        const ext = d3.max(data, (p) => Math.max(Math.abs(p.fii), Math.abs(p.dii)));
        const y = d3.scaleLinear().domain([-ext, ext]).range([ih, 0]).nice();
        const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
        g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(4).tickFormat((v) => d3.format(',.0f')(v)));
        g.append('line').attr('x1', 0).attr('x2', iw).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--ref)');
        const bw = x0.bandwidth() / 2;
        for (const [k, col, off] of [['fii', 'var(--c-n500)', 0], ['dii', 'var(--c-em)', bw]]) g.selectAll('rect.' + k).data(data).join('rect').attr('x', (p) => x0(p.d) + off).attr('width', bw).attr('y', (p) => y(Math.max(0, p[k]))).attr('height', (p) => Math.abs(y(p[k]) - y(0))).attr('fill', col);
        g.selectAll('rect.h').data(data).join('rect').attr('x', (p) => x0(p.d)).attr('width', x0.step()).attr('height', ih).attr('fill', 'transparent').on('pointermove', (ev, p) => showTip(ev, fmtD(parseD(p.d)), [['FII', d3.format('+,.0f')(p.fii) + ' cr', cssVar('var(--c-n500)')], ['DII', d3.format('+,.0f')(p.dii) + ' cr', cssVar('var(--c-em)')]])).on('pointerleave', hideTip);
      });
    } else box.append(el('p', 'muted small', `${fl.length} day${fl.length > 1 ? 's' : ''} recorded so far. A daily chart appears from the third trading day after launch.`));
  }
  function renderEps() {
    const t = document.getElementById('tbl-eps'); if (!state.hist) return;
    const thead = el('thead'), hr = el('tr'); ['Index', 'Trailing EPS', '3M change', '1Y growth', '3Y CAGR'].forEach((h) => hr.append(el('th', null, h))); thead.append(hr);
    const tb = el('tbody');
    for (const id of IDS) {
      const s = state.hist.series[id]; if (!s?.eps) continue;
      const pts = s.d.map((d, k) => [d, s.eps[k]]).filter(([, v]) => v != null); if (!pts.length) continue;
      const last = pts.at(-1), at = (days) => { const cut = new Date(Date.parse(last[0]) - days * 864e5).toISOString().slice(0, 10); let v = null; for (const [d, x] of pts) if (d <= cut) v = x; return v; };
      const q = at(91), y = at(365), y3 = at(1095);
      const g1 = y ? last[1] / y - 1 : null, g3 = y3 ? Math.pow(last[1] / y3, 1 / 3) - 1 : null, gq = q ? last[1] / q - 1 : null;
      const r = el('tr');
      [[s.name], [d3.format(',.1f')(last[1])], [pctS(gq, 1), gq > 0 ? 'up' : 'down'], [pctS(g1, 1), g1 > 0.1 ? 'up' : g1 < 0 ? 'down' : ''], [pctS(g3, 1), g3 > 0.1 ? 'up' : g3 < 0 ? 'down' : '']].forEach(([v, c]) => r.append(el('td', c || '', v)));
      tb.append(r);
    }
    t.replaceChildren(thead, tb);
  }

  /* ---------------- valuations tab additions ---------------- */
  function renderLongTable() {
    const t = document.getElementById('tbl-long'); if (!t || !state.hist) return;
    const W = ['1y', '3y', '5y', '7y', '10y', '15y', 'max'];
    const thead = el('thead'), hr = el('tr'); hr.append(el('th', null, 'Index')); W.forEach((w) => hr.append(el('th', null, w === 'max' ? 'Full history' : w.toUpperCase()))); thead.append(hr);
    const tb = el('tbody');
    for (const id of IDS) {
      const L = state.hist.series[id]?.long; const r = el('tr'); r.append(el('td', null, state.hist.series[id].name));
      for (const w of W) {
        const p = L?.percentiles?.[w], md = L?.medians?.pe?.[w];
        const td = el('td', p ? (p.p >= 0.75 ? 'down' : p.p <= 0.25 ? 'up' : '') : '');
        if (p) { td.append(ord(Math.round(p.p * 100))); td.append(el('span', 'sub', md ? `median ${f1(md)}x` : '')); } else td.textContent = '—';
        r.append(td);
      }
      tb.append(r);
    }
    t.replaceChildren(thead, tb);
  }
  function renderErp() {
    const box = document.getElementById('erp-cards'); if (!box) return;
    const E = erp();
    box.replaceChildren(...E.map((e) => {
      const c = el('div', 'card static'); c.style.setProperty('--cc', e.id === 'us' ? 'var(--c-dev)' : 'var(--c-micro)');
      const top = el('div', 'top'); const nm = el('div', 'name'); nm.append(el('i'), e.name); top.append(nm, el('span', 'chip ' + (e.erp > 3 ? 'cheap' : e.erp < 1.5 ? 'rich' : 'neutral'), e.erp > 3 ? 'Equities attractive' : e.erp < 1.5 ? 'Thin premium' : 'Fair premium'));
      const big = el('div', 'pe'); big.append(f2(e.erp), el('small', null, '% ERP'));
      const r1 = el('div', 'row'); r1.append(el('span', null, `Earnings yield ${f2(e.ey)}% (PE ${f1(e.pe)}x)`));
      const r2 = el('div', 'row'); r2.append(el('span', null, `Real 10y: ${e.realSrc}`));
      c.append(top, big, r1, r2); return c;
    }));
  }


  /* ---------------- world markets tab ---------------- */
  const PER = { d1: '1D', w1: '1W', m1: '1M', m3: '3M', ytd: 'YTD', y1: '1Y' };
  state.heatPer ||= 'd1';
  function heatColor(v, scale) {
    if (v == null || !isFinite(v)) return 'var(--grid)';
    const a = Math.min(1, Math.abs(v) / scale), pct = Math.round(10 + a * 62);
    return `color-mix(in srgb, ${v >= 0 ? 'var(--good)' : 'var(--bad)'} ${pct}%, var(--panel))`;
  }
  function heatGroup(name, note, items, per, fallback) {
    const wrap = el('div', 'hgroup'); const h = el('div', 'hhead'); h.append(el('b', null, name)); if (note) h.append(el('span', 'muted small', note)); wrap.append(h);
    const vals = items.map((x) => x[per] ?? (fallback ? x[fallback] : null)).filter((v) => v != null && isFinite(v));
    const scale = Math.max(0.005, d3.quantile(vals.map(Math.abs).sort(d3.ascending), 0.9) || 0.01);
    const list = document.getElementById('heat-sort')?.checked ? [...items].sort((a, b) => (b[per] ?? b[fallback] ?? -9) - (a[per] ?? a[fallback] ?? -9)) : items;
    const grid = el('div', 'hgrid');
    for (const x of list) {
      const v = x[per] ?? (fallback ? x[fallback] : null);
      const t = el('div', 'htile'); t.style.background = heatColor(v, scale);
      t.append(el('span', 'hname', x.name), el('span', 'hval', pctS(v, 1)), el('span', 'hsub', x.sub || (x.pe ? `PE ${f1(x.pe)}x` : '')));
      t.addEventListener('pointermove', (ev) => showTip(ev, `${x.name}${x.sub ? ' · ' + x.sub : ''}`, [
        ...(x.last != null ? [['Last', x.last >= 1000 ? d3.format(',.0f')(x.last) : x.last >= 10 ? x.last.toFixed(2) : x.last.toFixed(4)]] : []),
        ...Object.entries(PER).filter(([k]) => x[k] !== undefined).map(([k, l]) => [l, pctS(x[k], 1)]),
        ...(x.pe ? [['PE', f1(x.pe) + 'x']] : []), ...(x.adv != null ? [['Advances / declines', `${x.adv} / ${x.dec}`]] : []),
      ]));
      t.addEventListener('pointerleave', hideTip);
      grid.append(t);
    }
    wrap.append(grid); return wrap;
  }
  function renderWorld() {
    const M = state.markets; if (!M) return;
    const per = state.heatPer, box = document.getElementById('heat');
    // Commodities and crypto live on the Beyond Equities tab.
    const moved = el('p', 'muted small'); moved.append('Commodities and crypto are on the ', Object.assign(el('a', null, 'Beyond Equities tab'), { href: '#beyond' }), '.');
    box.replaceChildren(...(M.heat || []).filter((g) => g.id !== 'cmd' && g.id !== 'crypto').map((g) => heatGroup(g.name, g.note, g.items, per)), moved);
    const ib = document.getElementById('heat-india');
    const nper = ['d1', 'w1', 'm1', 'y1'].includes(per) ? per : 'm1';
    ib.replaceChildren(...(M.nse ? [heatGroup('Nifty sectors', M.nse.timestamp ? `NSE · ${M.nse.timestamp}` : '', M.nse.sectors, per, nper), heatGroup('Nifty factors and styles', '', M.nse.factors, per, nper)] : [el('div', 'empty', 'NSE sector data unavailable right now')]));
    renderFed(); renderYields();
  }
  function renderFed() {
    const rp = state.markets?.ratePath, cards = document.getElementById('fed-cards'); if (!rp) { cards.replaceChildren(el('div', 'empty', 'Fed funds futures unavailable right now')); return; }
    const nx = rp.meetings[0], H = window.PERules.helpers;
    const card = (name, big, sub, cls) => { const c = el('div', 'card static'); c.style.setProperty('--cc', 'var(--c-n500)'); const t = el('div', 'top'); const n = el('div', 'name'); n.append(name); t.append(n); c.append(t); const b = el('div', 'pe ' + (cls || '')); b.append(big); c.append(b); if (sub) c.append(el('div', 'row', sub)); return c; };
    cards.replaceChildren(
      card('Effective fed funds rate', f2(rp.effr) + '%', `${!rp.effrSrc || /^New York Fed/.test(rp.effrSrc) ? 'NY Fed' : 'Fed H.15 via DBnomics'}, ${fmtD(parseD(rp.effrAsOf))}`),
      card(`Next FOMC · ${fmtD(parseD(nx.date))}`, H.bp(nx.change), `${(nx.change / 0.25).toFixed(1)}× a 25bp ${nx.change >= 0 ? 'hike' : 'cut'} priced`, nx.change > 0.05 ? 'down' : nx.change < -0.05 ? 'up' : ''),
      card(`Priced by ${fmtD(parseD(rp.horizon.date))}`, H.bp(rp.horizon.cum), `${(rp.horizon.cum / 0.25).toFixed(1)} moves of 25bp · rate ${f2(rp.horizon.rate)}%`, rp.horizon.cum > 0.1 ? 'down' : rp.horizon.cum < -0.1 ? 'up' : ''),
      card('Change vs a month ago', rp.chg1m == null ? '—' : H.bp(rp.chg1m), 'Repricing of the 12-month path', rp.chg1m > 0.1 ? 'down' : rp.chg1m < -0.1 ? 'up' : ''),
    );
    const node = document.getElementById('fed-chart');
    if (node.clientWidth) {
      const { svg, M, iw, ih } = frame(node, 260, { t: 22, r: 20, b: 28, l: 48 });
      const pts = [{ date: 'Now', rate: rp.effr }, ...rp.meetings.map((m) => ({ date: m.date, rate: m.rate, cum: m.cum }))];
      const x = d3.scalePoint().domain(pts.map((p) => p.date)).range([0, iw]).padding(0.4);
      const ext = d3.extent(pts, (p) => p.rate), pad = Math.max(0.15, (ext[1] - ext[0]) * 0.2);
      const y = d3.scaleLinear().domain([ext[0] - pad, ext[1] + pad]).range([ih, 0]).nice();
      const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
      g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat('')).call((s) => s.select('.domain').remove());
      // On narrow screens label every second (or third) meeting so the dates never overlap; "Now" and the last always show.
      const every = Math.max(1, Math.ceil((pts.length * 50) / iw)), shown = pts.map((p) => p.date).filter((d, i, a) => i === a.length - 1 || (i % every === 0 && a.length - 1 - i >= every));
      g.append('g').attr('class', 'axis').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).tickValues(shown).tickFormat((d) => (d === 'Now' ? 'Now' : d3.utcFormat("%b '%y")(parseD(d)))));
      g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat((v) => v.toFixed(2) + '%'));
      g.append('line').attr('x1', 0).attr('x2', iw).attr('y1', y(rp.effr)).attr('y2', y(rp.effr)).attr('stroke', 'var(--ref)').attr('stroke-dasharray', '4 4');
      g.append('path').datum(pts).attr('fill', 'none').attr('stroke', 'var(--c-n500)').attr('stroke-width', 2).attr('d', d3.line().curve(d3.curveStepAfter).x((p) => x(p.date)).y((p) => y(p.rate)));
      g.selectAll('circle.p').data(pts).join('circle').attr('cx', (p) => x(p.date)).attr('cy', (p) => y(p.rate)).attr('r', 4).attr('fill', 'var(--c-n500)').attr('stroke', 'var(--panel)').attr('stroke-width', 2);
      g.selectAll('text.c').data(pts.filter((p) => p.cum != null)).join('text').attr('x', (p) => x(p.date)).attr('y', (p) => y(p.rate) - 9).attr('text-anchor', 'middle').attr('font-size', 10.5).attr('fill', 'currentColor').text((p) => H.bp(p.cum));
      g.selectAll('rect.h').data(pts).join('rect').attr('x', (p) => x(p.date) - x.step() / 2).attr('width', x.step()).attr('height', ih).attr('fill', 'transparent')
        .on('pointermove', (ev, p) => showTip(ev, p.date === 'Now' ? 'Effective fed funds today' : `After the ${fmtD(parseD(p.date))} FOMC`, [['Implied rate', f2(p.rate) + '%'], ...(p.cum != null ? [['vs today', H.bp(p.cum)], ['25bp moves', (p.cum / 0.25).toFixed(1)]] : [])]))
        .on('pointerleave', hideTip);
      svg.attr('role', 'img').attr('aria-label', 'Overnight rate implied by fed funds futures after each upcoming FOMC meeting');
    }
    const t = document.getElementById('tbl-fed'), thead = el('thead'), hr = el('tr');
    ['FOMC decision', 'Implied rate after', 'Priced at this meeting', 'Cumulative vs today', '25bp moves (cumulative)'].forEach((x) => hr.append(el('th', null, x))); thead.append(hr);
    const tb = el('tbody');
    for (const m of rp.meetings) { const r = el('tr'); [[fmtD(parseD(m.date))], [f2(m.rate) + '%'], [H.bp(m.change), m.change > 0.05 ? 'down' : m.change < -0.05 ? 'up' : ''], [H.bp(m.cum), 'strong'], [(m.moves >= 0 ? '+' : '−') + Math.abs(m.moves).toFixed(1)]].forEach(([v, c]) => r.append(el('td', c || '', v))); tb.append(r); }
    t.replaceChildren(thead, tb);
  }
  function renderYields() {
    const rows = state.pos?.yields, t = document.getElementById('tbl-yields'); if (!t) return;
    if (!rows) { t.replaceChildren(); return; }
    const C = state.macro?.countries || [], H = window.PERules.helpers;
    const thead = el('thead'), hr = el('tr'); ['Country', '10-year yield', '1W', '1M', '1Y', 'vs US', 'Real yield', '1 year', 'Source'].forEach((x) => hr.append(el('th', null, x))); thead.append(hr);
    const tb = el('tbody');
    for (const y of rows) {
      const cpi = C.find((c) => c.code === y.cpi)?.cpi;
      const r = el('tr');
      const nm = el('td'); nm.append(y.name, el('span', 'sub', `as of ${fmtD(parseD(y.asOf))}`));
      r.append(nm, el('td', 'strong', f2(y.last) + '%'));
      for (const k of ['w1', 'm1', 'y1']) r.append(el('td', y[k] == null ? '' : y[k] > 0.05 ? 'down' : y[k] < -0.05 ? 'up' : '', y[k] == null ? '—' : H.bp(y[k])));
      r.append(el('td', null, y.code === 'US' ? '—' : (y.vsUS >= 0 ? '+' : '−') + Math.abs(y.vsUS).toFixed(2) + ' pp'));
      r.append(el('td', null, cpi ? f2(y.last - cpi.last) + '%' : '—'));
      const sp = el('td', 'tdspark'); const sd = el('div', 'cspark'); sp.append(sd); r.append(sp);
      r.append(el('td', 'muted small', y.src + (y.stale ? ' · stale' : '')));
      if (y.spark?.length) requestAnimationFrame(() => spark(sd, y.spark, { h: 26, ind: { name: y.name + ' 10y', unit: '%', dp: 2 } }));
      tb.append(r);
    }
    t.replaceChildren(thead, tb);
  }

  /* ---------------- positioning & correlation ---------------- */
  function renderPositioning() {
    const P = state.pos; if (!P) return;
    const node = document.getElementById('cot-chart');
    if (node?.clientWidth && P.cftc?.length) {
      const rows = P.cftc;
      const H = rows.length * 38 + 34; node.style.height = H + 'px';
      const narrow = node.clientWidth < 620;
      const { svg, M, iw, ih } = frame(node, H, { t: 6, r: narrow ? 92 : 150, b: 26, l: narrow ? 96 : 140 });
      const ext = d3.max(rows, (c) => Math.max(Math.abs(c.min3y), Math.abs(c.max3y), Math.abs(c.net)));
      const x = d3.scaleLinear().domain([-ext, ext]).range([0, iw]).nice();
      const y = d3.scaleBand().domain(rows.map((c) => c.id)).range([0, ih]).padding(0.5);
      const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
      g.append('g').attr('class', 'grid').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(narrow ? 3 : 6).tickSize(-ih).tickFormat('')).call((s) => s.select('.domain').remove());
      g.append('g').attr('class', 'axis').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(narrow ? 3 : 6).tickFormat((v) => (v > 0 ? '+' : '') + Math.round(v * 100) + '%'));
      g.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', ih).attr('stroke', 'var(--ref)');
      const row = g.selectAll('g.r').data(rows).join('g').attr('class', 'r').attr('transform', (c) => `translate(0,${y(c.id)})`);
      const bw = y.bandwidth();
      const short = (n) => (narrow ? n.replace('US 10-year Treasury', '10y Treasury').replace('US dollar index', 'Dollar index').replace('Japanese yen', 'Yen') : n);
      row.append('text').attr('x', -10).attr('y', bw / 2).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', narrow ? 11 : 12).attr('fill', 'currentColor').text((c) => short(c.name));
      row.append('rect').attr('x', (c) => x(c.min3y)).attr('width', (c) => Math.max(1, x(c.max3y) - x(c.min3y))).attr('height', bw).attr('rx', bw / 2).attr('fill', 'var(--range)');
      const ext95 = (c) => c.pct3y > 0.9 || c.pct3y < 0.1;
      row.append('circle').attr('cx', (c) => x(c.net)).attr('cy', bw / 2).attr('r', 7).attr('fill', (c) => (ext95(c) ? 'var(--bad)' : 'var(--c-n500)')).attr('stroke', 'var(--panel)').attr('stroke-width', 2);
      row.append('text').attr('x', iw + 10).attr('y', bw / 2).attr('dy', '0.35em').attr('font-size', 11.5).attr('fill', (c) => (ext95(c) ? 'var(--bad)' : 'currentColor')).attr('font-weight', (c) => (ext95(c) ? 600 : 400))
        .text((c) => (narrow ? `${ord(Math.round(c.pct3y * 100))} pctl` : `${pctS(c.net, 0)} · ${ord(Math.round(c.pct3y * 100))} pctl`));
      row.append('rect').attr('x', -M.l).attr('width', iw + M.l + M.r).attr('y', -8).attr('height', bw + 16).attr('fill', 'transparent')
        .on('pointermove', (ev, c) => showTip(ev, `${c.name} · ${c.who}`, [['Net % of open interest', pctS(c.net, 1)], ['3-year percentile', ord(Math.round(c.pct3y * 100))], ['3-year range', `${pctS(c.min3y, 0)} to ${pctS(c.max3y, 0)}`], ['Change, 1 week', pctS(c.chg1w, 1)], ['Change, 4 weeks', pctS(c.chg4w, 1)], ...(c.amNet != null ? [['Asset managers net', pctS(c.amNet, 1)]] : []), ['As of', fmtD(parseD(c.asOf))]]))
        .on('pointerleave', hideTip);
      svg.attr('role', 'img').attr('aria-label', 'Speculative net positioning by market against its 3-year range');
    }
    const C = P.corr; if (!C) return;
    const H = window.PERules.helpers;
    const cc = (name, val, sub, cls) => { const c = el('div', 'card static'); c.style.setProperty('--cc', 'var(--c-mid)'); const t = el('div', 'top'); const n = el('div', 'name'); n.append(name); t.append(n); const b = el('div', 'pe ' + (cls || '')); b.append(val); c.append(t, b, el('div', 'row', sub)); return c; };
    document.getElementById('corr-cards').replaceChildren(
      cc('Stock–bond correlation', (C.stockBond.last >= 0 ? '+' : '−') + Math.abs(C.stockBond.last).toFixed(2), C.stockBond.last > 0.3 ? 'Bonds are not hedging equities' : C.stockBond.last < -0.1 ? 'Bonds are hedging equities' : 'Weak relationship', C.stockBond.last > 0.3 ? 'down' : C.stockBond.last < -0.1 ? 'up' : ''),
      ...(C.niftySpx ? [cc('Nifty 50 vs S&P 500 correlation', (C.niftySpx.last >= 0 ? '+' : '−') + Math.abs(C.niftySpx.last).toFixed(2), `10-year average ${H.f2(C.niftySpx.mean)}. Low = India diversifies a global book.`)] : []),
      cc('VIX vs realised volatility', `${f1(C.vol.vix)} vs ${f1(C.vol.realised.last)}`, C.vol.premium > 4 ? `Options price ${f1(C.vol.premium)} pts more fear than markets show` : C.vol.premium < 0 ? 'Realised volatility above implied: stress' : 'Implied close to realised'),
    );
    const SER = [['stockBond', 'S&P 500 vs US Treasuries (IEF)', 'var(--c-n500)'], ['niftySpx', 'Nifty 50 vs S&P 500', 'var(--c-micro)'], ['goldSpx', 'Gold vs S&P 500', 'var(--c-em)']].filter(([k]) => C[k]);
    state.corrHidden ||= new Set(['goldSpx']);
    document.getElementById('corr-legend').replaceChildren(...SER.map(([k, name, col]) => { const b = el('button', 'li' + (state.corrHidden.has(k) ? ' off' : '')); const i = el('i'); i.style.background = col; b.append(i, `${name} ${H.f2(C[k].last)}`); b.onclick = () => { state.corrHidden.has(k) ? state.corrHidden.delete(k) : state.corrHidden.add(k); renderPositioning(); }; return b; }));
    const node2 = document.getElementById('corr-chart'); if (!node2?.clientWidth) return;
    const vis = SER.filter(([k]) => !state.corrHidden.has(k)).map(([k, name, col]) => ({ k, name, col, pts: C[k].series.map(([d, v]) => ({ date: parseD(d), v })) }));
    const { svg, M, iw, ih } = frame(node2, 260, { t: 10, r: 46, b: 26, l: 40 });
    if (!vis.length) return;
    const x = d3.scaleUtc().domain(d3.extent(vis.flatMap((d) => d.pts), (p) => p.date)).range([0, iw]);
    const y = d3.scaleLinear().domain([-1, 1]).range([ih, 0]);
    const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
    g.append('rect').attr('x', 0).attr('width', iw).attr('y', y(1)).attr('height', y(0.3) - y(1)).attr('fill', 'var(--bad-bg)').attr('opacity', 0.6);
    g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat('')).call((s) => s.select('.domain').remove());
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(iw / 100))).tickSizeOuter(0));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('+.1f')));
    g.append('line').attr('x1', 0).attr('x2', iw).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--ref)');
    g.append('text').attr('x', 4).attr('y', y(1) + 12).attr('font-size', 10.5).attr('fill', 'var(--muted)').text('Above +0.3: bonds not hedging');
    for (const d of vis) g.append('path').datum(d.pts).attr('fill', 'none').attr('stroke', d.col).attr('stroke-width', 1.6).attr('d', d3.line().x((p) => x(p.date)).y((p) => y(p.v)));
    const labs = vis.map((d) => ({ col: d.col, v: d.pts.at(-1).v, y: y(d.pts.at(-1).v) })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < labs.length; k++) if (labs[k].y - labs[k - 1].y < 13) labs[k].y = labs[k - 1].y + 13;
    for (const l of labs) g.append('text').attr('x', iw + 6).attr('y', l.y).attr('dy', '0.35em').attr('font-size', 11).attr('font-weight', 600).attr('fill', l.col).text(H.f2(l.v));
    const bis = d3.bisector((p) => p.date).center, cross = g.append('line').attr('y1', 0).attr('y2', ih).attr('stroke', 'var(--muted)').attr('opacity', 0);
    g.append('rect').attr('width', iw).attr('height', ih).attr('fill', 'transparent')
      .on('pointermove', (ev) => { const dt = x.invert(d3.pointer(ev)[0]); cross.attr('x1', x(dt)).attr('x2', x(dt)).attr('opacity', 0.5); showTip(ev, fmtD(dt), vis.map((d) => [d.name, H.f2(d.pts[bis(d.pts, dt)].v), cssVar(d.col)])); })
      .on('pointerleave', () => { cross.attr('opacity', 0); hideTip(); });
    svg.attr('role', 'img').attr('aria-label', 'Rolling 26-week correlations over 10 years');
  }

  /* ---------------- daily brief panel ---------------- */
  function renderBrief() {
    const B = state.brief, box = document.getElementById('brief'), st = document.getElementById('brief-status'); if (!box) return;
    if (!B) { box.replaceChildren(el('div', 'empty', 'Brief unavailable right now')); return; }
    const ch = B.channels || {};
    st.textContent = window.GMM_STATIC ? `Rebuilt with every update · ${B.generatedAt ? new Date(B.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST' : ''}` : `Sent 07:00 IST on weekdays · Telegram ${ch.telegram ? 'on' : 'off'} · Email ${ch.email ? 'on' : 'off'}`;
    const grid = el('div', 'brief');
    for (const s of B.sections) {
      const sec = el('div', 'bsec'); sec.append(el('h3', null, s.title));
      for (const line of s.lines) for (const part of line.split('\n')) { const p = el('p'); p.textContent = part.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); sec.append(p); }
      grid.append(sec);
    }
    const foot = el('p', 'muted small');
    foot.textContent = ch.telegram || ch.email ? `Last composed ${new Date(B.generatedAt).toLocaleString()}. Alerts are also pushed within 30 minutes of switching on or clearing.` : 'Delivery is off. Add a Telegram bot or a Resend email key in Netlify to receive this every weekday at 07:00 IST, plus instant alert pushes (README → "Daily brief and alerts").';
    box.replaceChildren(el('div', 'muted small', B.title), grid, foot);
  }

  /* ---------------- public ---------------- */
  function renderOverview() { if (!state.macro) return; renderRegime(); renderTiles(); renderChanged(); renderAlerts(); renderChecklist(); renderCalendar(); renderBrief(); }
  return {
    renderTab(tab) {
      if (!state.macro?.ok) return;
      if (tab === 'overview') renderOverview();
      if (tab === 'macro') renderMacroTab();
      if (tab === 'liquidity') { renderLiquidityTab(); renderPositioning(); }
      if (tab === 'markets') renderWorld();
      if (tab === 'india') renderIndiaTab();
      if (tab === 'calendar') renderCalendarTab();
      if (tab === 'valuations') { renderLongTable(); renderErp(); }
    },
    pillar, erp, alerts,
  };
};
