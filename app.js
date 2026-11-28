/* PE Monitor — front end. Data: /api/live (NSE intraday), /api/history (5Y daily), /api/global (ETF PE + Siblis). */
(() => {
  'use strict';
  const IDS = ['n50', 'n500', 'mid', 'small', 'micro'];
  const COLOR = { n50: 'var(--c-n50)', n500: 'var(--c-n500)', mid: 'var(--c-mid)', small: 'var(--c-small)', micro: 'var(--c-micro)' };
  const GCOLOR = { Developed: 'var(--c-dev)', Emerging: 'var(--c-em)', Aggregate: 'var(--c-agg)' };
  const METRIC = {
    pe: { label: 'PE', fmt: (v) => v.toFixed(1) + 'x', get: (s, i) => s.pe[i] },
    pb: { label: 'P/B', fmt: (v) => v.toFixed(2) + 'x', get: (s, i) => s.pb[i] },
    dy: { label: 'Dividend yield', fmt: (v) => v.toFixed(2) + '%', get: (s, i) => s.dy[i] },
    ey: { label: 'Earnings yield', fmt: (v) => v.toFixed(2) + '%', get: (s, i) => (s.pe[i] ? 100 / s.pe[i] : null) },
  };
  const state = { live: null, hist: null, global: null, sel: 'small', compare: false, metric: 'pe', years: 5, bands: true, premYears: 5, group: 'all', gview: 'live', hidden: new Set(), sortI: null, sortG: null, lastLive: {} };

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const f1 = (v) => (v == null || !isFinite(v) ? '—' : (+v).toFixed(1));
  const f2 = (v) => (v == null || !isFinite(v) ? '—' : (+v).toFixed(2));
  const pctS = (v, d = 0) => (v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(d) + '%');
  const ord = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const short = (n) => (/^Nifty \d/.test(n) ? n : n.replace('Nifty ', ''));
  const parseD = d3.utcParse('%Y-%m-%d');
  const fmtD = d3.utcFormat('%d %b %Y');
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
  const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v.replace(/^var\((.*)\)$/, '$1')).trim() || v;
  const zone = (p) => (p == null ? 'neutral' : p >= 0.75 ? 'rich' : p <= 0.25 ? 'cheap' : 'neutral');
  const gapZone = (g) => (g == null ? 'neutral' : g > 0.05 ? 'rich' : g < -0.05 ? 'cheap' : 'neutral');

  // On the public site (GMM_STATIC set) there is no server: each /api/… answer is a data file published by the update
  // job; the minute-stamp makes every check fetch the newest copy.
  const STATIC = window.GMM_STATIC || null;
  async function getJSON(url) {
    if (STATIC) url = `${STATIC.data}${url.split('?')[0].replace(/^\/api\//, '')}.json?v=${Math.floor(Date.now() / 60e3)}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${url} → ${r.status}`);
    return r.json();
  }

  /* ---------- IST market clock ---------- */
  function istNow() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { wd: p.weekday, mins: (+p.hour % 24) * 60 + +p.minute };
  }
  const marketOpen = () => { const { wd, mins } = istNow(); return !['Sat', 'Sun'].includes(wd) && mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30; };

  /* ---------- statistics ---------- */
  // Series with the live point appended when it is newer than the last daily close.
  function series(id) {
    const s = state.hist?.series?.[id]; if (!s) return null;
    const pts = s.d.map((d, i) => ({ d, date: parseD(d), pe: s.pe[i], pb: s.pb[i], dy: s.dy[i], eps: s.eps?.[i] ?? null })).filter((p) => p.date);
    const lv = state.live?.ok ? state.live.indices?.[id] : null;
    const liveDate = state.live?.timestamp ? d3.timeParse('%d-%b-%Y %H:%M')(state.live.timestamp) : null;
    if (lv?.pe && liveDate) {
      const iso = d3.timeFormat('%Y-%m-%d')(liveDate);
      const last = pts.at(-1);
      const p = { d: iso, date: parseD(iso), pe: lv.pe, pb: lv.pb, dy: lv.dy, eps: lv.last && lv.pe ? lv.last / lv.pe : null, live: true };
      if (!last || iso > last.d) pts.push(p); else if (iso === last.d) pts[pts.length - 1] = { ...last, ...p };
    }
    return pts;
  }
  function windowed(pts, years) {
    if (!pts?.length) return [];
    if (!isFinite(years)) return pts;
    const end = pts.at(-1).date, cut = d3.utcYear.offset(end, -years);
    return pts.filter((p) => p.date >= cut);
  }
  function statsFor(id) {
    const pts = series(id); if (!pts?.length) return null;
    const cur = pts.at(-1);
    const out = { id, cur: cur.pe, curPB: cur.pb, curDY: cur.dy, curDate: cur.d, isLive: !!cur.live, first: pts[0], n: pts.length };
    for (const y of [1, 3, 5]) {
      const w = windowed(pts, y).map((p) => p.pe).filter((v) => v != null);
      out['med' + y] = d3.median(w); out['mean' + y] = d3.mean(w); out['sd' + y] = d3.deviation(w);
      out['pctl' + y] = w.length ? w.filter((v) => v < cur.pe).length / w.length : null;
    }
    const w5 = windowed(pts, 5).filter((p) => p.pe != null);
    const lo = d3.least(w5, (p) => p.pe), hi = d3.greatest(w5, (p) => p.pe);
    Object.assign(out, { min5: lo?.pe, minDate: lo?.d, max5: hi?.pe, maxDate: hi?.d, ago5: w5[0]?.pe, ago5Date: w5[0]?.d });
    out.z5 = out.sd5 ? (cur.pe - out.mean5) / out.sd5 : null;
    out.vsMed5 = out.med5 ? cur.pe / out.med5 - 1 : null;
    out.ye = [2021, 2022, 2023, 2024, 2025].map((y) => { const p = pts.filter((q) => q.d.startsWith(y + '-12')).at(-1); return p ? p.pe : null; });
    return out;
  }

  /* ---------- tooltip ---------- */
  const tip = $('#tip');
  function showTip(ev, title, rows) {
    tip.replaceChildren(el('div', 't', title));
    for (const [label, val, color] of rows) {
      const r = el('div', 'r'), l = el('span');
      if (color) { const i = el('i'); i.style.background = color; l.append(i); }
      l.append(label); r.append(l, el('b', null, val)); tip.append(r);
    }
    tip.style.opacity = 1;
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
  }
  const hideTip = () => { tip.style.opacity = 0; };

  /* ---------- status bar ---------- */
  function setStatus() {
    const pill = $('#status'), txt = $('#status-text');
    pill.className = 'pill';
    const live = state.live, open = marketOpen();
    if (live?.ok && live.stale) { pill.classList.add('warn'); txt.textContent = 'NSE feed down · last saved ' + live.timestamp; }
    else if (live?.ok) {
      if (open) { pill.classList.add('live'); txt.textContent = 'Live · NSE ' + live.timestamp.split(' ')[1] + ' IST'; }
      else { pill.classList.add('closed'); txt.textContent = 'Market closed · last ' + live.timestamp; }
    } else if (state.hist) { pill.classList.add('warn'); txt.textContent = 'NSE live unavailable · showing last close'; }
    else txt.textContent = 'Loading…';
    const anyStale = state.hist && Object.values(state.hist.series).some((s) => s.stale);
    if (anyStale) { pill.className = 'pill warn'; txt.textContent += ' · history from snapshot'; }
    $('#updated').textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const srcs = state.hist ? [...new Set(Object.values(state.hist.series).map((s) => s.source))].join(' · ') : '';
    $('#foot-src').textContent = srcs ? 'History source: ' + srcs + '.' : '';
  }

  /* ---------- insights ---------- */
  function renderInsights() {
    const box = $('#insights'); const S = IDS.map(statsFor).filter(Boolean);
    if (!S.length) return;
    const name = (id) => state.hist.series[id].name;
    const byP = S.slice().sort((a, b) => b.pctl5 - a.pctl5), rich = byP[0], cheap = byP.at(-1);
    const items = [];
    items.push({ cls: zone(rich.pctl5), k: 'Richest vs own history', html: [`${name(rich.id)} at `, ['b', f1(rich.cur) + 'x'], ` sits in the `, ['b', ord(Math.round(rich.pctl5 * 100)) + ' percentile'], ` of its 5-year range (${pctS(rich.vsMed5)} vs median).`] });
    items.push({ cls: zone(cheap.pctl5), k: 'Cheapest vs own history', html: [`${name(cheap.id)} at `, ['b', f1(cheap.cur) + 'x'], ` is in the `, ['b', ord(Math.round(cheap.pctl5 * 100)) + ' percentile'], `, ${pctS(cheap.vsMed5)} vs its 5-year median and ${pctS(cheap.cur / cheap.ago5 - 1)} vs 5 years ago.`] });
    const n5 = S.find((s) => s.id === 'n500'), sm = S.find((s) => s.id === 'small');
    if (n5 && sm) {
      const prem = premSeries('small', 5), now = prem.at(-1)?.v, avg = d3.mean(prem, (p) => p.v);
      items.push({ cls: gapZone(now - avg), k: 'Small-cap premium', html: [`Smallcap 250 trades at a `, ['b', pctS(now)], ` PE premium to Nifty 500, vs a 5-year average of ${pctS(avg)}.`] });
    }
    const g = state.global?.markets; const dm = g?.find((m) => m.market === 'Developed markets'), em = g?.find((m) => m.market === 'Emerging markets'), ind = g?.find((m) => m.market === 'India');
    if (dm?.livePE && em?.livePE) items.push({ cls: 'neutral', k: 'EM vs DM (live ETF PE)', html: [`Emerging markets at `, ['b', f1(em.livePE) + 'x'], ` vs developed at `, ['b', f1(dm.livePE) + 'x'], ` — a ${Math.round(Math.abs(em.livePE / dm.livePE - 1) * 100)}% discount. India (INDA) ${f1(ind?.livePE)}x.`] });
    box.replaceChildren(...items.map((it) => {
      const d = el('div', 'insight ' + it.cls); d.append(el('span', 'k', it.k));
      for (const part of it.html) d.append(Array.isArray(part) ? el(part[0], null, part[1]) : part);
      return d;
    }));
  }

  /* ---------- cards ---------- */
  function renderCards() {
    const box = $('#cards');
    const frag = IDS.map((id) => {
      const s = statsFor(id), meta = state.hist?.series?.[id]; if (!s || !meta) return null;
      const lv = state.live?.ok ? state.live.indices?.[id] : null;
      const b = el('button', 'card' + (!state.compare && state.sel === id ? ' on' : '')); b.type = 'button'; b.style.setProperty('--cc', COLOR[id]);
      b.setAttribute('aria-label', `${meta.name}: PE ${f2(s.cur)}, ${ord(Math.round(s.pctl5 * 100))} percentile of 5 years`);
      const top = el('div', 'top'), nm = el('div', 'name'); nm.append(el('i'), meta.name); top.append(nm, el('span', 'tier', meta.tier));
      const pe = el('div', 'pe'); pe.append(f2(s.cur), el('small', null, 'x PE'));
      const prev = state.lastLive[id]; if (prev != null && prev !== s.cur) pe.classList.add('flash'); state.lastLive[id] = s.cur;
      const r1 = el('div', 'row'), lvl = el('span'); lvl.append(lv ? `${d3.format(',.2f')(lv.last)} ` : 'Close ', el('b', lv ? (lv.changePct >= 0 ? 'up' : 'down') : null, lv ? pctS(lv.changePct / 100, 2) : fmtD(parseD(s.curDate))));
      const chip = el('span', 'chip ' + gapZone(s.vsMed5), pctS(s.vsMed5) + ' vs 5Y med'); r1.append(lvl, chip);
      const bar = el('div', 'pct'), dot = el('span'); dot.style.left = (s.pctl5 * 100).toFixed(1) + '%'; bar.append(dot);
      bar.title = `${ord(Math.round(s.pctl5 * 100))} percentile of the last 5 years`;
      const r2 = el('div', 'row'); r2.append(el('span', null, `5Y ${f1(s.min5)}–${f1(s.max5)}x`), el('b', null, ord(Math.round(s.pctl5 * 100)) + ' pctl'));
      const r3 = el('div', 'row'); r3.append(el('span', null, `P/B ${f2(s.curPB)} · Yield ${f2(s.curDY)}%`), el('span', null, `z ${s.z5 >= 0 ? '+' : ''}${f2(s.z5)}`));
      b.append(top, pe, r1, bar, r2, r3);
      b.onclick = () => { state.sel = id; state.compare = false; renderAllIndia(); };
      return b;
    }).filter(Boolean);
    box.replaceChildren(...frag);
  }

  /* ---------- segmented controls ---------- */
  function seg(sel, onPick) {
    const box = $(sel);
    box.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); onPick(b.dataset.v); });
  }
  function buildIndexSeg() {
    const box = $('#seg-index'); box.replaceChildren();
    for (const id of IDS) { const b = el('button', null, short(state.hist.series[id].name)); b.dataset.v = id; box.append(b); }
    const c = el('button', null, 'Compare all'); c.dataset.v = 'all'; box.append(c);
    syncIndexSeg();
  }
  function syncIndexSeg() { $('#seg-index').querySelectorAll('button').forEach((b) => b.classList.toggle('on', state.compare ? b.dataset.v === 'all' : b.dataset.v === state.sel)); }

  /* ---------- chart frame ---------- */
  function frame(node, height, margin) {
    const W = Math.max(280, node.clientWidth), H = height;
    let svg = d3.select(node).select('svg');
    if (svg.empty()) svg = d3.select(node).append('svg');
    svg.attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
    svg.selectAll('*').remove();
    return { svg, W, H, M: margin, iw: W - margin.l - margin.r, ih: H - margin.t - margin.b };
  }

  /* ---------- history chart ---------- */
  function renderHistory() {
    const node = $('#hist-chart'), m = METRIC[state.metric];
    const ids = state.compare ? IDS : [state.sel];
    const data = ids.map((id) => ({ id, name: state.hist.series[id].name, pts: windowed(series(id), state.years).map((p, i, a) => ({ ...p, v: state.metric === 'ey' ? (p.pe ? 100 / p.pe : null) : p[state.metric] })).filter((p) => p.v != null) })).filter((d) => d.pts.length);
    $('#hist-title').textContent = state.compare ? `${m.label} history — all tiers` : `${state.hist.series[state.sel].name} — ${m.label} history`;
    const leg = $('#hist-legend'); leg.replaceChildren();
    if (!data.length) { node.replaceChildren(el('div', 'empty', 'No data for this metric')); return; }
    const visible = data.filter((d) => !state.compare || !state.hidden.has(d.id));
    for (const d of data) {
      const b = el('button', 'li' + (state.compare && state.hidden.has(d.id) ? ' off' : '')); const i = el('i'); i.style.background = COLOR[d.id]; b.append(i, d.name);
      if (state.compare) b.onclick = () => { state.hidden.has(d.id) ? state.hidden.delete(d.id) : state.hidden.add(d.id); renderHistory(); };
      leg.append(b);
    }
    const one = !state.compare ? data[0] : null;
    let stats = null;
    if (one && state.bands) {
      const vals = one.pts.map((p) => p.v);
      stats = { med: d3.median(vals), mean: d3.mean(vals), sd: d3.deviation(vals) };
      const add = (txt, style) => { const s = el('span', 'li'); const i = el('i'); Object.assign(i.style, style); s.append(i, txt); leg.append(s); };
      add(`Median ${m.fmt(stats.med)}`, { background: cssVar('var(--ref)'), height: '2px' });
      add(`±1σ ${m.fmt(stats.mean - stats.sd)}–${m.fmt(stats.mean + stats.sd)}`, { background: cssVar('var(--band)'), height: '10px' });
    }
    const { svg, M, iw, ih } = frame(node, node.clientHeight || 380, { t: 10, r: 56, b: 28, l: 44 });
    const all = visible.flatMap((d) => d.pts);
    if (!all.length) { svg.append('text').attr('x', 20).attr('y', 30).attr('fill', 'currentColor').text('All series hidden — click a legend item'); return; }
    const x = d3.scaleUtc().domain(d3.extent(all, (p) => p.date)).range([0, iw]);
    let [lo, hi] = d3.extent(all, (p) => p.v);
    if (stats) { lo = Math.min(lo, stats.mean - stats.sd); hi = Math.max(hi, stats.mean + stats.sd); }
    // Near-zero earnings (e.g. mid/small caps in 2020 on standalone EPS) send PE into the hundreds; cap the scale so the rest stays readable.
    const sorted = all.map((p) => p.v).sort(d3.ascending), q99 = d3.quantile(sorted, 0.99);
    const capped = hi > q99 * 1.6 ? (hi = q99 * 1.2, true) : false;
    const pad = (hi - lo) * 0.08 || 1;
    const y = d3.scaleLinear().domain([lo - pad, hi + pad]).range([ih, 0]).nice();
    const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
    g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(6).tickSize(-iw).tickFormat('')).call((s) => s.select('.domain').remove());
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(iw / 110))).tickSizeOuter(0));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(6).tickFormat((v) => m.fmt(v).replace(/\.0+(x|%)$/, '$1')));
    if (stats) {
      g.append('rect').attr('x', 0).attr('width', iw).attr('y', y(stats.mean + stats.sd)).attr('height', Math.max(0, y(stats.mean - stats.sd) - y(stats.mean + stats.sd))).attr('fill', 'var(--band)');
      g.append('line').attr('x1', 0).attr('x2', iw).attr('y1', y(stats.med)).attr('y2', y(stats.med)).attr('stroke', 'var(--ref)').attr('stroke-dasharray', '4 4');
    }
    // NSE moved index PE from standalone to consolidated earnings on 31 Mar 2021; earlier PEs are not like-for-like.
    const basis = parseD('2021-03-31');
    if (x.domain()[0] < basis && x.domain()[1] > basis) {
      g.append('line').attr('x1', x(basis)).attr('x2', x(basis)).attr('y1', 0).attr('y2', ih).attr('stroke', 'var(--muted)').attr('stroke-dasharray', '2 3');
      g.append('text').attr('x', x(basis) + 5).attr('y', 12).attr('font-size', 10.5).attr('fill', 'var(--muted)').text('Consolidated earnings from Apr 2021');
    }
    const line = d3.line().x((p) => x(p.date)).y((p) => y(p.v)).defined((p) => p.v != null);
    const clipId = 'hclip-' + Math.random().toString(36).slice(2, 8);
    svg.append('defs').append('clipPath').attr('id', clipId).append('rect').attr('x', 0).attr('y', 0).attr('width', iw).attr('height', ih);
    const lines = g.append('g').attr('clip-path', `url(#${clipId})`);
    if (capped) g.append('text').attr('x', iw - 4).attr('y', 12).attr('text-anchor', 'end').attr('font-size', 10.5).attr('fill', 'var(--muted)').text(`Scale capped at ${m.fmt(y.domain()[1])}; spikes above are cut off`);
    for (const d of visible) {
      const path = lines.append('path').datum(d.pts).attr('fill', 'none').attr('stroke', COLOR[d.id]).attr('stroke-width', state.compare ? 1.6 : 2).attr('d', line);
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const L = path.node().getTotalLength(); path.attr('stroke-dasharray', `${L} ${L}`).attr('stroke-dashoffset', L).transition().duration(700).ease(d3.easeCubicOut).attr('stroke-dashoffset', 0).on('end', () => path.attr('stroke-dasharray', null));
      }
      const last = d.pts.at(-1);
      g.append('circle').attr('cx', x(last.date)).attr('cy', y(last.v)).attr('r', 4).attr('fill', COLOR[d.id]).attr('stroke', 'var(--panel)').attr('stroke-width', 2);
    }
    // End labels, nudged apart so they never overlap.
    const labs = visible.map((d) => ({ id: d.id, v: d.pts.at(-1).v, y: y(d.pts.at(-1).v) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 14) labs[i].y = labs[i - 1].y + 14;
    for (const l of labs) g.append('text').attr('x', iw + 8).attr('y', l.y).attr('dy', '0.35em').attr('fill', COLOR[l.id]).attr('font-size', 12).attr('font-weight', 600).text(m.fmt(l.v));
    // Crosshair + tooltip
    const cross = g.append('line').attr('y1', 0).attr('y2', ih).attr('stroke', 'var(--muted)').attr('stroke-width', 1).attr('opacity', 0);
    const dots = visible.map((d) => g.append('circle').attr('r', 4).attr('fill', COLOR[d.id]).attr('stroke', 'var(--panel)').attr('stroke-width', 2).attr('opacity', 0));
    const bis = d3.bisector((p) => p.date).center;
    g.append('rect').attr('width', iw).attr('height', ih).attr('fill', 'transparent')
      .on('pointermove', (ev) => {
        const dt = x.invert(d3.pointer(ev)[0]); cross.attr('x1', x(dt)).attr('x2', x(dt)).attr('opacity', 0.5);
        const rows = visible.map((d, k) => { const p = d.pts[bis(d.pts, dt)]; dots[k].attr('cx', x(p.date)).attr('cy', y(p.v)).attr('opacity', 1); return [short(d.name), m.fmt(p.v) + (p.live ? ' (live)' : ''), cssVar(COLOR[d.id])]; });
        if (stats) rows.push(['vs median', pctS(visible[0].pts[bis(visible[0].pts, dt)].v / stats.med - 1, 1), null]);
        showTip(ev, fmtD(dt), rows);
      })
      .on('pointerleave', () => { cross.attr('opacity', 0); dots.forEach((d) => d.attr('opacity', 0)); hideTip(); });
    svg.attr('role', 'img').attr('aria-label', `${m.label} over the last ${state.years} years for ${visible.map((d) => d.name).join(', ')}`);
    const src = state.hist.series[visible[0].id];
    const since = visible.map((d) => `${short(d.name)} from ${d3.utcFormat('%b %Y')(d.pts[0].date)}`).join(', ');
    $('#hist-note').textContent = `${src.source}. ${state.live?.ok ? 'Latest point is the live NSE value.' : 'Latest point is the last daily close.'}${!isFinite(state.years) ? ` Data since inception: ${since}. Before Apr 2021 NSE used standalone earnings, so older PEs (especially mid and small caps) run higher and are not directly comparable.` : ''}${capped ? ' Very high readings (when index earnings were close to zero) are cut off at the top of the chart; hover to see the actual value.' : ''}`;
  }

  /* ---------- range chart ---------- */
  function renderRange() {
    const node = $('#range-chart');
    const S = IDS.map(statsFor).filter(Boolean);
    const { svg, M, iw, ih } = frame(node, node.clientHeight || 260, { t: 18, r: 20, b: 26, l: 112 });
    const x = d3.scaleLinear().domain([Math.floor(d3.min(S, (s) => s.min5) / 5) * 5, Math.ceil(d3.max(S, (s) => Math.max(s.max5, s.cur)) / 5) * 5]).range([0, iw]);
    const y = d3.scaleBand().domain(S.map((s) => s.id)).range([0, ih]).padding(0.45);
    const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
    g.append('g').attr('class', 'grid').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(iw / 70))).tickSize(-ih).tickFormat('')).call((s) => s.select('.domain').remove());
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(iw / 70))).tickFormat((v) => v + 'x'));
    const row = g.selectAll('g.r').data(S).join('g').attr('class', 'r').attr('transform', (s) => `translate(0,${y(s.id)})`);
    const bw = y.bandwidth();
    row.append('text').attr('x', -10).attr('y', bw / 2).attr('dy', '0.35em').attr('text-anchor', 'end').attr('fill', 'currentColor').attr('font-size', 12).text((s) => short(state.hist.series[s.id].name));
    row.append('rect').attr('x', (s) => x(s.min5)).attr('width', (s) => Math.max(1, x(s.max5) - x(s.min5))).attr('height', bw).attr('rx', bw / 2).attr('fill', 'var(--range)');
    row.append('line').attr('x1', (s) => x(s.med5)).attr('x2', (s) => x(s.med5)).attr('y1', -4).attr('y2', bw + 4).attr('stroke', 'var(--ref)').attr('stroke-width', 2);
    row.append('circle').attr('cx', (s) => x(s.cur)).attr('cy', bw / 2).attr('r', 7).attr('fill', (s) => COLOR[s.id]).attr('stroke', 'var(--panel)').attr('stroke-width', 2);
    row.append('text').attr('x', (s) => x(s.cur)).attr('y', -6).attr('text-anchor', 'middle').attr('font-size', 11).attr('font-weight', 600).attr('fill', 'currentColor').text((s) => f1(s.cur) + 'x');
    row.append('rect').attr('x', -M.l).attr('width', iw + M.l).attr('y', -10).attr('height', bw + 20).attr('fill', 'transparent')
      .on('pointermove', (ev, s) => showTip(ev, state.hist.series[s.id].name, [['Live PE', f2(s.cur) + 'x'], ['5Y median', f1(s.med5) + 'x'], ['5Y low', `${f1(s.min5)}x · ${fmtD(parseD(s.minDate))}`], ['5Y high', `${f1(s.max5)}x · ${fmtD(parseD(s.maxDate))}`], ['Percentile', ord(Math.round(s.pctl5 * 100))]]))
      .on('pointerleave', hideTip)
      .on('click', (ev, s) => { state.sel = s.id; state.compare = false; renderAllIndia(); });
    svg.attr('role', 'img').attr('aria-label', 'Five-year PE range, median and live PE for each Nifty index');
  }

  /* ---------- premium chart ---------- */
  function premSeries(id, years) {
    const base = new Map(series('n500').map((p) => [p.d, p.pe]));
    return windowed(series(id), years).map((p) => ({ date: p.date, d: p.d, v: base.get(p.d) && p.pe ? p.pe / base.get(p.d) - 1 : null, live: p.live })).filter((p) => p.v != null);
  }
  function renderPremium() {
    const node = $('#prem-chart'), ids = ['mid', 'small', 'micro'];
    const data = ids.map((id) => ({ id, name: state.hist.series[id].name, pts: premSeries(id, state.premYears) })).filter((d) => d.pts.length);
    const leg = $('#prem-legend'); leg.replaceChildren(...data.map((d) => { const s = el('span', 'li'); const i = el('i'); i.style.background = COLOR[d.id]; s.append(i, `${short(d.name)} ${pctS(d.pts.at(-1).v)} (avg ${pctS(d3.mean(d.pts, (p) => p.v))})`); return s; }));
    const { svg, M, iw, ih } = frame(node, node.clientHeight || 236, { t: 8, r: 48, b: 26, l: 44 });
    const all = data.flatMap((d) => d.pts);
    const x = d3.scaleUtc().domain(d3.extent(all, (p) => p.date)).range([0, iw]);
    const y = d3.scaleLinear().domain(d3.extent([0, ...all.map((p) => p.v)])).range([ih, 0]).nice();
    const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
    g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat('')).call((s) => s.select('.domain').remove());
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(iw / 100))).tickSizeOuter(0));
    g.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('+.0%')));
    g.append('line').attr('x1', 0).attr('x2', iw).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--ref)').attr('stroke-width', 1);
    const line = d3.line().x((p) => x(p.date)).y((p) => y(p.v));
    for (const d of data) {
      g.append('path').datum(d.pts).attr('fill', 'none').attr('stroke', COLOR[d.id]).attr('stroke-width', 1.6).attr('d', line);
      g.append('text').attr('x', iw + 6).attr('y', y(d.pts.at(-1).v)).attr('dy', '0.35em').attr('font-size', 11).attr('font-weight', 600).attr('fill', COLOR[d.id]).text(pctS(d.pts.at(-1).v));
    }
    const cross = g.append('line').attr('y1', 0).attr('y2', ih).attr('stroke', 'var(--muted)').attr('opacity', 0);
    const bis = d3.bisector((p) => p.date).center;
    g.append('rect').attr('width', iw).attr('height', ih).attr('fill', 'transparent')
      .on('pointermove', (ev) => { const dt = x.invert(d3.pointer(ev)[0]); cross.attr('x1', x(dt)).attr('x2', x(dt)).attr('opacity', 0.5); showTip(ev, fmtD(dt), data.map((d) => [short(d.name), pctS(d.pts[bis(d.pts, dt)].v, 1), cssVar(COLOR[d.id])])); })
      .on('pointerleave', () => { cross.attr('opacity', 0); hideTip(); });
    svg.attr('role', 'img').attr('aria-label', 'PE premium of mid, small and micro caps to Nifty 500 over time');
  }

  /* ---------- sortable tables ---------- */
  function table(node, cols, rows, sortKey, setSort, groupBy) {
    const thead = el('thead'), tr = el('tr');
    cols.forEach((c, i) => {
      const th = el('th', null, c.h); th.title = c.t || 'Sort';
      if (sortKey?.i === i) th.setAttribute('aria-sort', sortKey.dir > 0 ? 'ascending' : 'descending');
      th.onclick = () => setSort({ i, dir: sortKey?.i === i ? -sortKey.dir : (c.num ? -1 : 1) });
      tr.append(th);
    });
    thead.append(tr);
    let list = rows.slice();
    if (sortKey) { const c = cols[sortKey.i]; list.sort((a, b) => { const va = c.v(a), vb = c.v(b); if (va == null) return 1; if (vb == null) return -1; return (va < vb ? -1 : va > vb ? 1 : 0) * sortKey.dir; }); }
    const tb = el('tbody'); let lastG = null;
    for (const r of list) {
      if (groupBy && !sortKey && r[groupBy] !== lastG) { lastG = r[groupBy]; const g = el('tr', 'grp'), td = el('td', null, lastG); td.colSpan = cols.length; g.append(td); tb.append(g); }
      const row = el('tr');
      for (const c of cols) { const td = el('td', c.cls?.(r) || ''); const out = c.f(r); if (out instanceof Node) td.append(out); else td.textContent = out; row.append(td); }
      tb.append(row);
    }
    node.replaceChildren(thead, tb);
  }
  const stack = (text, sub) => { const f = document.createDocumentFragment(); f.append(text); if (sub) f.append(el('span', 'sub', sub)); return f; };
  const swatch = (color, text, sub) => { const f = document.createDocumentFragment(); const s = el('span', 'sw'); s.style.background = color; f.append(s, text); if (sub) f.append(el('span', 'sub', sub)); return f; };

  const indiaCols = [
    { h: 'Index', v: (s) => s.name, f: (s) => swatch(COLOR[s.id], s.name, s.isLive ? 'live' : 'close ' + fmtD(parseD(s.curDate))) },
    { h: 'PE', num: 1, v: (s) => s.cur, f: (s) => f2(s.cur), cls: () => 'strong' },
    { h: 'Pctl 5Y', num: 1, t: 'Share of the last 5 years with a lower PE', v: (s) => s.pctl5, f: (s) => ord(Math.round(s.pctl5 * 100)), cls: (s) => zone(s.pctl5) === 'rich' ? 'down' : zone(s.pctl5) === 'cheap' ? 'up' : '' },
    { h: 'Z 5Y', num: 1, v: (s) => s.z5, f: (s) => (s.z5 >= 0 ? '+' : '') + f2(s.z5) },
    { h: 'vs 5Y med', num: 1, v: (s) => s.vsMed5, f: (s) => pctS(s.vsMed5), cls: (s) => gapZone(s.vsMed5) === 'rich' ? 'down' : gapZone(s.vsMed5) === 'cheap' ? 'up' : '' },
    { h: '1Y med', num: 1, v: (s) => s.med1, f: (s) => f1(s.med1) },
    { h: '3Y med', num: 1, v: (s) => s.med3, f: (s) => f1(s.med3) },
    { h: '5Y med', num: 1, v: (s) => s.med5, f: (s) => f1(s.med5) },
    { h: '5Y low', num: 1, v: (s) => s.min5, f: (s) => stack(f1(s.min5), s.minDate ? fmtD(parseD(s.minDate)) : '') },
    { h: '5Y high', num: 1, v: (s) => s.max5, f: (s) => stack(f1(s.max5), s.maxDate ? fmtD(parseD(s.maxDate)) : '') },
    ...[0, 1, 2, 3, 4].map((k) => ({ h: 'Dec-' + (21 + k), num: 1, v: (s) => s.ye[k], f: (s) => f1(s.ye[k]) })),
    { h: '5Y ago', num: 1, v: (s) => s.ago5, f: (s) => f1(s.ago5) },
    { h: 'P/B', num: 1, v: (s) => s.curPB, f: (s) => f2(s.curPB) },
    { h: 'Div yld', num: 1, v: (s) => s.curDY, f: (s) => f2(s.curDY) + '%' },
    { h: 'Earn yld', num: 1, v: (s) => (s.cur ? 100 / s.cur : null), f: (s) => f2(100 / s.cur) + '%' },
  ];
  function renderIndiaTable() {
    const rows = IDS.map((id) => { const s = statsFor(id); return s && { ...s, name: state.hist.series[id].name }; }).filter(Boolean);
    table($('#tbl-india'), indiaCols, rows, state.sortI, (k) => { state.sortI = k; renderIndiaTable(); });
  }

  /* ---------- global ---------- */
  function globalRows() { const g = state.global?.markets || []; return state.group === 'all' ? g : g.filter((m) => m.group === state.group || (m.group === 'Aggregate' && ((state.group === 'Developed' && m.market !== 'Emerging markets') || (state.group === 'Emerging' && m.market !== 'Developed markets')))); }
  function renderGlobalChart() {
    const node = $('#g-chart'), live = state.gview === 'live';
    const rows = globalRows().map((m) => ({ ...m, v: live ? m.livePE : m.vsAvg5 })).filter((m) => m.v != null).sort((a, b) => b.v - a.v);
    const leg = $('#g-legend'); leg.replaceChildren(...['Developed', 'Emerging', 'Aggregate'].map((k) => { const s = el('span', 'li'); const i = el('i', 'sq'); i.style.background = GCOLOR[k]; s.append(i, k); return s; }));
    if (!rows.length) { node.replaceChildren(el('div', 'empty', live ? 'Live ETF quotes unavailable right now' : 'No history for this group')); return; }
    const H = rows.length * 24 + 34; node.style.height = H + 'px';
    const { svg, M, iw, ih } = frame(node, H, { t: 4, r: 52, b: 26, l: 140 });
    const ext = d3.extent([0, ...rows.map((r) => r.v)]);
    const x = d3.scaleLinear().domain(ext).range([0, iw]).nice();
    const y = d3.scaleBand().domain(rows.map((r) => r.market)).range([0, ih]).padding(0.25);
    const g = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
    g.append('g').attr('class', 'grid').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(iw / 80))).tickSize(-ih).tickFormat('')).call((s) => s.select('.domain').remove());
    g.append('g').attr('class', 'axis').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(Math.max(3, Math.floor(iw / 80))).tickFormat(live ? (v) => v + 'x' : d3.format('+.0%')));
    if (!live) g.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', ih).attr('stroke', 'var(--ref)');
    const row = g.selectAll('g.r').data(rows, (r) => r.market).join('g').attr('class', 'r').attr('transform', (r) => `translate(0,${y(r.market)})`);
    row.append('text').attr('x', -10).attr('y', y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 12).attr('fill', 'currentColor').attr('font-weight', (r) => (r.market === 'India' ? 700 : 400)).text((r) => r.market);
    const bar = row.append('rect').attr('y', 0).attr('height', y.bandwidth()).attr('rx', 3).attr('fill', (r) => GCOLOR[r.group]).attr('x', x(0)).attr('width', 0);
    bar.transition().duration(matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500).ease(d3.easeCubicOut).attr('x', (r) => Math.min(x(0), x(r.v))).attr('width', (r) => Math.abs(x(r.v) - x(0)));
    row.append('text').attr('x', (r) => (r.v >= 0 ? x(r.v) + 5 : x(r.v) - 5)).attr('text-anchor', (r) => (r.v >= 0 ? 'start' : 'end')).attr('y', y.bandwidth() / 2).attr('dy', '0.35em').attr('font-size', 11.5).attr('fill', 'currentColor').text((r) => (live ? f1(r.v) + 'x' : pctS(r.v)));
    row.append('rect').attr('x', -M.l).attr('width', iw + M.l + M.r).attr('height', y.bandwidth()).attr('fill', 'transparent')
      .on('pointermove', (ev, r) => showTip(ev, `${r.market} · ${r.etf}`, [['Live ETF PE', r.livePE ? f2(r.livePE) + 'x' : '—'], ['ETF today', pctS(r.etfChangePct / 100, 2)], ['Siblis month-end', r.siblisPE ? f2(r.siblisPE) + 'x' : '—'], ['Siblis 5Y avg', r.avg5 ? f1(r.avg5) + 'x' : '—'], ['vs 5Y avg', pctS(r.vsAvg5)]]))
      .on('pointerleave', hideTip);
    svg.attr('role', 'img').attr('aria-label', live ? 'Live trailing PE by market' : 'PE versus 5-year average by market');
    const G = state.global;
    $('#g-note').textContent = live
      ? `Live = trailing PE of each market's MSCI country ETF via Yahoo Finance (delayed up to 15 min).${G.liveError ? (G.quotesAsOf ? ' Live feed down — showing quotes saved ' + new Date(G.quotesAsOf).toLocaleString() + '.' : ' Live quotes unavailable right now.') : ''}`
      : `Siblis Research trailing PE (${fmtD(parseD(G.siblisAsOf))}${G.siblisOldest && G.siblisOldest !== G.siblisAsOf ? `; some markets ${fmtD(parseD(G.siblisOldest))}` : ''}) vs the mean of its ${G.yearEnds?.[0] || 'Dec-21'} to ${G.yearEnds?.at(-1) || 'Dec-25'} year-end PE. Markets without five year-ends are left out. Updated automatically from the Siblis API${G.siblisTier === 'free' ? ' (free tier: quarter-end readings; newer verified month-ends are kept until a newer reading appears)' : ''}.`;
  }
  const globalCols = () => [
    { h: 'Market', v: (m) => m.market, f: (m) => swatch(GCOLOR[m.group], m.market, m.etf) },
    { h: 'Live PE', num: 1, t: 'ETF trailing PE (Yahoo Finance)', v: (m) => m.livePE, f: (m) => f2(m.livePE), cls: () => 'strong' },
    { h: 'ETF 1D', num: 1, v: (m) => m.etfChangePct, f: (m) => pctS(m.etfChangePct / 100, 2), cls: (m) => (m.etfChangePct >= 0 ? 'up' : 'down') },
    { h: 'Siblis PE', num: 1, t: 'Siblis Research month-end trailing PE', v: (m) => m.siblisPE, f: (m) => f2(m.siblisPE) },
    ...(state.global?.yearEnds || []).map((h, k) => ({ h, num: 1, v: (m) => m.yearEnds?.[k], f: (m) => f1(m.yearEnds?.[k]) })),
    { h: '5Y avg', num: 1, v: (m) => m.avg5, f: (m) => f1(m.avg5) },
    { h: 'vs 5Y avg', num: 1, v: (m) => m.vsAvg5, f: (m) => pctS(m.vsAvg5), cls: (m) => gapZone(m.vsAvg5) === 'rich' ? 'down' : gapZone(m.vsAvg5) === 'cheap' ? 'up' : '' },
  ];
  function renderGlobalTable() { table($('#tbl-global'), globalCols(), globalRows(), state.sortG, (k) => { state.sortG = k; renderGlobalTable(); }, 'group'); }

  /* ---------- CSV ---------- */
  function csv(name, header, rows) {
    const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const blob = new Blob([[header, ...rows].map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
    const a = el('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $('#csv-india').onclick = () => {
    const S = IDS.map(statsFor).filter(Boolean);
    csv(`india-pe-${new Date().toISOString().slice(0, 10)}.csv`, ['Index', 'PE', 'PE date', 'Percentile 5Y', 'Z 5Y', 'vs 5Y median', 'Median 1Y', 'Median 3Y', 'Median 5Y', '5Y low', '5Y low date', '5Y high', '5Y high date', 'Dec-21', 'Dec-22', 'Dec-23', 'Dec-24', 'Dec-25', '5Y ago', 'P/B', 'Div yield %'],
      S.map((s) => [state.hist.series[s.id].name, s.cur, s.curDate, s.pctl5?.toFixed(3), s.z5?.toFixed(2), s.vsMed5?.toFixed(4), s.med1, s.med3, s.med5, s.min5, s.minDate, s.max5, s.maxDate, ...s.ye, s.ago5, s.curPB, s.curDY]));
  };
  $('#csv-global').onclick = () => {
    const G = state.global; if (!G) return;
    csv(`global-pe-${new Date().toISOString().slice(0, 10)}.csv`, ['Market', 'Group', 'ETF', 'Live ETF PE', 'Siblis PE (' + G.siblisAsOf + ')', ...G.yearEnds, '5Y avg', 'vs 5Y avg'],
      G.markets.map((m) => [m.market, m.group, m.etf, m.livePE?.toFixed(2), m.siblisPE, ...(m.yearEnds || [null, null, null, null, null]), m.avg5?.toFixed(2), m.vsAvg5?.toFixed(4)]));
  };

  /* ---------- render orchestration ---------- */
  // Charts measure their container, so the Valuations tab only draws while it is visible.
  const onVal = () => state.tab === 'valuations';
  function renderAllIndia() {
    if (!state.hist) return;
    renderInsights();
    if (!onVal()) return;
    syncIndexSeg(); renderCards(); renderHistory(); renderRange(); renderPremium(); renderIndiaTable(); macro?.renderTab('valuations');
  }
  function renderAllGlobal() { if (!state.global) return; renderInsights(); if (!onVal()) return; renderGlobalChart(); renderGlobalTable(); }
  function renderActive() {
    if (state.tab === 'valuations') { renderAllIndia(); renderAllGlobal(); }
    else { renderInsights(); macro?.renderTab(state.tab); invest?.renderTab(state.tab); funds?.renderTab(state.tab); }
  }
  /* ---------- tabs (hash routing) ---------- */
  const TABS = ['overview', 'markets', 'beyond', 'valuations', 'macro', 'liquidity', 'india', 'funds', 'view', 'calendar'];
  const ALIAS = { alts: 'beyond' };
  const needsResearch = () => state.tab === 'view' || state.tab === 'beyond';
  // The viewpoint switch stays pinned under the tab bar (which is itself pinned on wide screens).
  const syncBars = () => { const nav = $('#tabs'); document.documentElement.style.setProperty('--tabs-h', getComputedStyle(nav).position === 'sticky' ? nav.offsetHeight + 'px' : '0px'); };
  function showTab(t) {
    t = ALIAS[t] || t;
    if (!TABS.includes(t)) t = 'overview';
    state.tab = t;
    for (const n of TABS) { const sec = document.getElementById('tab-' + n); if (sec) sec.hidden = n !== t; }
    document.querySelectorAll('#tabs a').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === t ? 'page' : 'false'));
    $('#lensbar').hidden = !needsResearch(); syncBars();
    renderActive();
    // Research data (Investment view, Beyond Equities) loads the first time one of those tabs opens.
    if (needsResearch() && !state.research && !loadingResearch) loadResearch().then(() => renderActive());
    // Mutual fund data (AMFI, SEBI, NSDL) loads the first time the tab opens.
    if (t === 'funds' && !state.mf && !loadingMF) loadMF().then(() => renderActive());
  }
  addEventListener('hashchange', () => showTab(location.hash.slice(1)));
  state.tab = ALIAS[location.hash.slice(1)] || (TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview');

  seg('#seg-index', (v) => { if (v === 'all') state.compare = true; else { state.compare = false; state.sel = v; } renderAllIndia(); });
  seg('#seg-metric', (v) => { state.metric = v; renderHistory(); });
  seg('#seg-period', (v) => { state.years = v === 'max' ? Infinity : +v; renderHistory(); });
  seg('#seg-prem', (v) => { state.premYears = +v; renderPremium(); });
  seg('#seg-group', (v) => { state.group = v; renderAllGlobal(); });
  seg('#seg-gview', (v) => { state.gview = v; renderGlobalChart(); });
  $('#bands').onchange = (e) => { state.bands = e.target.checked; renderHistory(); };

  /* ---------- data loading & refresh ---------- */
  let loadingHist = null;
  async function loadHistory() {
    if (loadingHist) return loadingHist;
    loadingHist = getJSON('/api/history').then((h) => { state.hist = h; state.histAt = Date.now(); if (!$('#seg-index').children.length) buildIndexSeg(); }).finally(() => { loadingHist = null; });
    return loadingHist;
  }
  async function loadLive() { try { state.live = await getJSON('/api/live'); } catch (e) { state.live = { ok: false, error: String(e) }; } }
  // Reference data (calendars, IMF, Siblis, regulator watch) is re-checked at its sources by /api/refdata?refresh=1.
  // Its build time is passed to the APIs that use it, so a new build is never hidden behind a cached response.
  let refBuilt = null;
  const rv = (u) => (refBuilt ? `${u}${u.includes('?') ? '&' : '?'}rv=${encodeURIComponent(refBuilt)}` : u);
  async function checkRefdata() {
    try { const r = await getJSON('/api/refdata?refresh=1'); if (!r.ok || !r.builtAt) return false; const changed = r.builtAt !== refBuilt && (r.refreshed || []).length > 0; refBuilt = r.builtAt; return changed; }
    catch (e) { console.warn(e); return false; }
  }
  async function loadGlobal() { try { state.global = await getJSON(rv('/api/global')); } catch (e) { console.warn(e); } }
  async function loadMarkets() { try { const m = await getJSON(rv('/api/markets')); if (m.ok) { state.markets = m; state.marketsAt = Date.now(); } } catch (e) { console.warn(e); } }
  async function loadPos() { try { const m = await getJSON('/api/positioning'); if (m.ok) { state.pos = m; state.posAt = Date.now(); } } catch (e) { console.warn(e); } }
  async function loadBrief() { try { const m = await getJSON('/api/brief'); if (m.ok) { state.brief = m; state.briefAt = Date.now(); } } catch (e) { console.warn(e); } }
  async function loadMacro() { try { const m = await getJSON(rv('/api/macro')); if (m.ok) { state.macro = m; state.macroAt = Date.now(); } } catch (e) { console.warn(e); } }
  let loadingResearch = null;
  function loadResearch() {
    loadingResearch ||= getJSON(rv('/api/research')).then((m) => { if (m.ok) { state.research = m; state.researchAt = Date.now(); } else if (!state.research) state.research = m; }).catch((e) => { console.warn(e); }).finally(() => { loadingResearch = null; });
    return loadingResearch;
  }

  // Mutual funds: the stored copy first (fast); Refresh then asks the server to re-check the official sources (~8 s).
  let loadingMF = null;
  function loadMF({ check = false } = {}) {
    loadingMF ||= (async () => {
      try { const m = await getJSON('/api/mf'); if (m.ok || !state.mf) { state.mf = m; state.mfAt = Date.now(); } }
      catch (e) { console.warn(e); if (!state.mf) state.mf = { ok: false, error: 'the server could not be reached' }; }
      if (check) { try { const m = await getJSON('/api/mf?refresh=1'); if (m.ok && m.builtAt !== state.mf?.builtAt) { state.mf = m; state.mfAt = Date.now(); } } catch (e) { console.warn(e); } }
    })().finally(() => { loadingMF = null; });
    return loadingMF;
  }

  async function refresh({ full = false } = {}) {
    const btn = $('#refresh'); btn.classList.add('spin'); btn.disabled = true;
    // A full refresh also re-checks the reference sources; if anything new came in, the affected data reloads below.
    const refJob = full ? checkRefdata() : Promise.resolve(false);
    try {
      const jobs = [loadLive(), loadGlobal()];
      if (full || !state.macro || Date.now() - state.macroAt > 30 * 60e3) jobs.push(loadMacro());
      if (full || !state.markets || Date.now() - state.marketsAt > 2 * 60e3) jobs.push(loadMarkets());
      if (full || !state.pos || Date.now() - state.posAt > 3 * 3600e3) jobs.push(loadPos());
      if (full || !state.brief || Date.now() - state.briefAt > 30 * 60e3) jobs.push(loadBrief());
      if (full || !state.hist || Date.now() - state.histAt > 6 * 3600e3) jobs.push(loadHistory());
      if ((needsResearch() || state.research) && (full || !state.research?.ok || Date.now() - state.researchAt > 60 * 60e3)) jobs.push(loadResearch());
      if ((state.tab === 'funds' || state.mf) && (full || !state.mf?.ok || Date.now() - state.mfAt > 30 * 60e3)) jobs.push(loadMF({ check: full && !!state.mf }));
      await Promise.allSettled(jobs);
      if (!state.hist) throw new Error('History unavailable');
      setStatus(); renderActive();
      if (await refJob) {
        await Promise.allSettled([loadMacro(), loadMarkets(), loadGlobal(), ...(state.research ? [loadResearch()] : [])]);
        setStatus(); renderActive();
      }
    } catch (e) {
      $('#status-text').textContent = 'Could not load data — retrying'; $('#status').className = 'pill warn'; console.error(e);
    } finally { btn.classList.remove('spin'); btn.disabled = false; schedule(); }
  }

  let timer = null, next = 0;
  const interval = () => (marketOpen() ? 60 : 300) * 1000;
  function schedule() { clearTimeout(timer); if (!$('#auto').checked) { next = 0; $('#countdown').textContent = ''; return; } next = Date.now() + interval(); timer = setTimeout(() => { if (document.visibilityState === 'visible') refresh(); else schedule(); }, interval()); }
  setInterval(() => { const c = $('#countdown'); if (!next) return; const s = Math.max(0, Math.round((next - Date.now()) / 1000)); c.textContent = s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`; }, 1000);
  $('#auto').onchange = (e) => { store.set('pe-auto', e.target.checked ? '1' : '0'); schedule(); };
  if (store.get('pe-auto') === '0') $('#auto').checked = false;
  $('#refresh').onclick = () => refresh({ full: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && next && Date.now() > next) refresh(); });

  $('#theme').onclick = () => {
    const root = document.documentElement, dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark'; store.set('pe-theme', root.dataset.theme);
    renderActive();
  };
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { syncBars(); renderActive(); }, 150); });

  seg('#seg-market', (v) => { state.market = v; macro?.renderTab('overview'); });
  const macro = window.PEMacro ? window.PEMacro({ state, el, f1, f2, pctS, ord, showTip, hideTip, cssVar, frame, fmtD, parseD, statsFor, IDS }) : null;
  const invest = window.PEInvest ? window.PEInvest({ state, el, showTip, hideTip, frame, statsFor }) : null;
  const funds = window.PEFunds ? window.PEFunds({ state, el, showTip, hideTip }) : null;
  showTab(state.tab);
  refresh({ full: true });
})();
