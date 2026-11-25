/* Global Markets Monitor — Mutual funds tab.
   Loaded before app.js, which calls window.PEFunds(ctx). Data: /api/mf, built by lib/mf from official sources only:
   AMFI monthly reports (category flows, AUM, folios, new funds), AMFI's SIP page (SIP totals, accounts, SIP assets),
   SEBI's monthly table (SIP by category), NSDL (foreign portfolio flows), SEBI (funds' share trading), AMFI (fund-house
   average AUM, direct-plan split, offers open now), and FII/DII flows (NSE and BSE, NSDL, SEBI). */
window.PEFunds = function (ctx) {
  'use strict';
  const { state, el, showTip, hideTip } = ctx;
  const $ = (id) => document.getElementById(id);
  const V = (state.mfv ||= { month: null, cls: 'all', sortK: 'net', sortDir: -1, heat: 'long', heatN: 13, gains: 'total', sipAll: false, amcAll: false, nfoAll: false, open: new Set(), instView: 'day', instSeries: 'exch', instRange: 66, instYear: 'cy', instAll: false });

  /* ---------- formatting ---------- */
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const IN = (n, d = 0) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  const sgn = (v, plus) => (v < 0 ? '−\u2060' : plus && v > 0 ? '+\u2060' : ''); // word joiner keeps the sign with the number
  const cr = (v, plus = false) => (!fin(v) ? '—' : Math.abs(v) >= 1e5 ? `${sgn(v, plus)}₹${IN(Math.abs(v) / 1e5, 2)} lakh cr` : `${sgn(v, plus)}₹${IN(Math.round(Math.abs(v)))} cr`);
  const num = (v, plus = false, d = 0) => (!fin(v) ? '—' : sgn(Math.round(v * 10 ** d) / 10 ** d, plus) + IN(Math.abs(v), d));
  const pct = (v, d = 1, plus = false) => (!fin(v) ? '—' : `${sgn(v, plus)}${IN(Math.abs(v * 100), d)}%`);
  const lakh = (n, d = 1, plus = false) => (!fin(n) ? '—' : `${sgn(n, plus)}${IN(Math.abs(n) / 1e5, d)} lakh`);
  const crore = (n, d = 2) => (!fin(n) ? '—' : `${IN(n / 1e7, d)} crore`);
  const lk = (v, d = 2, plus = false) => (!fin(v) ? '—' : `${sgn(v, plus)}${IN(Math.abs(v), d)} lakh`); // AMFI's SIP counts, already in lakh
  const axisCr = (v) => (v === 0 ? '0' : Math.abs(v) >= 1e5 ? `${sgn(v)}${IN(Math.abs(v) / 1e5, Math.abs(v) % 1e5 ? 1 : 0)}L` : `${sgn(v)}${IN(Math.abs(v) / 1e3, Math.abs(v) % 1e3 ? 1 : 0)}k`);
  const axisLakh = (v) => (v === 0 ? '0' : `${sgn(v)}${IN(Math.abs(v) / 1e5, Math.abs(v) % 1e5 ? 1 : 0)}L`);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const ms = (p) => `${MON[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}`; // "Sep 2026" in text: "Sep 26" reads like a date
  const mAx = (p) => `${MON[+p.slice(5, 7) - 1]} ’${p.slice(2, 4)}`; // "Sep ’26": compact, for chart axes and table headings
  const ml = (p) => `${MONTHS[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}`;
  const mOnly = (p) => MONTHS[+p.slice(5, 7) - 1];
  const addM = (p, k) => { const t = +p.slice(0, 4) * 12 + (+p.slice(5, 7) - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
  const dayL = (iso) => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return y && m && d ? `${d} ${MON[m - 1]} ${y}` : String(iso); };
  const ago = (iso) => { const s = (Date.now() - Date.parse(iso)) / 1000; if (!fin(s)) return ''; if (s < 90) return 'just now'; if (s < 5400) return `${Math.round(s / 60)} min ago`; if (s < 129600) return `${Math.round(s / 3600)} h ago`; return `on ${dayL(iso)}`; };
  const sum = (a) => a.reduce((s, x) => s + (fin(x) ? x : 0), 0);
  // Tooltip titles say what kind of period a figure covers.
  const tMonth = (m) => `${ml(m)} · monthly`;
  const tDay = (d) => `${dayL(d)} · daily`;

  /* ---------- reference data from the API ---------- */
  const CLS_C = { equity: 'var(--c-n500)', hybrid: 'var(--c-mid)', passive: 'var(--c-small)', debt: 'var(--c-n50)', solution: 'var(--c-em)', fofovs: 'var(--c-micro)', closed: 'var(--c-agg)', interval: 'var(--c-agg)' };
  const GROUPS = { all: null, equity: ['equity'], hybrid: ['hybrid'], passive: ['passive'], debt: ['debt'], other: ['solution', 'fofovs', 'closed', 'interval'], long: ['equity', 'hybrid', 'passive', 'solution', 'fofovs'] };
  const GROUP_LABEL = { all: 'All funds', equity: 'Equity', hybrid: 'Hybrid', passive: 'Index funds & ETFs', debt: 'Debt', other: 'Other', long: 'Equity, hybrid & passive' };
  const TK_NAME = { retirement: 'Retirement & life cycle', otheretf: 'ETFs other than gold', index: 'Index funds', fofovs: 'Overseas fund of funds' };
  const NFO_CLS = { equity: 'Equity', hybrid: 'Hybrid', passive: 'Index fund / ETF', debt: 'Debt', solution: 'Solution', fofdom: 'Fund of funds (domestic)', fofovs: 'Fund of funds (overseas)', closed: 'Close-ended', other: 'Other' };
  let O = null, CAT = {}, CLS = {}, CLASS_ORDER = [], TKS = [];
  function prep(o) {
    if (O === o) return;
    O = o;
    CAT = Object.fromEntries(o.meta.cats.map((c) => [c.k, c]));
    CLS = Object.fromEntries(o.meta.classes); CLASS_ORDER = o.meta.classes.map(([c]) => c);
    TKS = o.meta.trend.map((t) => ({ ...t, name: TK_NAME[t.tk] || t.name }));
    if (!V.month || !o.amfi[V.month]) V.month = o.latest;
  }
  const inGroup = (cls, g) => !GROUPS[g] || GROUPS[g].includes(cls);

  /* ---------- small building blocks ---------- */
  const td = (c, cls) => { const x = el('td', cls); if (c instanceof Node) x.append(c); else x.textContent = c ?? '—'; return x; };
  const thh = (t, cls, title) => { const x = el('th', cls, t); x.scope = 'col'; if (title) x.title = title; return x; };
  const sub = (a, b) => { const f = document.createDocumentFragment(); f.append(a); if (b) f.append(el('span', 'sub', b)); return f; };
  const delta = (v, fmt) => el('span', 'delta' + (fin(v) && Math.round(v) !== 0 ? (v > 0 ? ' up' : ' dn') : ''), fin(v) ? fmt(v) : '—');
  const empty = (node, text) => node.replaceChildren(el('div', 'empty pad', text));
  const lead = (node, text) => { const p = el('p', 'mf-lead'); p.textContent = text; node.append(p); return p; };
  const sw = (color) => { const s = el('span', 'sw'); s.style.background = color; return s; };
  function legend(items) {
    const d = el('div', 'legend');
    for (const [name, color, kind] of items) { const s = el('span', 'li'); const i = el('i', kind === 'sq' ? 'sq' : null); i.style.background = color; if (kind === 'tick') { i.style.width = '2px'; i.style.height = '10px'; } s.append(i, name); d.append(s); }
    return d;
  }
  function chipsRow(items) { // [label, value, sub, cls]
    const box = el('div', 'chips');
    for (const [k, v, s, cls] of items) { const c = el('span', 'kchip' + (cls ? ' ' + cls : '')); c.append(el('span', 'k', k), el('b', null, v)); if (s) c.append(el('span', 'muted small', s)); box.append(c); }
    return box;
  }
  function choice(box, opts, cur, onPick, cls = 'seg small') { // segmented control
    const s = el('div', cls); s.setAttribute('role', 'group');
    for (const [v, label] of opts) { const b = el('button', v === cur ? 'on' : null, label); b.type = 'button'; b.onclick = () => onPick(v); s.append(b); }
    box.append(s); return s;
  }
  function chipChoice(box, opts, cur, onPick) {
    const c = el('div', 'chips');
    for (const [v, label] of opts) { const b = el('button', 'chipbtn' + (v === cur ? ' on' : ''), label); b.type = 'button'; b.setAttribute('aria-pressed', v === cur); b.onclick = () => onPick(v); c.append(b); }
    box.append(c); return c;
  }

  /* ---------- charts ---------- */
  function svgBox(node, height, M) {
    const W = Math.max(160, node.clientWidth || 320);
    node.replaceChildren();
    const svg = d3.select(node).append('svg').attr('width', W).attr('height', height).attr('viewBox', `0 0 ${W} ${height}`).attr('role', 'img');
    return { svg, W, M, iw: W - M.l - M.r, ih: height - M.t - M.b, g: svg.append('g').attr('transform', `translate(${M.l},${M.t})`) };
  }
  function monthAxis(g, x, months, iw, ih, fmt = mAx) {
    const step = Math.max(1, Math.ceil(months.length / Math.max(2, Math.floor(iw / 48))));
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).tickValues(months.filter((m, i) => (months.length - 1 - i) % step === 0)).tickFormat(fmt).tickSizeOuter(0));
  }
  // Small chart in a headline card. With periods (one per value) and rows(j), hovering (or tapping) shows that period's figures.
  function spark(node, vals, { bars = false, color = 'var(--c-n500)', periods = null, title = tMonth, rows = null } = {}) {
    requestAnimationFrame(() => {
      const pts = vals.map((v, i) => [i, v]).filter(([, v]) => fin(v)); if (pts.length < 2) return;
      const { svg, g, iw, ih } = svgBox(node, node.clientHeight || 36, { t: 4, r: 4, b: 4, l: 4 });
      const x = d3.scaleLinear().domain([0, vals.length - 1]).range([0, iw]);
      let mark;
      if (bars) {
        const ext = d3.max(pts, ([, v]) => Math.abs(v)) || 1, y = d3.scaleLinear().domain([-ext, ext]).range([ih, 0]), bw = Math.max(1.5, iw / vals.length - 2);
        const lastI = pts[pts.length - 1][0], base = (i) => (i === lastI ? 1 : 0.5);
        const rs = g.selectAll('rect').data(pts).join('rect').attr('x', ([i]) => x(i) - bw / 2).attr('width', bw).attr('y', ([, v]) => y(Math.max(0, v))).attr('height', ([, v]) => Math.max(0.6, Math.abs(y(v) - y(0))))
          .attr('fill', ([, v]) => (v >= 0 ? color : 'var(--bad)')).attr('opacity', ([i]) => base(i));
        mark = (k) => rs.attr('opacity', ([i]) => (k == null ? base(i) : i === k ? 1 : 0.28));
      } else {
        const [lo, hi] = d3.extent(pts, ([, v]) => v), y = d3.scaleLinear().domain([lo, hi === lo ? lo + 1 : hi]).range([ih, 0]);
        g.append('path').datum(pts).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 1.6).attr('d', d3.line().x(([i]) => x(i)).y(([, v]) => y(v)));
        const [li, lv] = pts[pts.length - 1]; g.append('circle').attr('cx', x(li)).attr('cy', y(lv)).attr('r', 2.4).attr('fill', color);
        const guide = g.append('line').attr('y1', -4).attr('y2', ih + 4).attr('stroke', 'var(--ref)').attr('stroke-dasharray', '2 2').attr('opacity', 0);
        const dot = g.append('circle').attr('r', 3.6).attr('fill', color).attr('stroke', 'var(--panel)').attr('stroke-width', 1.5).attr('opacity', 0);
        mark = (k) => { const on = k != null; guide.attr('opacity', on ? 1 : 0); dot.attr('opacity', on ? 1 : 0); if (on) { guide.attr('x1', x(k)).attr('x2', x(k)); dot.attr('cx', x(k)).attr('cy', y(vals[k])); } };
      }
      if (!periods || !rows) return;
      const near = (px) => { const k = Math.round(x.invert(px)); let best = null; for (const [i] of pts) if (best == null || Math.abs(i - k) < Math.abs(best - k)) best = i; return best; };
      const show = (ev) => { const k = near(d3.pointer(ev, g.node())[0]); mark(k); showTip(ev, title(periods[k]), rows(k)); };
      svg.style('cursor', 'crosshair').append('rect').attr('width', '100%').attr('height', '100%').attr('fill', 'transparent')
        .on('pointermove', show).on('pointerdown', show)
        .on('pointerleave', (ev) => { mark(null); if (ev.pointerType === 'touch') setTimeout(hideTip, 2500); else hideTip(); });
    });
  }
  // Bars by month. series [{ name, color, vals }]; stack: positives stack up and negatives down; total: a marker per month.
  function barsByMonth(node, months, series, { height = 220, stack = false, tip = cr, yfmt = axisCr, unit = '₹ crore', per = 'monthly', total = null, totalName = 'Total', label = '', xfmt = mAx, tipTitle = tMonth } = {}) {
    const S = series.filter((s) => s.vals.some(fin));
    if (!S.length || months.length < 2) return empty(node, 'Not enough months loaded yet.');
    requestAnimationFrame(() => {
      const { svg, g, iw, ih } = svgBox(node, height, { t: 18, r: 6, b: 22, l: 44 });
      svg.attr('aria-label', label || S.map((s) => s.name).join(', '));
      const x = d3.scaleBand().domain(months).range([0, iw]).paddingInner(0.24).paddingOuter(0.06);
      let lo = 0, hi = 0;
      const stacks = months.map((m, i) => { let p = 0, n = 0; return S.map((s) => { const v = s.vals[i]; if (!fin(v)) return null; const a = v >= 0 ? p : n; if (v >= 0) p += v; else n += v; return { s, y0: a, y1: a + v }; }); });
      if (stack) for (const st of stacks) for (const b of st) { if (b) { lo = Math.min(lo, b.y0, b.y1); hi = Math.max(hi, b.y0, b.y1); } }
      else for (const s of S) for (const v of s.vals) if (fin(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (total) for (const v of total) if (fin(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const y = d3.scaleLinear().domain([lo, hi === lo ? lo + 1 : hi]).range([ih, 0]).nice();
      g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat('')).call((s) => s.select('.domain').remove());
      g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(4).tickFormat(yfmt));
      monthAxis(g, x, months, iw, ih, xfmt);
      svg.append('text').attr('x', 2).attr('y', 11).attr('font-size', 10.5).attr('fill', 'var(--muted)').text(per ? `${unit} · ${per}` : unit);
      const bw = stack ? x.bandwidth() : x.bandwidth() / S.length;
      months.forEach((m, i) => {
        if (stack) for (const b of stacks[i]) { if (b) g.append('rect').attr('x', x(m)).attr('width', bw).attr('y', y(Math.max(b.y0, b.y1))).attr('height', Math.max(0.6, Math.abs(y(b.y0) - y(b.y1)))).attr('fill', b.s.color); }
        else S.forEach((s, j) => { const v = s.vals[i]; if (fin(v)) g.append('rect').attr('x', x(m) + j * bw).attr('width', Math.max(1, bw - (S.length > 1 ? 1 : 0))).attr('y', y(Math.max(0, v))).attr('height', Math.max(0.6, Math.abs(y(v) - y(0)))).attr('fill', s.color); });
        if (total && fin(total[i])) g.append('line').attr('x1', x(m) - 2).attr('x2', x(m) + x.bandwidth() + 2).attr('y1', y(total[i])).attr('y2', y(total[i])).attr('stroke', 'var(--fg)').attr('stroke-width', 2);
      });
      g.append('line').attr('x1', 0).attr('x2', iw).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--ref)');
      g.selectAll('rect.hov').data(months).join('rect').attr('class', 'hov').attr('x', (m) => x(m) - (x.step() - x.bandwidth()) / 2).attr('width', x.step()).attr('y', 0).attr('height', ih).attr('fill', 'transparent')
        .on('pointermove', (ev, m) => { const i = months.indexOf(m); showTip(ev, tipTitle(m), [...S.map((s) => [s.name, tip(s.vals[i]), s.color]), ...(total ? [[totalName, tip(total[i])]] : [])]); })
        .on('pointerleave', hideTip);
    });
  }
  function linesByMonth(node, months, series, { height = 210, yfmt = (v) => pct(v, 0), tip = (v) => pct(v, 1), label = '', zero = true } = {}) {
    const S = series.filter((s) => s.vals.filter(fin).length >= 2);
    if (!S.length) return empty(node, 'Not enough months loaded yet.');
    requestAnimationFrame(() => {
      const { svg, g, iw, ih } = svgBox(node, height, { t: 10, r: 10, b: 22, l: 40 });
      svg.attr('aria-label', label || S.map((s) => s.name).join(', '));
      const x = d3.scalePoint().domain(months).range([0, iw]).padding(0.3);
      const all = S.flatMap((s) => s.vals.filter(fin)), [lo, hi] = d3.extent(all);
      const y = d3.scaleLinear().domain([zero ? Math.min(0, lo) : lo - (hi - lo) * 0.1, hi + (hi - lo) * 0.08 || 1]).range([ih, 0]).nice();
      g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat('')).call((s) => s.select('.domain').remove());
      g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(4).tickFormat(yfmt));
      monthAxis(g, x, months, iw, ih);
      for (const s of S) {
        const pts = s.vals.map((v, i) => [months[i], v]).filter(([, v]) => fin(v));
        g.append('path').datum(pts).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', 1.9).attr('stroke-linejoin', 'round').attr('d', d3.line().x(([m]) => x(m)).y(([, v]) => y(v)));
        const [lm, lv] = pts[pts.length - 1]; g.append('circle').attr('cx', x(lm)).attr('cy', y(lv)).attr('r', 3).attr('fill', s.color);
      }
      const guide = g.append('line').attr('y1', 0).attr('y2', ih).attr('stroke', 'var(--ref)').attr('stroke-dasharray', '3 3').attr('opacity', 0);
      g.append('rect').attr('width', iw).attr('height', ih).attr('fill', 'transparent')
        .on('pointermove', (ev) => { const [px] = d3.pointer(ev); const i = Math.max(0, Math.min(months.length - 1, Math.round((px - x(months[0])) / (x.step() || 1)))); const m = months[i]; guide.attr('x1', x(m)).attr('x2', x(m)).attr('opacity', 1); showTip(ev, tMonth(m), S.map((s) => [s.name, tip(s.vals[i]), s.color])); })
        .on('pointerleave', () => { guide.attr('opacity', 0); hideTip(); });
    });
  }
  // Horizontal bars with an optional marker for the previous month.
  function hbars(node, rows, { fmt = cr, prevName = 'Previous month', curName = 'This month' } = {}) {
    if (!rows.length) return empty(node, 'No data.');
    requestAnimationFrame(() => {
      const W = node.clientWidth || 320, L = Math.min(190, Math.round(W * 0.42)), rowH = 24;
      const { g, iw } = svgBox(node, rows.length * rowH + 8, { t: 4, r: 74, b: 4, l: L });
      const x = d3.scaleLinear().domain([0, d3.max(rows, (r) => Math.max(r.v, r.p || 0)) || 1]).range([0, iw]);
      const maxCh = Math.floor((L - 8) / 6.4);
      rows.forEach((r, i) => {
        const yy = i * rowH, row = g.append('g').attr('transform', `translate(0,${yy})`);
        row.append('text').attr('x', -8).attr('y', rowH / 2).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 12).attr('fill', 'var(--fg)').text(r.name.length > maxCh ? r.name.slice(0, maxCh - 1) + '…' : r.name);
        row.append('rect').attr('x', 0).attr('y', 4).attr('height', rowH - 9).attr('width', Math.max(1, x(r.v))).attr('rx', 3).attr('fill', r.color || 'var(--c-n500)');
        if (fin(r.p)) row.append('line').attr('x1', x(r.p)).attr('x2', x(r.p)).attr('y1', 2).attr('y2', rowH - 3).attr('stroke', 'var(--fg)').attr('stroke-width', 2);
        row.append('text').attr('x', x(Math.max(r.v, r.p || 0)) + 6).attr('y', rowH / 2).attr('dy', '0.35em').attr('font-size', 11.5).attr('fill', 'var(--muted)').text(fmt(r.v));
        row.append('rect').attr('x', -L).attr('width', L + iw + 74).attr('height', rowH).attr('fill', 'transparent')
          .on('pointermove', (ev) => showTip(ev, r.name, [[curName, fmt(r.v), r.color], ...(fin(r.p) ? [[prevName, fmt(r.p)], ['Change', fmt(r.v - r.p)]] : []), ...(r.extra || [])]))
          .on('pointerleave', hideTip);
      });
    });
  }

  /* ---------- 1. headline numbers ---------- */
  function renderHead() {
    const o = O, T = o.trend, g = T.total, i = o.months.length - 1, eq = T.cls.equity.net;
    const A = o.sipAmfi;
    $('mf-asof').textContent = [`${ml(o.latest)} from AMFI's monthly report`, A ? `SIPs to ${ml(A.latest)} from AMFI's SIP data` : '', o.sip.latest ? `SIPs by category to ${ml(o.sip.latest)} from SEBI` : '', o.fpi.upTo ? `foreign investors to ${o.fpi.upTo} (NSDL)` : ''].filter(Boolean).join('; ') + `. Official sources only, and every total is checked before it is shown. Updated ${ago(o.builtAt)}. Not investment advice.`;
    const box = $('mf-kpis'); box.replaceChildren();
    // card(name, value, chips [label, value, cls, explanation], small-chart values, opts). opts.periods (one per value), opts.title
    // and opts.rows(j) make the small chart show each period's figures on hover; the line under it says what the periods are.
    const card = (name, val, chips, sp, opts = {}) => {
      const c = el('div', 'icard'), h = el('div', 'ih'); h.append(el('span', 'iname', name)); if (opts.badge) h.append(el('span', 'badge warn', opts.badge));
      c.append(h, el('div', 'ival', val));
      if (chips?.length) { const ch = el('div', 'ichips'); for (const [k, v, cls, ti] of chips) { const x = el('span', 'ichip'); if (ti) x.title = ti; x.append(el('i', null, k), el('b', cls || null, v)); ch.append(x); } c.append(ch); }
      if (sp) {
        const s = el('div', 'ispark'); c.append(s); spark(s, sp, opts);
        const ps = (opts.periods || []).filter((p, j) => fin(sp[j]));
        if (ps.length >= 2) c.append(el('div', 'ispan', `${opts.per || 'Monthly'} · ${ms(ps[0])} – ${ms(ps[ps.length - 1])}${opts.toDate ? ' (to date)' : ''}`));
      }
      c.append(el('div', 'ifoot muted', opts.foot || ''));
      box.append(c);
    };
    const P = (n) => o.months.slice(-n), last = (a, n = 13) => a.slice(-n);
    const chg = (a, j) => (j > 0 && fin(a[j]) && fin(a[j - 1]) && a[j - 1] ? a[j] / a[j - 1] - 1 : null);
    const yoy = (a) => (i >= 12 && fin(a[i]) && fin(a[i - 12]) ? a[i] / a[i - 12] - 1 : null);
    const pP = i > 0 ? o.months[i - 1] : null, yP = i >= 12 ? o.months[i - 12] : null;
    const MOM = pP ? `Month-on-month: ${ml(o.latest)} against ${ml(pP)}` : '', YOY = yP ? `Year-on-year: ${ml(o.latest)} against ${ml(yP)}` : '';
    { // 1) all funds; the tooltip splits each month into equity, debt and the rest
      const v = last(g.net), ps = P(13), C = T.cls, at = (a, p) => { const j = o.months.indexOf(p); return j >= 0 && a ? a[j] : null; };
      card('Net inflows, all funds', cr(g.net[i]), [...(pP ? [[ms(pP), cr(g.net[i - 1]), null, `Net inflows in ${ml(pP)}, the month before`]] : []), ...(yP ? [[ms(yP), cr(g.net[i - 12]), null, `Net inflows in ${ml(yP)}, a year earlier`]] : [])], v, {
        bars: true, periods: ps, foot: `${ml(o.latest)} · includes liquid and other debt funds`,
        rows: (j) => { const p = ps[j], e = at(C.equity?.net, p), d = at(C.debt?.net, p); return [['Net inflows, all funds', cr(v[j], true)], ...(fin(e) ? [['Equity funds (active)', cr(e, true)]] : []), ...(fin(d) ? [['Debt funds', cr(d, true)]] : []), ...(fin(e) && fin(d) ? [['Hybrid, index funds & other', cr(v[j] - e - d, true)]] : [])]; },
      });
    }
    { // 2) active equity funds
      const v = last(eq), ps = P(13), n12 = Math.min(12, eq.length);
      card('Equity funds (active), net', cr(eq[i]), [...(pP ? [[ms(pP), cr(eq[i - 1]), null, `Net inflows into active equity funds in ${ml(pP)}`]] : []), [`${n12}-month avg`, cr(sum(eq.slice(-n12)) / n12), null, `Average monthly net inflow over the ${n12} months to ${ml(o.latest)}`]], v, {
        bars: true, periods: ps, foot: 'Actively managed equity schemes',
        rows: (j) => [['Equity funds (active), net', cr(v[j], true)]],
      });
    }
    const sl = o.sip.latest, S = sl && o.sip.m[sl], Sp = sl && o.sip.m[addM(sl, -1)];
    const SIP_FOOT = 'AMFI industry total (all channels, incl. BSE & NSE)';
    if (A) { // AMFI's SIP page: out with AMFI's monthly data, so it is the latest official SIP figure
      const m = A.latest, at = (p) => { const j = A.months.indexOf(p); return j >= 0 ? A.amt[j] : null; }, v = at(m), pv = at(addM(m, -1)), yv = at(addM(m, -12));
      const d = A.det[m] && !A.det[m].unchecked ? A.det[m] : null, stop = d && d.newReg ? d.disc / d.newReg : null;
      const sv = A.amt.slice(-13), ps = A.months.slice(-13);
      card('SIP inflows', cr(v), [
        ...(fin(pv) ? [[ms(addM(m, -1)), cr(pv), null, `SIP inflows in ${ml(addM(m, -1))}`], ['MoM', pct(v / pv - 1, 1, true), null, `Month-on-month: ${ml(m)} against ${ml(addM(m, -1))}`]] : []),
        ...(fin(yv) ? [['YoY', pct(v / yv - 1, 1, true), null, `Year-on-year: ${ml(m)} against ${ml(addM(m, -12))} (${cr(yv)})`]] : []),
        ...(d ? [['stoppage ratio', pct(stop, 1), stop > 1 ? 'dn' : null, 'SIPs discontinued or matured ÷ new SIPs registered in the month']] : []),
      ], sv, {
        periods: ps, foot: `${ml(m)} · ${SIP_FOOT}`,
        rows: (j) => { const p = ps[j], x = sv[j], px = at(addM(p, -1)), yx = at(addM(p, -12)); return [['SIP inflows (all channels)', cr(x)], ...(fin(px) ? [['MoM', pct(x / px - 1, 1, true)]] : []), ...(fin(yx) ? [['YoY', pct(x / yx - 1, 1, true)]] : [])]; },
      });
    } else if (S) {
      const ms3 = o.sip.months, sv = ms3.map((p) => o.sip.m[p].total);
      card('SIP inflows', cr(S.total), [...(Sp ? [[ms(addM(sl, -1)), cr(Sp.total), null, `SIP inflows in ${ml(addM(sl, -1))}`], ['MoM', pct(S.total / Sp.total - 1, 1, true), null, `Month-on-month: ${ml(sl)} against ${ml(addM(sl, -1))}`]] : []), ['new SIPs', lakh(S.acc.reg)], ['stoppage ratio', pct(S.acc.reg ? (S.acc.mat + S.acc.term) / S.acc.reg : null, 1)]], ms3.length >= 3 ? sv : null, {
        periods: ms3, foot: `${ml(sl)} · SEBI, whole industry (all channels)`, rows: (j) => [['SIP inflows (all channels)', cr(sv[j])]],
      });
    } else card('SIP inflows', '—', [], null, { foot: 'Waiting for AMFI’s SIP data' });
    { // 4) assets: a month-end figure
      const v = last(g.aum, 25), ps = P(25);
      card('Assets under management', cr(g.aum[i]), [...(pP ? [['MoM', pct(g.aum[i] / g.aum[i - 1] - 1, 1, true), null, MOM]] : []), ...(yoy(g.aum) != null ? [['YoY', pct(yoy(g.aum), 1, true), null, YOY]] : [])], v, {
        periods: ps, per: 'Month-end', title: (p) => `${ml(p)} · month-end`, foot: 'Month-end net assets',
        rows: (j) => [['Assets under management', cr(v[j])], ...(fin(chg(v, j)) ? [['MoM', pct(chg(v, j), 1, true)]] : [])],
      });
    }
    { // 5) folios: a month-end count
      const v = last(g.folios, 25), ps = P(25);
      card('Investor folios', crore(g.folios[i]), [...(pP ? [[`added in ${ms(o.latest)}`, lakh(g.folios[i] - g.folios[i - 1], 1, true), null, `Net folios added in ${ml(o.latest)}`]] : []), ...(yoy(g.folios) != null ? [['YoY', pct(yoy(g.folios), 1, true), null, YOY]] : [])], v, {
        periods: ps, per: 'Month-end', title: (p) => `${ml(p)} · month-end`, foot: 'Accounts, not unique investors',
        rows: (j) => [['Folios', crore(v[j])], ...(j > 0 && fin(v[j - 1]) ? [['Added in the month', lakh(v[j] - v[j - 1], 1, true)]] : [])],
      });
    }
    { // 6) foreign investors (NSDL), with the month in progress when NSDL is ahead of AMFI
      const F = o.fpi, fi = F.months.indexOf(o.latest), fEq = fi >= 0 ? F.equity[fi] : null, pmF = F.partial && F.partial > o.latest ? F.partial : null, pi = pmF ? F.months.indexOf(pmF) : -1;
      const L = ms(o.latest), part = (p) => p === F.partial, eqAt = (p) => { const j = o.months.indexOf(p); return j >= 0 ? eq[j] : null; };
      const fpiCard = (val, chips, end, foot) => {
        const a = Math.max(0, end - 12), v = end >= 0 ? F.equity.slice(a, end + 1) : null, ps = end >= 0 ? F.months.slice(a, end + 1) : [];
        card('Foreign investors, Indian equities', val, chips, v, {
          bars: true, color: 'var(--c-em)', periods: ps, toDate: part(ps[ps.length - 1]), foot,
          title: (p) => (part(p) ? `${ml(p)} · month to date${F.upTo ? ` (data to ${F.upTo})` : ''}` : tMonth(p)),
          rows: (j) => { const e = eqAt(ps[j]); return [['FPIs, net investment in equity (NSDL)', cr(v[j], true)], ...(fin(e) ? [['Equity funds (active), net inflows (AMFI)', cr(e, true)]] : [])]; },
        });
      };
      const mfChip = [`MF equity inflows, ${L}`, cr(eq[i]), null, `Net inflows into active equity mutual funds in ${ml(o.latest)} (AMFI), for comparison`];
      if (pi >= 0) fpiCard(cr(F.equity[pi], true), [[`${L} (full month)`, cr(fEq, true), null, `NSDL’s figure for the whole of ${ml(o.latest)}`], mfChip], pi, `${ml(pmF)} to date, data to ${F.upTo || '—'} · NSDL`);
      else fpiCard(cr(fEq, true), [mfChip], fi, `${ml(o.latest)} · NSDL${F.upTo ? `; data to ${F.upTo}` : ''}`);
    }
    const ul = $('mf-changed'); ul.replaceChildren();
    for (const b of o.bullets || []) ul.append(el('li', null, b));
  }

  function sipNote(m) { // a month without SEBI's split: give AMFI's SIP total where it has one
    const A = O.sipAmfi, j = A ? A.months.indexOf(m) : -1, tot = j >= 0 ? `SIPs in ${ml(m)}: ${cr(A.amt[j])} in total (AMFI). ` : '';
    return tot + (m >= '2026-08' ? 'The split by category appears when SEBI publishes its table for this month (usually several weeks after AMFI).' : 'SEBI’s split of SIPs by category starts with August 2026.');
  }

  /* ---------- 2. where the money went (one month, by category) ---------- */
  function renderWhere() {
    const months = Object.keys(O.amfi).sort(), m = V.month, A = O.amfi[m], pm = addM(m, -1), P = O.amfi[pm] || null, S = O.sip.m[m] || null;
    const ctl = $('mf-where-ctl'); ctl.replaceChildren();
    const st = el('div', 'seg'); st.setAttribute('aria-label', 'Month');
    const k = months.indexOf(m);
    const bPrev = el('button', null, '‹'), bLab = el('button', 'on', ml(m)), bNext = el('button', null, '›');
    bPrev.type = bLab.type = bNext.type = 'button'; bPrev.setAttribute('aria-label', 'Previous month'); bNext.setAttribute('aria-label', 'Next month');
    bPrev.disabled = k <= 0; bNext.disabled = k >= months.length - 1;
    bPrev.onclick = () => { V.month = months[k - 1]; renderWhere(); }; bNext.onclick = () => { V.month = months[k + 1]; renderWhere(); };
    st.append(bPrev, bLab, bNext); ctl.append(st);
    chipChoice(ctl, ['all', 'equity', 'hybrid', 'passive', 'debt', 'other'].map((g) => [g, GROUP_LABEL[g]]), V.cls, (g) => { V.cls = g; renderWhere(); });
    const recat = A.fmt === 'v2026' && P && P.fmt !== 'v2026';
    $('mf-where-note').textContent = [
      `${ml(m)}, AMFI monthly report. Amounts in ₹ crore.`,
      S ? 'SIP split from SEBI’s table for the same month.' : sipNote(m),
      recat ? 'SEBI’s new categories start this month, so categories that were split or renamed have no previous-month comparison.' : '',
    ].filter(Boolean).join(' ');
    // rows
    const rows = Object.entries(A.r).filter(([key]) => CAT[key]).map(([key, r]) => {
      const p = P?.r?.[key] || null, sip = S?.cats?.[key]?.[0] ?? null;
      return { k: key, name: CAT[key].name, cls: CAT[key].cls, ord: CAT[key].ord, schemes: r[0], folios: r[1], gross: r[2], red: r[3], net: r[4], aum: r[5], prev: p ? p[4] : null, d: p && fin(r[4]) && fin(p[4]) ? r[4] - p[4] : null, isNew: !!P && !p, sip, oth: fin(sip) && fin(r[2]) ? r[2] - sip : null, flowPct: fin(r[4]) && r[5] > 0 ? r[4] / r[5] : null };
    });
    const cols = [
      { k: 'net', label: 'Net inflow', title: 'Money in minus money out during the month' },
      { k: 'bar', label: '', bar: true },
      { k: 'd', label: P ? `vs ${ms(pm)}` : 'vs previous', title: 'Change in net inflow from the previous month' },
      { k: 'gross', label: 'Money in', title: 'Funds mobilised: purchases, SIP instalments, switch-ins and new fund offers' },
      ...(S ? [{ k: 'sip', label: 'of which SIP', title: 'SIP instalments, from SEBI’s table for the same month' }, { k: 'oth', label: 'Lumpsum & other', title: 'Money in minus SIP: lumpsum purchases, switch-ins, transfer plans and new fund offers' }] : []),
      { k: 'red', label: 'Money out', title: 'Redemptions and repurchases, including switch-outs' },
      { k: 'aum', label: 'Assets', title: 'Net assets under management at month-end' },
      { k: 'flowPct', label: 'Net ÷ assets', title: 'Net inflow as a share of month-end assets' },
      { k: 'folios', label: 'Folios', title: 'Investor accounts at month-end (one investor can hold many folios)' },
    ];
    const vis = rows.filter((r) => inGroup(r.cls, V.cls) && (r.aum || r.gross || r.red || r.net));
    const maxBy = {}; for (const r of vis) maxBy[r.cls] = Math.max(maxBy[r.cls] || 0, Math.abs(r.net || 0)); // bars compare categories within a fund type
    const t = $('tbl-mf-where'); t.replaceChildren();
    const thead = el('thead'), hr = el('tr');
    hr.append(thh('Category', 'left'));
    for (const c of cols) {
      const h = thh(c.label, c.bar ? 'sbcol' : null, c.title);
      if (!c.bar) { if (V.sortK === c.k) h.setAttribute('aria-sort', V.sortDir < 0 ? 'descending' : 'ascending'); h.onclick = () => { V.sortDir = V.sortK === c.k ? -V.sortDir : -1; V.sortK = c.k; renderWhere(); }; }
      hr.append(h);
    }
    thead.append(hr); t.append(thead);
    const tb = el('tbody');
    const cell = (r, c) => {
      if (c.bar) { const b = el('span', 'sbar'); if (fin(r.net)) { const i = el('i', r.net >= 0 ? 'pos' : 'neg'), w = Math.min(50, (Math.abs(r.net) / (maxBy[r.cls] || 1)) * 50); i.style.left = r.net >= 0 ? '50%' : `${50 - w}%`; i.style.width = `${w}%`; b.append(i); } return td(b, 'sbcol'); }
      if (c.k === 'd') { if (r.isNew) { const x = td('new', 'muted'); x.title = 'New category from August 2026 (SEBI re-categorisation): no comparable previous month'; return x; } return td(delta(r.d, (v) => num(v, true))); }
      if (c.k === 'flowPct') return td(pct(r.flowPct, 1, true));
      if (c.k === 'net') return td(num(r.net, true), 'strong');
      return td(num(r[c.k]));
    };
    const sortVal = (r) => { const v = r[V.sortK]; return fin(v) ? v : V.sortDir < 0 ? -Infinity : Infinity; };
    for (const cls of CLASS_ORDER) {
      if (!inGroup(cls, V.cls)) continue;
      const rs = vis.filter((r) => r.cls === cls); if (!rs.length) continue;
      const tot = { name: CLS[cls] || cls, cls, net: sum(rs.map((r) => r.net)), gross: sum(rs.map((r) => r.gross)), red: sum(rs.map((r) => r.red)), aum: sum(rs.map((r) => r.aum)), folios: sum(rs.map((r) => r.folios)) };
      const pRows = P ? Object.entries(P.r).filter(([key]) => CAT[key]?.cls === cls) : [];
      tot.prev = P ? sum(pRows.map(([, v]) => v[4])) : null; tot.d = P ? tot.net - tot.prev : null;
      if (S) { tot.sip = sum(rs.map((r) => r.sip)); tot.oth = tot.gross - tot.sip; }
      tot.flowPct = tot.aum > 0 ? tot.net / tot.aum : null;
      const tr = el('tr', 'cls'); const c0 = td(sub(sw(CLS_C[cls]), null)); c0.append(document.createTextNode(tot.name)); tr.append(c0);
      for (const c of cols) tr.append(c.bar ? td('', 'sbcol') : cell(tot, c));
      tb.append(tr);
      for (const r of rs.slice().sort((a, b) => V.sortDir * (sortVal(a) - sortVal(b)) || a.ord - b.ord)) {
        const rr = el('tr'); rr.append(td(r.name, 'cat'));
        for (const c of cols) rr.append(cell(r, c));
        tb.append(rr);
      }
    }
    if (V.cls === 'all' && A.g?.length) {
      const g = A.g, gp = P?.g;
      const tot = { net: g[4], gross: g[2], red: g[3], aum: g[5], folios: g[1], d: gp ? g[4] - gp[4] : null, flowPct: g[5] > 0 ? g[4] / g[5] : null };
      if (S) { tot.sip = S.mcr; tot.oth = fin(S.mcr) ? g[2] - S.mcr : null; }
      const tr = el('tr', 'tot'); tr.append(td('All funds (AMFI grand total)'));
      for (const c of cols) tr.append(c.bar ? td('', 'sbcol') : cell(tot, c));
      tb.append(tr);
      if (A.fof) { const f = el('tr', 'fofrow'); const c0 = td('Fund of funds (domestic), not in the totals above'); c0.title = 'AMFI reports these separately: they invest in other mutual fund schemes, so adding them would count the same money twice.'; f.append(c0); for (const c of cols) f.append(c.bar ? td('', 'sbcol') : c.k === 'net' ? td(num(A.fof[4], true)) : c.k === 'gross' ? td(num(A.fof[2])) : c.k === 'red' ? td(num(A.fof[3])) : c.k === 'aum' ? td(num(A.fof[5])) : c.k === 'folios' ? td(num(A.fof[1])) : c.k === 'sip' && S ? td(num(S.fof)) : td('')); tb.append(f); }
    }
    t.append(tb);
  }

  /* ---------- 3. flow map (categories × months) ---------- */
  function renderMap() {
    const ctl = $('mf-map-ctl'); ctl.replaceChildren();
    chipChoice(ctl, ['long', 'equity', 'debt', 'all'].map((g) => [g, GROUP_LABEL[g]]), V.heat, (g) => { V.heat = g; renderMap(); });
    choice(ctl, [[13, '13 months'], [25, '25 months']], V.heatN, (n) => { V.heatN = n; renderMap(); });
    const n = Math.min(V.heatN, O.months.length), off = O.months.length - n, months = O.months.slice(off);
    const t = $('tbl-mf-map'); t.replaceChildren();
    const thead = el('thead'), hr = el('tr'); hr.append(thh('Net inflow, ₹ thousand crore', 'left'));
    for (const m of months) hr.append(thh(mAx(m), 'hm', ml(m)));
    hr.append(thh(`${n} months`, null, 'Total net inflow over the period shown, ₹ crore'));
    thead.append(hr); t.append(thead);
    const tb = el('tbody');
    const row = (name, src, cls, kind) => {
      const vals = months.map((m, j) => src.net[off + j]);
      if (!vals.some(fin)) return;
      const max = d3.max(vals, (v) => Math.abs(v || 0)) || 1;
      const tr = el('tr', kind); const c0 = td(kind === 'cls' ? sub(sw(CLS_C[cls]), null) : name, kind === 'cls' ? null : 'cat'); if (kind === 'cls') c0.append(document.createTextNode(name)); tr.append(c0);
      vals.forEach((v, j) => {
        const c = el('td', 'hc');
        if (fin(v)) {
          const a = Math.round(6 + 58 * Math.min(1, Math.abs(v) / max));
          c.style.background = `color-mix(in srgb, ${v >= 0 ? 'var(--good)' : 'var(--bad)'} ${a}%, var(--panel))`;
          c.textContent = Math.abs(v) < 50 ? '0' : `${sgn(v)}${IN(Math.abs(v) / 1e3, 1)}`;
          const m = months[j], i = off + j;
          c.onpointermove = (ev) => showTip(ev, `${name} · ${ml(m)}`, [['Net inflow', cr(v)], ['Money in', cr(src.gross[i])], ['Money out', cr(src.red[i])], ['Assets', cr(src.aum[i])]]);
          c.onpointerleave = hideTip;
        } else c.textContent = '';
        tr.append(c);
      });
      tr.append(td(num(sum(vals), true), 'strong'));
      tb.append(tr);
    };
    for (const cls of CLASS_ORDER) {
      if (!inGroup(cls, V.heat)) continue;
      const tks = TKS.filter((x) => x.cls === cls);
      row(CLS[cls] || cls, O.trend.cls[cls], cls, 'cls');
      if (tks.length > 1 || tks[0]?.name !== CLS[cls]) for (const x of tks) row(x.name, O.trend.tk[x.tk], cls, '');
    }
    t.append(tb);
  }

  /* ---------- 4. SIPs: totals and accounts (AMFI's SIP page), split by category (SEBI) ---------- */
  function renderSip() {
    const box = $('mf-sip'); box.replaceChildren();
    const A = O.sipAmfi, L = O.sip.latest;
    if (!A && !L) return empty(box, 'SIP data has not been loaded yet. AMFI publishes SIP totals with its monthly data; SEBI’s split by category follows several weeks later.');
    if (A) sipAmfiBlock(box, A);
    if (L) sipSebiBlock(box, L, !!A);
    else box.append(el('p', 'muted small', 'SEBI’s split of SIPs by category has not been loaded yet.'));
  }
  function sipAmfiBlock(box, A) {
    const m = A.latest, at = (p) => { const j = A.months.indexOf(p); return j >= 0 ? A.amt[j] : null; };
    const v = at(m), pm = addM(m, -1), pv = at(pm), ym = addM(m, -12), yv = at(ym);
    const ok = (p) => (A.det[p] && !A.det[p].unchecked ? A.det[p] : null), d = ok(m), dp = ok(pm);
    const stop = d && d.newReg ? d.disc / d.newReg : null, stopP = dp && dp.newReg ? dp.disc / dp.newReg : null;
    const chg = d ? (dp ? d.outstanding - dp.outstanding : d.newReg - d.disc) : null;
    let t = `${ml(m)}: ${cr(v)} came in through SIPs`;
    if (fin(pv)) t += `, ${pct(Math.abs(v / pv - 1), 1)} ${v >= pv ? 'more' : 'less'} than in ${mOnly(pm)} (${cr(pv)})`;
    if (fin(yv)) t += ` and ${pct(Math.abs(v / yv - 1), 1)} ${v >= yv ? 'more' : 'less'} than a year earlier (${cr(yv)})`;
    t += '.';
    if (d) t += ` ${lk(d.newReg)} new SIPs were registered and ${lk(d.disc)} were discontinued or matured, a stoppage ratio of ${pct(stop, 1)}${stop > 1 ? ' (more SIPs ended than started)' : ''}, so SIP accounts ${chg >= 0 ? 'rose' : 'fell'} by ${lk(Math.abs(chg))} to ${lk(d.outstanding)}.`;
    lead(box, t);
    box.append(el('p', 'muted small mf-scope', 'Whole industry: AMFI’s SIP figures add up every fund house and every channel (direct, through distributors, and through the BSE and NSE mutual fund platforms). They are not split by exchange.'));
    box.append(chipsRow([
      ['SIP inflows', cr(v), fin(pv) ? `${ms(pm)}: ${cr(pv)}` : ''],
      ['Year-on-year', fin(yv) ? pct(v / yv - 1, 1, true) : '—', fin(yv) ? `${ms(ym)}: ${cr(yv)}` : ''],
      ...(d ? [
        ['New SIPs registered', lk(d.newReg), dp ? `${ms(pm)}: ${lk(dp.newReg)}` : ''],
        ['Discontinued or matured', lk(d.disc), dp ? `${ms(pm)}: ${lk(dp.disc)}` : ''],
        ['Stoppage ratio', pct(stop, 1), dp ? `${ms(pm)}: ${pct(stopP, 1)}` : 'ended ÷ new', stop > 1 ? 'n-1' : ''],
        ['SIP accounts at month-end', lk(d.outstanding), `${lk(chg, 2, true)} in the month`],
        ['Accounts that paid in', lk(d.contributing), dp ? `${ms(pm)}: ${lk(dp.contributing)}` : 'instalment received'],
        ['SIP assets', cr(d.aum), dp ? `${ms(pm)}: ${cr(dp.aum)}` : ''],
      ] : []),
    ]));
    if (A.det[m]?.unchecked) { const w = el('p', 'muted small mf-warn'); w.append(el('span', 'badge warn', 'Held back'), document.createTextNode(` AMFI’s table of SIP accounts for ${ml(m)} did not pass its checks (year-to-date totals or month-to-month roll-forward), so account numbers are not shown. The SIP total is confirmed twice on AMFI’s page.`)); box.append(w); }
    const grid = el('div', 'grid2 mf-sipgrid'); box.append(grid);
    const left = el('div'), right = el('div'); grid.append(left, right);
    // SIP inflows by month, since April 2016
    left.append(el('h3', 'mf-h3', 'SIP inflows by month'));
    const span = V.sipSpan || '25', ctl = el('div', 'mf-ctl'); left.append(ctl);
    choice(ctl, [['25', '2 years'], ['61', '5 years'], ['all', `Since ${MON[+A.months[0].slice(5) - 1]} ${A.months[0].slice(0, 4)}`]], span, (x) => { V.sipSpan = x; renderSip(); });
    const n = span === 'all' ? A.months.length : Math.min(A.months.length, +span);
    const c1 = el('div', 'chart'); left.append(c1);
    barsByMonth(c1, A.months.slice(-n), [{ name: 'SIP inflows', color: 'var(--c-n500)', vals: A.amt.slice(-n) }], { label: 'SIP inflows by month, ₹ crore', height: 210 });
    const fy0 = +m.slice(5) >= 4 ? `${m.slice(0, 4)}-04` : `${+m.slice(0, 4) - 1}-04`, ytd = [], ytdP = [];
    for (let p = fy0; p <= m; p = addM(p, 1)) { ytd.push(at(p)); ytdP.push(at(addM(p, -12))); }
    const fyLab = (y) => `${y}-${String((+y + 1) % 100).padStart(2, '0')}`, y0 = fy0.slice(0, 4), lastFy = A.fyTotal?.[String(+y0 - 1)];
    if (ytd.every(fin)) left.append(el('p', 'muted small', `Financial year ${fyLab(y0)} to ${mOnly(m)}: ${cr(sum(ytd))}${ytdP.every(fin) ? `, ${pct(sum(ytd) / sum(ytdP) - 1, 1, true)} on the same months of ${fyLab(+y0 - 1)} (${cr(sum(ytdP))})` : ''}.${fin(lastFy) ? ` Full year ${fyLab(+y0 - 1)}: ${cr(lastFy)}.` : ''}`));
    // New SIPs against SIPs that ended
    right.append(el('h3', 'mf-h3', 'New SIPs against SIPs that ended'));
    const dm = A.detMonths.filter((x) => ok(x));
    right.append(legend([['New SIPs', 'var(--good)', 'sq'], ['Discontinued or matured', 'var(--bad)', 'sq']]));
    const c2 = el('div', 'chart'); right.append(c2);
    barsByMonth(c2, dm, [{ name: 'New SIPs', color: 'var(--good)', vals: dm.map((x) => A.det[x].newReg * 1e5) }, { name: 'Discontinued or matured', color: 'var(--bad)', vals: dm.map((x) => A.det[x].disc * 1e5) }], { tip: (x) => lakh(x, 2), yfmt: axisLakh, unit: 'SIP accounts', label: 'New and ended SIPs by month', height: 180 });
    // Month by month table
    const tw = el('div', 'scroll'), tbl = el('table', 'tbl mf-siptbl'), th = el('thead'), hr = el('tr');
    [['Month', 'left'], ['SIP inflows', null, '₹ crore'], ['New SIPs', null, 'lakh'], ['Ended', null, 'Discontinued or matured, lakh'], ['Stoppage ratio', null, 'Ended ÷ new'], ['Accounts', null, 'SIP accounts at month-end, lakh'], ['Paid in', null, 'Accounts that paid an instalment, lakh'], ['SIP assets', null, '₹ crore']].forEach(([h, c, ti]) => hr.append(thh(h, c, ti)));
    th.append(hr); tbl.append(th);
    const tb = el('tbody');
    for (const x of dm.slice().reverse()) { const r = A.det[x], tr = el('tr'); tr.append(td(ml(x), 'left'), td(num(r.amount)), td(IN(r.newReg, 2)), td(IN(r.disc, 2)), td(pct(r.newReg ? r.disc / r.newReg : null, 1), r.disc > r.newReg ? 'neg' : null), td(IN(r.outstanding, 2)), td(IN(r.contributing, 2)), td(num(r.aum))); tb.append(tr); }
    tbl.append(tb); tw.append(tbl);
    box.append(el('h3', 'mf-h3', `Month by month, financial year ${fyLab(y0)}`), tw);
    const cross = (A.cross || []).filter((c) => c.ok).map((c) => mOnly(c.m)), bad = (A.cross || []).filter((c) => !c.ok);
    const nOk = A.checks.filter((c) => c.ok).length;
    box.append(el('p', 'muted small', `Source: AMFI’s SIP page, amfiindia.com/mutual-fund. Checked before use: ${nOk} of ${A.checks.length} checks passed (the month’s total agrees across the page, every financial-year total equals the sum of its months${A.accOk ? ', account numbers roll forward month to month and add up to the year-to-date row' : ''})${cross.length ? `; ${cross.join(' and ')} also agree with SEBI’s table on SIP amount, new SIPs, ended SIPs and accounts at month-end` : ''}${bad.length ? `; ${bad.map((c) => mOnly(c.m)).join(', ')} differ from SEBI (see Sources)` : ''}. “Discontinued or matured” is AMFI’s count of SIPs that completed their tenure plus those treated as cancelled under SEBI rules after consecutive failed instalments.`));
  }
  function sipSebiBlock(box, L, compact) {
    const S = O.sip.m[L], pmS = addM(L, -1), P = O.sip.m[pmS] || null, a = S.acc;
    const stop = a.reg ? (a.mat + a.term) / a.reg : null, stopP = P?.acc?.reg ? (P.acc.mat + P.acc.term) / P.acc.reg : null;
    if (compact) {
      const A = O.sipAmfi, cx = (A?.cross || []).find((c) => c.m === L);
      box.append(el('h3', 'mf-h3 mf-sep', `SIPs by category: ${ml(L)} (SEBI)`));
      box.append(el('p', 'muted small', [A && A.latest > L ? `SEBI has not yet published its table for ${ml(addM(L, 1))}; it usually comes several weeks after AMFI’s data, so this split is for ${ml(L)}.` : '', `SEBI splits the ${lakh(a.mat + a.term)} SIPs that ended into ${lakh(a.mat)} that matured and ${lakh(a.term)} stopped early (${pct(a.reg ? a.term / a.reg : null, 1)} of new registrations).`, cx?.ok ? 'Its totals agree with AMFI’s for the month.' : ''].filter(Boolean).join(' ')));
    } else {
      lead(box, `${ml(L)}: ${cr(S.total)} came in through SIPs${P ? ` (${cr(P.total)} in ${mOnly(pmS)})` : ''}. ${lakh(a.reg)} new SIPs were registered while ${lakh(a.mat + a.term)} matured or were stopped, a stoppage ratio of ${pct(stop, 1)}.`);
      box.append(chipsRow([
        ['SIP inflows', cr(S.total), P ? `${ms(pmS)}: ${cr(P.total)}` : 'incl. domestic fund of funds'],
        ['New SIPs registered', lakh(a.reg), P ? `${ms(pmS)}: ${lakh(P.acc.reg)}` : ''],
        ['Matured', lakh(a.mat), 'reached their end date'],
        ['Stopped early', lakh(a.term), 'cancelled before maturity'],
        ['Stoppage ratio', pct(stop, 1), P ? `${ms(pmS)}: ${pct(stopP, 1)}` : 'matured + stopped ÷ new', stop > 1 ? 'n-1' : ''],
        ['Active SIPs at month-end', crore(a.close), fin(a.open) ? `${lakh(a.close - a.open, 1, true)} in the month` : ''],
      ]));
    }
    if (!S.accOk) { const w = el('p', 'muted small mf-warn'); w.append(el('span', 'badge warn', 'Check'), document.createTextNode(` SEBI’s category figures for SIP accounts in ${ml(L)} don’t add up to its own total; the account numbers are shown as SEBI published them. SIP amounts do reconcile.`)); box.append(w); }
    const grid = el('div', 'grid2 mf-sipgrid'); box.append(grid);
    const left = el('div'), right = el('div'); grid.append(left, right);
    left.append(el('h3', 'mf-h3', `SIP inflows by category, ${ml(L)}`));
    const cats = Object.entries(S.cats).filter(([k, v]) => CAT[k] && v[0] > 0).map(([k, v]) => ({ k, name: CAT[k].name, cls: CAT[k].cls, color: CLS_C[CAT[k].cls], v: v[0], p: P?.cats?.[k]?.[0] ?? null, extra: [['New SIPs', lakh(v[2], 2)], ['Stopped early', lakh(v[4], 2)]] })).sort((x, y) => y.v - x.v);
    left.append(legend([[ml(L), 'var(--c-n500)', 'sq'], ...(P ? [[ml(pmS), 'var(--fg)', 'tick']] : [])]));
    const hb = el('div', 'chart'); left.append(hb);
    hbars(hb, V.sipAll ? cats : cats.slice(0, 12), { prevName: ms(pmS), curName: ms(L) });
    if (cats.length > 12) { const b = el('button', 'btn ghost small', V.sipAll ? 'Show top 12' : `Show all ${cats.length} categories`); b.type = 'button'; b.onclick = () => { V.sipAll = !V.sipAll; renderSip(); }; left.append(b); }
    right.append(el('h3', 'mf-h3', 'How much of the money in came through SIPs'));
    const Am = O.amfi[L];
    if (!Am) { right.append(el('p', 'muted small', `AMFI’s ${ml(L)} report is needed for this comparison.`)); return; }
    const t = el('table', 'tbl'), th = el('thead'), hr = el('tr');
    [['Fund type', 'left'], ['Money in'], ['of which SIP'], ['SIP share'], ['New SIPs'], ['Stopped early']].forEach(([h, c]) => hr.append(thh(h, c)));
    th.append(hr); t.append(th);
    const tb = el('tbody');
    for (const cls of CLASS_ORDER) {
      const ks = Object.keys(Am.r).filter((k) => CAT[k]?.cls === cls); if (!ks.length) continue;
      const gross = sum(ks.map((k) => Am.r[k][2])), sip = sum(ks.map((k) => S.cats[k]?.[0])), reg = sum(ks.map((k) => S.cats[k]?.[2])), term = sum(ks.map((k) => S.cats[k]?.[4]));
      if (!(sip > 0)) continue;
      const tr = el('tr'); const c0 = td(sub(sw(CLS_C[cls]), null)); c0.append(document.createTextNode(CLS[cls])); tr.append(c0);
      tr.append(td(num(gross)), td(num(sip)), td(pct(gross > 0 ? sip / gross : null, 1), 'strong'), td(lakh(reg, 1)), td(lakh(term, 1)));
      tb.append(tr);
    }
    t.append(tb);
    const sc = el('div', 'scroll'); sc.append(t); right.append(sc);
    right.append(el('p', 'muted small', 'Money in (AMFI) includes lumpsum purchases, switch-ins and new fund offers, so the rest is not all fresh lumpsum money. Debt funds’ inflows are mostly short-term money from companies and institutions.'));
  }

  /* ---------- 5. risk appetite ---------- */
  function renderMood() {
    const box = $('mf-mood'); box.replaceChildren();
    const T = O.trend, den = T.cls.equity.gross, n = Math.min(25, O.months.length), off = O.months.length - n, months = O.months.slice(off);
    const share = (tks) => months.map((m, j) => { const i = off + j, d = den[i]; if (!fin(d) || d <= 0) return null; return tks.reduce((a, tk) => a + (T.tk[tk]?.gross[i] ?? 0), 0) / d; });
    const S = [
      { name: 'Small & mid caps', color: 'var(--c-small)', vals: share(['smallcap', 'midcap']) },
      { name: 'Sectoral & thematic', color: 'var(--c-em)', vals: share(['secthem']) },
      { name: 'Large caps', color: 'var(--c-n500)', vals: share(['largecap']) },
      { name: 'Flexi & multi caps', color: 'var(--c-mid)', vals: share(['flexicap', 'multicap']) },
    ];
    const sm = S[0].vals, j = sm.length - 1;
    lead(box, `In ${ml(O.latest)}, small and mid-cap funds took ${pct(sm[j], 0)} of the money going into active equity funds${j >= 12 ? ` (${pct(sm[j - 12], 0)} a year earlier)` : ''}, and sectoral and thematic funds ${pct(S[1].vals[j], 0)}.`);
    box.append(legend(S.map((s) => [s.name, s.color])));
    const c = el('div', 'chart'); box.append(c);
    linesByMonth(c, months, S, { label: 'Share of active equity inflows by category' });
    box.append(el('p', 'muted small', 'Share of money in (funds mobilised) across active equity categories. A rising share for small, mid and thematic funds means investors are reaching for risk.'));
  }

  /* ---------- 6. new money vs market moves ---------- */
  function renderGains() {
    const box = $('mf-gains'); box.replaceChildren();
    const ctl = el('div', 'toolbar'); box.append(ctl);
    choice(ctl, [['total', 'All funds'], ['equity', 'Equity funds (active)']], V.gains, (v) => { V.gains = v; renderGains(); });
    const src = V.gains === 'equity' ? O.trend.cls.equity : O.trend.total, N = O.months.length;
    const idx = Array.from({ length: Math.min(13, N - 1) }, (_, k) => N - Math.min(13, N - 1) + k);
    const months = idx.map((i) => O.months[i]), flows = idx.map((i) => src.net[i]), dA = idx.map((i) => (fin(src.aum[i]) && fin(src.aum[i - 1]) ? src.aum[i] - src.aum[i - 1] : null)), mkt = dA.map((d, j) => (fin(d) && fin(flows[j]) ? d - flows[j] : null));
    const j = months.length - 1;
    if (j >= 0) lead(box, `${V.gains === 'equity' ? 'Active equity funds’ assets' : 'Assets'} ${dA[j] >= 0 ? 'rose' : 'fell'} by ${cr(Math.abs(dA[j]))} in ${ml(months[j])}: ${cr(flows[j], true)} of net new money and ${cr(mkt[j], true)} from market moves and other changes. Over ${months.length} months, new money added ${cr(sum(flows))} and markets ${cr(sum(mkt), true)}.`);
    box.append(legend([['Net new money', 'var(--c-n500)', 'sq'], ['Market moves & other', 'var(--c-agg)', 'sq'], ['Change in assets', 'var(--fg)', 'tick']]));
    const c = el('div', 'chart'); box.append(c);
    barsByMonth(c, months, [{ name: 'Net new money', color: 'var(--c-n500)', vals: flows }, { name: 'Market moves & other', color: 'var(--c-agg)', vals: mkt }], { stack: true, total: dA, totalName: 'Change in assets', label: 'Change in assets split into net inflows and market moves' });
    box.append(el('p', 'muted small', 'Market moves & other = change in month-end assets minus net inflows. Besides price moves it includes dividends paid out and, for one fund type, schemes moving between categories.'));
  }

  /* ---------- 7. redemption pressure ---------- */
  function renderRed() {
    const box = $('mf-red'); box.replaceChildren();
    const T = O.trend, n = Math.min(25, O.months.length - 1), off = O.months.length - n, months = O.months.slice(off);
    if (months.length < 2) return empty(box, 'Needs a few months of AMFI data; earlier months are still being loaded.');
    const rate = (s) => months.map((m, j) => { const i = off + j; return fin(s.red[i]) && s.aum[i - 1] > 0 ? s.red[i] / s.aum[i - 1] : null; });
    const S = [{ name: 'Equity funds (active)', color: 'var(--c-n500)', vals: rate(T.cls.equity) }, { name: 'Hybrid funds', color: 'var(--c-mid)', vals: rate(T.cls.hybrid) }];
    const e = S[0].vals, j = e.length - 1, avg = sum(e.slice(-13, -1)) / Math.max(1, e.slice(-13, -1).filter(fin).length);
    lead(box, `Active equity funds paid out ${pct(e[j], 1)} of their assets in redemptions in ${ml(months[j])}, against a ${pct(avg, 1)} monthly average over the previous year.`);
    box.append(legend(S.map((s) => [s.name, s.color])));
    const c = el('div', 'chart'); box.append(c);
    linesByMonth(c, months, S, { label: 'Monthly redemptions as a share of assets', zero: false, yfmt: (v) => pct(v, 1), tip: (v) => pct(v, 2) });
    box.append(el('p', 'muted small', 'Money out in the month (redemptions, switch-outs) ÷ assets at the end of the previous month.'));
  }

  /* ---------- 8. new investors (folios) ---------- */
  function renderFolios() {
    const box = $('mf-folios'); box.replaceChildren();
    const T = O.trend, n = Math.min(24, O.months.length - 1), off = O.months.length - n, months = O.months.slice(off);
    if (months.length < 2) return empty(box, 'Needs a few months of AMFI data; earlier months are still being loaded.');
    const grp = [['Equity (active)', ['equity'], 'var(--c-n500)'], ['Index funds & ETFs', ['passive'], 'var(--c-small)'], ['Hybrid', ['hybrid'], 'var(--c-mid)'], ['Debt', ['debt'], 'var(--c-n50)'], ['Other', ['solution', 'fofovs', 'closed', 'interval'], 'var(--c-agg)']];
    const S = grp.map(([name, cl, color]) => ({ name, color, vals: months.map((m, j) => { const i = off + j; const a = sum(cl.map((c) => T.cls[c]?.folios[i])), b = sum(cl.map((c) => T.cls[c]?.folios[i - 1])); return a && b ? a - b : null; }) }));
    const tot = months.map((m, j) => T.total.folios[off + j] - T.total.folios[off + j - 1]), j = months.length - 1;
    lead(box, `Folios rose by ${lakh(tot[j])} in ${ml(months[j])} to ${crore(T.total.folios[off + j])}; ${lakh(S[0].vals[j])} of the increase was in active equity funds. Average over the last 12 months: ${lakh(sum(tot.slice(-12)) / Math.min(12, tot.length))} a month.`);
    box.append(legend(S.map((s) => [s.name, s.color, 'sq'])));
    const c = el('div', 'chart'); box.append(c);
    barsByMonth(c, months, S, { stack: true, tip: (v) => lakh(v, 2, true), yfmt: axisLakh, unit: 'Folios added, lakh', total: tot, totalName: 'All funds', label: 'Monthly change in folios by fund type' });
    box.append(el('p', 'muted small', 'A folio is an account with one fund house; one investor can hold several, so this counts accounts, not people. A scheme moving to another category shows up as a rise in one fund type and a fall in another; the total is unaffected.'));
    const A = O.amfi[O.latest], P = O.amfi[addM(O.latest, -1)];
    if (A && P) {
      const moved = Object.keys(A.r).filter((k) => CAT[k] && P.r[k]).map((k) => ({ k, a: A.r[k][1], p: P.r[k][1], net: A.r[k][4], aum: Math.max(A.r[k][5] || 0, P.r[k][5] || 0) }))
        .filter((x) => Math.abs(x.a - x.p) >= 5e5 && Math.abs(x.a - x.p) >= 0.5 * Math.max(x.p, 1) && Math.abs(x.net || 0) <= 0.03 * x.aum);
      if (moved.length) box.append(el('p', 'small mf-note', `${ml(O.latest)}: ${moved.map((x) => `${CAT[x.k].name} folios ${x.a > x.p ? 'rose' : 'fell'} from ${lakh(x.p)} to ${lakh(x.a)}`).join('; ')}, with little money moving, which points to schemes changing category rather than investors joining or leaving.`));
    }
  }

  /* ---------- 9. how people buy (direct plans) ---------- */
  function renderDirect() {
    const box = $('mf-direct'); box.replaceChildren();
    const B = O.bif;
    if (!B?.months?.length) return empty(box, 'AMFI’s direct-plan data has not been loaded yet.');
    const months = B.months, j = months.length - 1, m = months[j], ti = O.months.indexOf(m), ind = ti >= 0 ? O.trend.total.aaum[ti] : null;
    const share = ind > 0 ? B.total[j] / ind : null;
    lead(box, `${cr(B.total[j])} sat in direct plans on average in ${ml(m)}${share ? `, ${pct(share, 0)} of the industry’s average assets` : ''}. Investors placing money themselves held ${pct(B.diy[j] / B.total[j], 0)} of it, registered investment advisers ${pct(B.ria[j] / B.total[j], 0)} and portfolio managers ${pct(B.pms[j] / B.total[j], 0)}.`);
    const S = [{ name: 'Investors themselves', color: 'var(--c-n500)', vals: B.diy }, { name: 'Registered investment advisers', color: 'var(--c-mid)', vals: B.ria }, { name: 'Portfolio managers (PMS)', color: 'var(--c-em)', vals: B.pms }];
    box.append(legend(S.map((s) => [s.name, s.color, 'sq'])));
    const c = el('div', 'chart'); box.append(c);
    barsByMonth(c, months, S, { stack: true, unit: '₹ crore, monthly average assets', label: 'Direct-plan assets by channel' });
    box.append(el('p', 'muted small', 'Direct plans have no distributor commission. AMFI splits their assets by who placed the money; regular plans, bought through distributors, are the rest of the industry.'));
  }

  /* ---------- 10. mutual funds vs foreign investors ---------- */
  function renderFpi() {
    const box = $('mf-fpi'); box.replaceChildren();
    const F = O.fpi, eq = O.trend.cls.equity.net;
    const months = O.months.filter((m) => F.months.includes(m)).slice(-13);
    if (months.length < 2) return empty(box, F.months.length ? 'Needs at least two months of AMFI data to set against NSDL’s figures; earlier AMFI reports are still being loaded.' : 'NSDL’s foreign investor data has not been loaded yet.');
    const mf = months.map((m) => eq[O.months.indexOf(m)]), fp = months.map((m) => F.equity[F.months.indexOf(m)]);
    const k = Math.min(12, months.length);
    lead(box, `Over the ${k} months to ${ml(months[months.length - 1])}, active equity funds took in ${cr(sum(mf.slice(-k)))} while foreign portfolio investors were net ${sum(fp.slice(-k)) >= 0 ? 'buyers' : 'sellers'} of ${cr(Math.abs(sum(fp.slice(-k))))} of Indian equities.`);
    box.append(legend([['Equity funds (active), net inflows · AMFI', 'var(--c-n500)', 'sq'], ['Foreign portfolio investors, equities · NSDL', 'var(--c-em)', 'sq']]));
    const c = el('div', 'chart'); box.append(c);
    barsByMonth(c, months, [{ name: 'Equity funds, net inflows', color: 'var(--c-n500)', vals: mf }, { name: 'FPIs, net investment', color: 'var(--c-em)', vals: fp }], { label: 'Equity fund inflows against foreign investor flows' });
    const tc = O.trade.current, pm = F.partial, items = [];
    if (pm) items.push([`Foreign investors, ${mOnly(pm)} so far`, cr(F.equity[F.months.indexOf(pm)], true), F.upTo ? `NSDL, to ${F.upTo}` : 'NSDL']);
    if (tc?.total) items.push([`Funds’ net share purchases, ${mOnly(tc.month)} so far`, cr(tc.total.eqNet, true), `SEBI, to ${dayL(tc.asOf)}${tc.ok ? '' : ' · check failed'}`], ['Funds’ gross share buying / selling', `${cr(tc.total.eqBuy)} / ${cr(tc.total.eqSell)}`, `${tc.days.length} trading days`]);
    if (items.length) { box.append(el('h3', 'mf-h3', 'This month so far')); box.append(chipsRow(items)); }
    if (tc?.days?.length >= 2) { const d = el('div', 'chart mf-mini'); box.append(d); dayBars(d, tc.days); }
    box.append(el('p', 'muted small', 'Fund inflows (AMFI) are money investors put into equity funds; funds’ share purchases (SEBI, from custodians) are what the funds then bought or sold on the market, so the two differ.'));
  }
  function dayBars(node, days) {
    requestAnimationFrame(() => {
      const { svg, g, iw, ih } = svgBox(node, 110, { t: 16, r: 6, b: 18, l: 44 });
      svg.attr('aria-label', 'Mutual funds’ daily net purchases of shares this month');
      const x = d3.scaleBand().domain(days.map((d) => d[0])).range([0, iw]).padding(0.25), ext = d3.max(days, (d) => Math.abs(d[1])) || 1, y = d3.scaleLinear().domain([-ext, ext]).range([ih, 0]).nice();
      g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(3).tickFormat(axisCr));
      g.append('g').attr('class', 'axis').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).tickValues(days.map((d) => d[0]).filter((d, i, a) => i === 0 || i === a.length - 1)).tickFormat((d) => dayL(d).slice(0, -5)).tickSizeOuter(0));
      svg.append('text').attr('x', 2).attr('y', 11).attr('font-size', 10.5).attr('fill', 'var(--muted)').text('Funds’ net share purchases by day, ₹ crore');
      g.selectAll('rect.b').data(days).join('rect').attr('class', 'b').attr('x', (d) => x(d[0])).attr('width', x.bandwidth()).attr('y', (d) => y(Math.max(0, d[1]))).attr('height', (d) => Math.max(0.6, Math.abs(y(d[1]) - y(0)))).attr('fill', (d) => (d[1] >= 0 ? 'var(--good)' : 'var(--bad)'))
        .on('pointermove', (ev, d) => showTip(ev, tDay(d[0]), [['Net purchases', cr(d[1], true)]])).on('pointerleave', hideTip);
      g.append('line').attr('x1', 0).attr('x2', iw).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--ref)');
    });
  }

  /* ---------- 11. fund houses ---------- */
  function renderAmc() {
    const box = $('mf-amc'); box.replaceChildren();
    const Lg = O.league;
    if (!Lg) return empty(box, 'AMFI’s fund-house data has not been loaded yet.');
    const top5 = Lg.rows.slice(0, 5).reduce((a, r) => a + r.share, 0), top10 = Lg.rows.slice(0, 10).reduce((a, r) => a + r.share, 0);
    lead(box, `${Lg.period}: ${Lg.rows.length} fund houses managed ${cr(Lg.total)} on average${fin(Lg.prevTotal) ? ` (${pct(Lg.total / Lg.prevTotal - 1, 1, true)} on ${Lg.prevPeriod})` : ''}. The top five held ${pct(top5, 0)} and the top ten ${pct(top10, 0)}.`);
    const t = el('table', 'tbl'), th = el('thead'), hr = el('tr');
    [['#', 'left'], ['Fund house', 'left'], ['Average assets', null, '₹ crore, quarterly average, excluding domestic fund of funds'], ['Share', null, 'Share of all fund houses’ average assets'], ['vs previous quarter', null, Lg.prevPeriod || ''], ['Rank change'], ...(Lg.eqFrom ? [['Share of active equity', null, `Share of all active equity fund assets, ${Lg.eqFrom}`]] : [])].forEach(([h, c, ti]) => hr.append(thh(h, c, ti)));
    th.append(hr); t.append(th);
    const tb = el('tbody');
    for (const r of V.amcAll ? Lg.rows : Lg.rows.slice(0, 15)) {
      const tr = el('tr');
      const rc = fin(r.prevRank) ? r.prevRank - r.rank : null;
      tr.append(td(String(r.rank), 'left muted'), td(r.name.replace(/ Mutual Fund$/i, ''), 'left'), td(num(r.aaum)), td(pct(r.share, 1), 'strong'), td(delta(fin(r.prev) && r.prev > 0 ? r.aaum / r.prev - 1 : null, (v) => pct(v, 1, true))), td(fin(rc) ? (rc === 0 ? '–' : delta(rc, (v) => `${v > 0 ? '▲' : '▼'} ${Math.abs(v)}`)) : 'new'));
      if (Lg.eqFrom) tr.append(td(pct(r.eqShare, 1)));
      tb.append(tr);
    }
    t.append(tb);
    const sc = el('div', 'scroll'); sc.append(t); box.append(sc);
    if (Lg.rows.length > 15) { const b = el('button', 'btn ghost small', V.amcAll ? 'Show top 15' : `Show all ${Lg.rows.length}`); b.type = 'button'; b.onclick = () => { V.amcAll = !V.amcAll; renderAmc(); }; box.append(b); }
    const chk = [];
    if (Lg.check) chk.push(`Check: the fund houses add up to ${cr(Lg.total)}, against ${cr(Lg.check.fromMonthly)} from AMFI’s three monthly reports for the quarter (${pct(Lg.check.diff, 2, true)}).`);
    if (Lg.cwCheck) chk.push(`AMFI’s category-wise data matches ${Lg.cwCheck.matched} of ${Lg.cwCheck.of} fund-house totals.`);
    if (chk.length) box.append(el('p', 'muted small', chk.join(' ')));
  }

  /* ---------- 12. new fund offers ---------- */
  function renderNfo() {
    const box = $('mf-nfo'); box.replaceChildren();
    const months = Object.keys(O.amfi).sort().filter((m) => O.amfi[m].nfo);
    const L = O.amfi[O.latest]?.nfo;
    if (L) lead(box, `${L.n} new schemes raised ${cr(L.amt)} in ${ml(O.latest)}${L.list?.[0] ? `; the largest was ${L.list[0].name} (${cr(L.list[0].amt)})` : ''}.`);
    const grid = el('div', 'grid2'); box.append(grid);
    const left = el('div'), right = el('div'); grid.append(left, right);
    if (months.length >= 2) {
      left.append(el('h3', 'mf-h3', 'Money raised by new schemes'));
      const c = el('div', 'chart'); left.append(c);
      barsByMonth(c, months, [{ name: 'Raised', color: 'var(--c-small)', vals: months.map((m) => O.amfi[m].nfo.amt) }], { height: 180, label: 'Money raised by new fund offers each month' });
      const cnt = el('p', 'muted small'); cnt.textContent = 'Schemes launched: ' + months.slice(-6).map((m) => `${ms(m)}: ${O.amfi[m].nfo.n}`).join(' · '); left.append(cnt);
    }
    if (L?.list?.length) {
      left.append(el('h3', 'mf-h3', `New schemes in ${ml(O.latest)}`));
      const t = el('table', 'tbl mini-tbl'), th = el('thead'), hr = el('tr');
      [['Scheme', 'left'], ['Type', 'left'], ['Raised, ₹ cr']].forEach(([h, c]) => hr.append(thh(h, c))); th.append(hr); t.append(th);
      const tb = el('tbody');
      for (const x of V.nfoAll ? L.list : L.list.slice(0, 10)) { const tr = el('tr'); const nm = td(x.name, 'left wrap'); tr.append(nm, td(sub(NFO_CLS[x.cls] || x.cls, x.kind === 'close' && x.cls !== 'closed' ? 'close-ended' : null), 'left'), td(num(x.amt))); tb.append(tr); }
      t.append(tb); const sc = el('div', 'scroll'); sc.append(t); left.append(sc);
      if (L.list.length > 10) { const b = el('button', 'btn ghost small', V.nfoAll ? 'Show top 10' : `Show all ${L.list.length}`); b.type = 'button'; b.onclick = () => { V.nfoAll = !V.nfoAll; renderNfo(); }; left.append(b); }
    }
    right.append(el('h3', 'mf-h3', 'Open for subscription now'));
    const op = O.nfoOpen;
    if (!op?.list?.length) right.append(el('p', 'muted small', op ? 'AMFI lists no new fund offers open right now.' : 'AMFI’s list has not been loaded yet.'));
    else {
      const ul = el('ul', 'mf-open');
      for (const x of op.list) { const li = el('li'); li.append(el('b', null, x.name), el('span', 'muted small', x.amc)); ul.append(li); }
      right.append(ul, el('p', 'muted small', `As listed by AMFI, checked ${ago(op.at)}. A listing is not a recommendation.`));
    }
  }

  /* ---------- 13. sources and checks ---------- */
  const STATE = { live: ['up', 'Up to date'], 'last-good': ['warn', 'Showing last good copy'], failed: ['down', 'Not reachable'], pending: ['', 'Not loaded yet'] };
  function renderSrc() {
    const t = $('tbl-mf-src'); t.replaceChildren();
    const th = el('thead'), hr = el('tr');
    [['Source', 'left'], ['What it gives', 'left'], ['How often', 'left'], ['Latest', 'left'], ['Status', 'left'], ['Checks', 'left']].forEach(([h, c]) => hr.append(thh(h, c)));
    th.append(hr); t.append(th);
    const tb = el('tbody');
    for (const s of O.status || []) {
      const tr = el('tr', 'click'); tr.tabIndex = 0;
      const [cls, lab] = STATE[s.state] || ['', s.state];
      const ck = s.checks || [], nOk = ck.filter((c) => c.ok).length;
      const st = el('span', 'pill-s ' + cls, lab); if (s.error) st.title = s.error;
      tr.append(td(sub(s.name, s.note || null), 'left wrap'), td(s.what, 'left wrap'), td(s.freq, 'left wrap'), td(s.latest || '—', 'left'), td(st, 'left'), td(ck.length ? el('span', 'pill-s ' + (s.checksOk ? 'up' : 'warn'), `${nOk} of ${ck.length} passed`) : '—', 'left'));
      const open = V.open.has(s.id);
      if (open) tr.classList.add('open');
      const toggle = () => { V.open.has(s.id) ? V.open.delete(s.id) : V.open.add(s.id); renderSrc(); };
      tr.onclick = toggle; tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
      tb.append(tr);
      if (open) {
        const d = el('tr', 'drill'), c = el('td'); c.colSpan = 6;
        const ul = el('ul', 'mf-checks');
        for (const x of ck) { const li = el('li', x.ok ? 'ok' : x.info ? 'info' : 'bad'); li.append(el('i', null, x.ok ? '✓' : x.info ? 'i' : '✗'), el('span', null, x.detail || x.id)); ul.append(li); }
        if (!ck.length) ul.append(el('li', 'info', 'No arithmetic checks apply to this source.'));
        c.append(ul);
        if (s.slips?.length) c.append(el('p', 'muted small', 'SEBI’s own table has internal mismatches (shown for transparency; SIP amounts are used only when they reconcile): ' + s.slips.slice(0, 3).join(' · ')));
        if (s.at) c.append(el('p', 'muted small', `Last checked ${ago(s.at)}${s.okAt && s.okAt !== s.at ? `; last good copy ${ago(s.okAt)}` : ''}.${s.error ? ' Error: ' + s.error : ''}`));
        d.append(c); tb.append(d);
      }
    }
    t.append(tb);
    const nx = O.next || {}, p = $('mf-next'); p.replaceChildren();
    const lines = [];
    if (nx.amfi) lines.push(`Next AMFI report (${ml(nx.amfi.period)}): ${nx.amfi.window}. The site checks AMFI every hour in its release window${window.GMM_STATIC ? '' : ' and sends an alert when it lands (if Telegram or email alerts are set up)'}.`);
    if (nx.sipAmfi) lines.push(`Next AMFI SIP figures (${ml(nx.sipAmfi.period)}): ${nx.sipAmfi.window}, ${nx.sipAmfi.note}.`);
    if (nx.sip) lines.push(`Next SEBI SIP split by category (${ml(nx.sip.period)}): ${nx.sip.note}.`);
    if (nx.fundwise) lines.push(`Next fund-house data (${nx.fundwise.period}): after the quarter ends, in ${nx.fundwise.when}.`);
    for (const l of lines) p.append(el('span', null, l), el('br'));
  }

  /* ---------- orchestration ---------- */

  /* ---------- 14. FIIs and DIIs: day, month and year ---------- */
  // Three official series, never mixed in one figure: the exchanges' same-day FII/DII numbers (provisional), NSDL's
  // final FPI figures (by reporting date, a day after trading) and SEBI's mutual fund figures (by trading date).
  const dayShort = (d) => `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}`;
  const C_FII = 'var(--c-em)', C_DII = 'var(--c-n500)', C_MF = 'var(--c-mid)';
  function renderInst() {
    const I = O.inst, box = $('mf-inst'), ctl = $('mf-inst-ctl');
    box.replaceChildren(); ctl.replaceChildren();
    if (!I) return empty(box, 'Institutional flows have not been loaded yet.');
    // X is null on the public site, which leaves out the exchanges' figures (NSE's data policy).
    const X = I.exch, L = X?.latest, F = I.fpiDays, M = I.mfDays;
    const lf = F[F.length - 1], lm = M[M.length - 1];
    // 1) Latest figures from each source
    const parts = [];
    if (L) parts.push(`${dayL(L.d)}, NSE, BSE and MSEI combined (provisional, published by ${(L.src || ['nse']).map((x) => x.toUpperCase()).join(' and ')}): FIIs were net ${L.fii.net >= 0 ? 'buyers' : 'sellers'} of ${cr(Math.abs(L.fii.net))} and DIIs net ${L.dii.net >= 0 ? 'buyers' : 'sellers'} of ${cr(Math.abs(L.dii.net))} in the cash market.`);
    else if (X) parts.push('The exchanges’ FII/DII figures are recorded every trading evening, starting with the first run after deployment.');
    if (lf) parts.push(`NSDL’s final figure for foreign portfolio investors, reported ${dayL(lf[0])}: ${cr(lf[1], true)} in equity.`);
    lead(box, parts.join(' '));
    const mo = (rows, m, col) => sum(rows.filter((r) => r[0].startsWith(m)).map((r) => r[col]));
    const curM = (lf || lm || [''])[0].slice(0, 7);
    box.append(chipsRow([
      ...(L ? [['FII/FPI net · NSE+BSE+MSEI', cr(L.fii.net, true), `${dayL(L.d)} · buy ${cr(L.fii.buy)}, sell ${cr(L.fii.sell)}`, L.fii.net < 0 ? 'n-1' : 'n1'], ['DII net · NSE+BSE+MSEI', cr(L.dii.net, true), `${dayL(L.d)} · buy ${cr(L.dii.buy)}, sell ${cr(L.dii.sell)}`, L.dii.net < 0 ? 'n-1' : 'n1']] : []),
      ...(lf ? [['FPI equity · NSDL', cr(lf[1], true), `reported ${dayL(lf[0])} · exchanges ${cr(lf[4], true)}, primary market ${cr(lf[5], true)}`, lf[1] < 0 ? 'n-1' : 'n1']] : []),
      ...(lm ? [['Mutual funds’ equity · SEBI', cr(lm[3], true), `traded ${dayL(lm[0])}`, lm[3] < 0 ? 'n-1' : 'n1']] : []),
      ...(curM && lf ? [[`${MONTHS[+curM.slice(5) - 1]} so far`, `FPI ${cr(mo(F, curM, 1), true)}`, `NSDL to ${dayL(lf[0])}${lm && lm[0].startsWith(curM) ? `; mutual funds ${cr(mo(M, curM, 3), true)} to ${dayL(lm[0])} (SEBI)` : ''}`]] : []),
    ]));
    // 2) View controls
    choice(ctl, [['day', 'Day by day'], ['month', 'Month by month'], ['year', 'Year by year']], V.instView, (v) => { V.instView = v; V.instRows = false; renderInst(); }, 'seg');
    if (V.instView === 'day') {
      if (!X && V.instSeries === 'exch') V.instSeries = 'fpi';
      chipChoice(ctl, [...(X ? [['exch', 'FII & DII · NSE+BSE+MSEI']] : []), ['fpi', 'FPI · NSDL'], ['mf', 'Mutual funds · SEBI']], V.instSeries, (v) => { V.instSeries = v; renderInst(); });
      choice(ctl, [[22, '1 month'], [66, '3 months'], [260, '1 year']], V.instRange, (v) => { V.instRange = v; renderInst(); });
      instDays(box, I);
    } else if (V.instView === 'month') instMonths(box, I);
    else { choice(ctl, [['cy', 'Calendar year'], ['fy', 'Financial year']], V.instYear, (v) => { V.instYear = v; renderInst(); }); instYears(box, I); }
    box.append(el('p', 'muted small mf-note-plain', (X ? 'FII/DII (exchanges): provisional figures compiled each evening by NSE, BSE and MSEI from the client category marked on each order, cash market only; DIIs are banks, insurers, mutual funds, pension funds and other domestic institutions. The exchanges keep no archive, so this site records each day as it is published. ' : '') + 'FPI (NSDL): final figures reported by custodians a day after trading, including the primary market (IPOs, placements and other routes). Mutual funds (SEBI): purchases and sales of equity reported by custodians, by trading date; they are the largest part of DII.'));
  }
  function instTable(box, head, rows, cls = '') {
    const keep = head.map((_, j) => j === 0 || rows.some((r) => r[j][0] !== '—')); // a column with no figures at all is left out
    const t = el('table', 'tbl mf-insttbl ' + cls), th = el('thead'), hr = el('tr');
    head.forEach(([h, c, ti], j) => keep[j] && hr.append(thh(h, c, ti))); th.append(hr); t.append(th);
    const tb = el('tbody');
    for (const r of rows) { const tr = el('tr'); r.forEach(([v, c], j) => keep[j] && tr.append(td(v, c))); tb.append(tr); }
    t.append(tb); const sc = el('div', 'scroll'); sc.append(t); box.append(sc);
  }
  const sCls = (v) => (fin(v) && Math.abs(v) >= 0.5 ? (v < 0 ? 'neg' : 'pos') : null);
  const sv = (v) => [!fin(v) ? '—' : Math.abs(v) < 0.5 ? '₹0 cr' : cr(v, true), sCls(v)];
  function moreDays(box, total) { // day tables: 30 rows, or every day in the chosen range
    if (total <= 30) return;
    const b = el('button', 'btn ghost small', V.instRows ? 'Show the latest 30 days' : `Show all ${total} days in this range`); b.type = 'button'; b.onclick = () => { V.instRows = !V.instRows; renderInst(); }; box.append(b);
  }
  const rowsOf = (D) => D.slice().reverse().slice(0, V.instRows ? D.length : 30);
  function instDays(box, I) {
    const n = V.instRange, c = el('div', 'chart');
    if (V.instSeries === 'exch' && I.exch) {
      const D = I.exch.days.slice(-n);
      box.append(el('h3', 'mf-h3', 'FII/FPI and DII net buying, cash market: NSE, BSE and MSEI combined (provisional)'));
      if (D.length < 2) box.append(el('p', 'muted small', I.exch.since ? `Recording started on ${dayL(I.exch.since)}; the chart fills in as trading days are added.` : 'No days recorded yet.'));
      else { box.append(legend([['FII/FPI', C_FII, 'sq'], ['DII', C_DII, 'sq']]), c); barsByMonth(c, D.map((r) => r[0]), [{ name: 'FII/FPI', color: C_FII, vals: D.map((r) => r[1]) }, { name: 'DII', color: C_DII, vals: D.map((r) => r[2]) }], { label: 'FII and DII net buying by day', xfmt: dayShort, tipTitle: tDay, per: 'daily', height: 210 }); }
      instTable(box, [['Date', 'left'], ['FII/FPI buy'], ['FII/FPI sell'], ['FII/FPI net'], ['DII buy'], ['DII sell'], ['DII net'], ['Published by', null, 'Every figure is NSE, BSE and MSEI combined; this shows whose website the site read it from (when NSE and BSE both answered, their figures matched)']], rowsOf(D).map((r) => [[dayL(r[0]), 'left'], [num(r[3], false, 2)], [num(r[4], false, 2)], sv(r[1]), [num(r[5], false, 2)], [num(r[6], false, 2)], sv(r[2]), [r[7].toUpperCase().replace('+', ' & '), 'muted']]));
      moreDays(box, D.length);
      return;
    }
    if (V.instSeries === 'fpi') {
      const D = I.fpiDays.slice(-n);
      box.append(el('h3', 'mf-h3', 'Foreign portfolio investors: net investment in equity by reporting date (NSDL, final)'));
      box.append(legend([['Via stock exchanges', C_FII, 'sq'], ['Primary market & others', 'var(--c-small)', 'sq']]), c);
      barsByMonth(c, D.map((r) => r[0]), [{ name: 'Via stock exchanges', color: C_FII, vals: D.map((r) => r[4]) }, { name: 'Primary market & others', color: 'var(--c-small)', vals: D.map((r) => r[5]) }], { stack: true, total: D.map((r) => r[1]), totalName: 'Equity, net', label: 'FPI equity by reporting date', xfmt: dayShort, tipTitle: (d) => `${dayL(d)} · daily (reporting date)`, per: 'daily, by reporting date', height: 210 });
      instTable(box, [['Reporting date', 'left', 'NSDL reports each day’s trades the next day'], ['Equity buy'], ['Equity sell'], ['Equity net'], ['via exchanges'], ['primary market'], ['Debt net', null, 'General limit, VRR and FAR'], ['All assets net'], ['Equity, US$ m']], rowsOf(D).map((r) => [[dayL(r[0]), 'left'], [num(r[2], false, 2)], [num(r[3], false, 2)], sv(r[1]), sv(r[4]), sv(r[5]), sv(r[6]), sv(r[7]), [fin(r[8]) ? num(r[8], true, 2) : '—']]));
      moreDays(box, D.length);
      return;
    }
    const D = I.mfDays.slice(-n);
    box.append(el('h3', 'mf-h3', 'Mutual funds: net purchases of equity by trading date (SEBI)'));
    box.append(legend([['Equity, net', C_MF, 'sq']]), c);
    barsByMonth(c, D.map((r) => r[0]), [{ name: 'Mutual funds, equity net', color: C_MF, vals: D.map((r) => r[3]) }], { label: 'Mutual funds’ net equity purchases by day', xfmt: dayShort, tipTitle: tDay, per: 'daily', height: 210 });
    instTable(box, [['Trading date', 'left'], ['Equity buy'], ['Equity sell'], ['Equity net'], ['Debt net']], rowsOf(D).map((r) => [[dayL(r[0]), 'left'], [num(r[1], false, 2)], [num(r[2], false, 2)], sv(r[3]), sv(r[4])]));
    moreDays(box, D.length);
  }
  function instMonths(box, I) {
    const rows = I.months, cur = rows[rows.length - 1]?.[0], n = Math.min(25, rows.length), show = rows.slice(-n);
    const c = el('div', 'chart'), hasEx = show.some((r) => r[8] > 0);
    box.append(el('h3', 'mf-h3', 'Net buying of Indian equities by month'));
    box.append(legend([['FPI · NSDL', C_FII, 'sq'], ['Mutual funds · SEBI', C_MF, 'sq']]), c);
    barsByMonth(c, show.map((r) => r[0]), [{ name: 'FPI (NSDL)', color: C_FII, vals: show.map((r) => r[1]) }, { name: 'Mutual funds (SEBI)', color: C_MF, vals: show.map((r) => r[3]) }], { label: 'FPI and mutual fund net equity buying by month', tipTitle: (m) => (m === cur ? `${ml(m)} · month to date` : tMonth(m)) });
    const lbl = (r) => `${ml(r[0])}${r[0] === cur ? ' (to date)' : ''}`;
    const list = (V.instAll ? rows : show).slice().reverse();
    instTable(box, [['Month', 'left'], ['FPI equity · NSDL', null, 'NSDL’s monthly figure (final)'], ['Mutual funds’ equity · SEBI', null, 'SEBI’s monthly total'], ['FII/FPI · exchanges', null, 'Sum of the trading days the site recorded (provisional; NSE, BSE and MSEI combined)'], ['DII · exchanges', null, 'Sum of the trading days the site recorded (provisional; NSE, BSE and MSEI combined)']],
      list.map((r) => [[lbl(r), 'left'], sv(r[1]), r[3] != null ? [`${cr(r[3], true)}${r[4] ? '' : ` · ${r[5]} days so far`}`, sCls(r[3])] : ['—', 'muted'], r[8] ? [`${cr(r[6], true)} · ${r[8]} d`, sCls(r[6])] : ['—', 'muted'], r[8] ? [`${cr(r[7], true)} · ${r[8]} d`, sCls(r[7])] : ['—', 'muted']]));
    if (rows.length > n) { const b = el('button', 'btn ghost small', V.instAll ? `Show the last ${n} months` : `Show all ${rows.length} months (from ${ml(rows[0][0])})`); b.type = 'button'; b.onclick = () => { V.instAll = !V.instAll; renderInst(); }; box.append(b); }
    if (!hasEx && I.exch) box.append(el('p', 'muted small', 'FII/DII columns fill in from the day the site starts recording the exchanges’ figures; “d” is the number of trading days recorded in the month.'));
  }
  function instYears(box, I) {
    const fy = V.instYear === 'fy', rows = fy ? I.fyears.filter((r) => +r[0].slice(0, 4) >= 2016) : I.years;
    const c = el('div', 'chart'), name = (r) => (fy ? `FY ${r[0]}` : String(r[0]));
    box.append(el('h3', 'mf-h3', `Net buying of Indian equities by ${fy ? 'financial' : 'calendar'} year`));
    box.append(legend([['FPI · NSDL', C_FII, 'sq'], ['Mutual funds · SEBI', C_MF, 'sq']]), c);
    barsByMonth(c, rows.map((r) => String(r[0])), [{ name: 'FPI (NSDL)', color: C_FII, vals: rows.map((r) => r[1]) }, { name: 'Mutual funds (SEBI)', color: C_MF, vals: rows.map((r) => (r[4] >= (r === rows[rows.length - 1] ? 1 : 12) ? r[3] : null)) }], { label: 'FPI and mutual fund net equity buying by year', per: fy ? 'by financial year (Apr–Mar)' : 'by calendar year', xfmt: (v) => (fy ? v.slice(2) : v), tipTitle: (v) => { const now = v === String(rows[rows.length - 1][0]); return fy ? `FY ${v} · financial year (Apr–Mar)${now ? ', to date' : ''}` : `${v} · calendar year${now ? ' to date' : ''}`; } });
    const last = rows[rows.length - 1];
    instTable(box, [[fy ? 'Financial year' : 'Year', 'left'], ['FPI equity · NSDL', null, fy ? 'NSDL’s financial-year table' : 'NSDL’s calendar-year total'], ['Mutual funds’ equity · SEBI', null, 'Sum of SEBI’s monthly totals; SEBI’s archive is read a few months an hour, back to January 2016'], ['FII/FPI · exchanges', null, 'Sum of recorded trading days (provisional; NSE, BSE and MSEI combined)'], ['DII · exchanges', null, 'Sum of recorded trading days (provisional; NSE, BSE and MSEI combined)']],
      rows.slice().reverse().map((r) => [[`${name(r)}${r === last ? ' (to date)' : ''}`, 'left'], sv(r[1]), r[3] != null && (r[4] >= 12 || r === last) ? sv(r[3]) : [r[4] ? `${r[4]} of 12 months read` : 'being read', 'muted'], r[7] ? [`${cr(r[5], true)} · ${r[7]} d`, sCls(r[5])] : ['—', 'muted'], r[7] ? [`${cr(r[6], true)} · ${r[7]} d`, sCls(r[6])] : ['—', 'muted']]));
  }
  // While the tab is empty: what the site tried, source by source, and why anything failed.
  function diag(o) {
    let d = $('mf-diag');
    if (!d) { d = el('div', 'mf-diag'); d.id = 'mf-diag'; $('mf-asof').after(d); }
    d.replaceChildren();
    if (!o?.status?.length) { d.hidden = true; return; }
    d.hidden = false;
    d.append(el('p', 'muted small', `What the site has tried so far${o.run?.ms ? ` (last attempt took ${(o.run.ms / 1000).toFixed(1)} s)` : ''}:`));
    const ul = el('ul', 'mf-checks');
    for (const s of o.status) {
      const good = s.state === 'live', li = el('li', good ? 'ok' : s.error ? 'bad' : 'info');
      li.append(el('i', null, good ? '✓' : s.error ? '✗' : '…'), el('span', null, `${s.name}: ${good ? `read${s.latest ? ` (${s.latest})` : ''}` : s.error || 'not read yet'}${s.at ? ` · ${ago(s.at)}` : ''}`));
      ul.append(li);
    }
    d.append(ul);
  }
  const SECTIONS = [renderHead, renderWhere, renderMap, renderSip, renderMood, renderGains, renderRed, renderFolios, renderDirect, renderFpi, renderAmc, renderNfo, renderInst, renderSrc];
  function render() {
    const o = state.mf;
    const asof = $('mf-asof'), body = $('mf-body');
    if (!o) { asof.textContent = 'Loading mutual fund data…'; body.hidden = true; diag(null); return; }
    if (!o.ok || !o.latest) { asof.textContent = `Mutual fund data is not available yet${o.error ? ` (${o.error})` : ''}. The site keeps trying the official sources and fills this tab as soon as AMFI’s report is read and checked.`; body.hidden = true; diag(o); return; }
    body.hidden = false; diag(null);
    prep(o);
    for (const f of SECTIONS) { try { f(); } catch (e) { console.error('mutual funds:', f.name, e); } }
  }
  document.querySelectorAll('#tab-funds .subnav a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  return { renderTab: (t) => { if (t === 'funds') render(); } };
};
