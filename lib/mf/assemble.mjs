// Builds what the Mutual funds tab shows from the stored official data: monthly category flows (AMFI), SIP totals and
// accounts (AMFI's SIP page), SIP by category (SEBI), foreign flows (NSDL), fund trading (SEBI), fund houses (AMFI),
// FII/DII flows (exchanges, NSDL, SEBI), and the checks behind each number.
// Everything here is arithmetic on published figures; nothing is estimated.
import { CATS, BY_KEY, CLASSES, TREND, monthLabel, monthShort, addMonths } from './taxonomy.mjs';

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const r0 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x));
const sum = (a) => a.reduce((s, x) => s + (x || 0), 0);
const F = { schemes: 0, folios: 1, gross: 2, red: 3, net: 4, aum: 5, aaum: 6 };
export const CORE_CHECKS = ['row-net', 'subtotals', 'sections', 'grand-total', 'categories', 'core', 'plausible', 'period'];

/* ---------------- formatting for alerts and bullets ---------------- */
const IN = (n, d = 0) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
export function cr(v, { sign = false } = {}) {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = v < 0 ? '−' : sign && v > 0 ? '+' : '', a = Math.abs(v);
  return a >= 1e5 ? `${s}₹${IN(a / 1e5, 2)} lakh cr` : `${s}₹${IN(Math.round(a))} cr`;
}
const lakh = (n) => `${IN(n / 1e5, 1)} lakh`;
const dayLabel = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return y && m && d ? `${d} ${monthShort(`${y}-${String(m).padStart(2, '0')}`).split(' ')[0]} ${y}` : iso; };
const crore = (n) => `${IN(n / 1e7, 2)} crore`;
const pct = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : `${v < 0 ? '−' : ''}${IN(Math.abs(v * 100), d)}%`);

/* ---------------- series ---------------- */
function rowsBy(doc, pick) { const o = {}; for (const [k, v] of Object.entries(doc.rows)) { const g = pick(BY_KEY[k]); if (g) o[g] = o[g] ? o[g].map((x, i) => (x ?? 0) + (v[i] ?? 0)) : v.slice(); } return o; }
function series(months, docs) {
  const tk = {}, cls = {}, total = { net: [], gross: [], red: [], aum: [], aaum: [], folios: [] };
  for (const t of TREND) tk[t] = { net: [], gross: [], red: [], aum: [], folios: [] };
  for (const [c] of CLASSES) cls[c] = { net: [], gross: [], red: [], aum: [], folios: [] };
  months.forEach((m, i) => {
    const d = docs[m], byT = rowsBy(d, (c) => c.tk), byC = rowsBy(d, (c) => c.cls);
    for (const t of TREND) for (const f of ['net', 'gross', 'red', 'aum', 'folios']) tk[t][f][i] = byT[t] ? r2(byT[t][F[f]]) : null;
    for (const [c] of CLASSES) for (const f of ['net', 'gross', 'red', 'aum', 'folios']) cls[c][f][i] = byC[c] ? r2(byC[c][F[f]]) : null;
    const g = d.total.grand || [];
    for (const f of ['net', 'gross', 'red', 'aum', 'aaum', 'folios']) total[f][i] = r2(g[F[f]]);
  });
  return { tk, cls, total };
}

/* ---------------- AMFI vs SEBI ---------------- */
function crossCheck(p, amfi, sebi, sebiPrev) {
  if (!amfi || !sebi) return null;
  const out = { period: p, aum: { n: 0, ok: 0, bad: [] }, folios: { n: 0, ok: 0, bad: [] }, net: { n: 0, ok: 0, bad: [] } };
  const monthly = sebiPrev && sebiPrev.fyStart === sebi.fyStart && p.slice(5) !== '04' ? (k) => { const a = sebi.rows[k], b = sebiPrev.rows[k]; return a && b ? a[4] - b[4] : null; } : p.slice(5) === '04' ? (k) => sebi.rows[k]?.[4] ?? null : null;
  for (const [k, a] of Object.entries(amfi.rows)) {
    const s = sebi.rows[k]; if (!s) continue;
    const cmp = (f, av, sv, tol, label) => { if (av == null || sv == null) return; out[f].n++; if (Math.abs(av - sv) <= tol) out[f].ok++; else out[f].bad.push({ k, label, amfi: r2(av), sebi: r2(sv) }); };
    cmp('aum', a[5], s[5], 0.6, BY_KEY[k].name);
    cmp('folios', a[1], s[1], 1, BY_KEY[k].name);
    if (monthly) cmp('net', a[4], monthly(k), 1.2, BY_KEY[k].name);
  }
  const ga = amfi.total.grand, gs = sebi.total.grand;
  out.grand = { aum: ga && gs ? Math.abs(ga[5] - gs[5]) <= 1 : null, folios: ga && gs ? Math.abs(ga[1] - gs[1]) <= 1 : null };
  if (monthly && ga && gs && sebiPrev?.total?.grand) out.grand.net = Math.abs(ga[4] - (p.slice(5) === '04' ? gs[4] : gs[4] - sebiPrev.total.grand[4])) <= 2;
  out.ok = out.grand.aum !== false && out.grand.folios !== false && out.grand.net !== false;
  return out;
}

/* ---------------- what changed (deterministic sentences from the numbers) ---------------- */
function sinceText(arr, i, dir) { // "highest since Jul 26" / "lowest in the N months on record"
  const v = arr[i]; if (v == null) return null;
  const n = arr.slice(0, i + 1).filter((x) => x != null).length;
  if (n < 12) return null; // too little history to call anything a high or a low
  for (let j = i - 1; j >= 0; j--) { const x = arr[j]; if (x == null) continue; if (dir > 0 ? x >= v : x <= v) return j === i - 1 ? null : `${dir > 0 ? 'highest' : 'lowest'} since ${monthShort(MONTHS_REF[j])}`; }
  return `${dir > 0 ? 'highest' : 'lowest'} in the ${n} months on record`;
}
let MONTHS_REF = [];
function bullets(o, L, P) {
  const b = [], i = o.months.length - 1, T = o.trend;
  if (!L) return b;
  const seq = !!o.prev && o.prev === addMonths(o.latest, -1), vsPrev = seq ? 'on the month' : o.prev ? `from ${monthShort(o.prev)}` : ''; // a first run may have one month only
  const gL = L.total.grand, gP = P?.total.grand;
  b.push(`Net ${gL[4] >= 0 ? 'inflows' : 'outflows'} of ${cr(Math.abs(gL[4]))} across all funds in ${monthLabel(o.latest)}${gP ? `, against ${gP[4] >= 0 ? 'inflows' : 'outflows'} of ${cr(Math.abs(gP[4]))} in ${monthLabel(o.prev).split(' ')[0]}` : ''}.`);
  const eq = T.cls.equity.net, e = eq[i], ep = eq[i - 1];
  if (e != null) {
    const ch = ep ? (e - ep) / Math.abs(ep) : null, s = sinceText(eq, i, ch != null && ch < 0 ? -1 : 1);
    b.push(`Equity funds (active) took in ${cr(e)} net${ch != null ? `, ${ch < 0 ? 'down' : 'up'} ${pct(Math.abs(ch))} ${vsPrev}` : ''}${s && seq ? ` — the ${s}` : ''}.`);
  }
  const eqRows = Object.entries(L.rows).filter(([k]) => BY_KEY[k].cls === 'equity').map(([k, v]) => ({ k, net: v[4], prev: P?.rows[k]?.[4] ?? null }));
  const top = eqRows.slice().sort((a, c) => c.net - a.net).slice(0, 3).filter((x) => x.net > 0);
  if (top.length) b.push(`Most equity money went to ${top.map((x) => `${BY_KEY[x.k].name} (${cr(x.net)})`).join(', ')}.`);
  const moved = eqRows.filter((x) => x.prev != null).map((x) => ({ ...x, d: x.net - x.prev })).sort((a, c) => Math.abs(c.d) - Math.abs(a.d)).slice(0, 2);
  if (moved.length && Math.abs(moved[0].d) >= 500) b.push(`Biggest swings: ${moved.map((x) => `${BY_KEY[x.k].name} ${cr(x.d, { sign: true })} vs ${monthShort(o.prev)}`).join('; ')}.`);
  const outs = Object.entries(L.rows).filter(([k, v]) => ['equity', 'hybrid'].includes(BY_KEY[k].cls) && v[4] < -100).sort((a, c) => a[1][4] - c[1][4]).slice(0, 3);
  if (outs.length) b.push(`Net outflows from ${outs.map(([k, v]) => `${BY_KEY[k].name} (${cr(v[4])})`).join(', ')}.`);
  const d = T.cls.debt.net[i], dp = T.cls.debt.net[i - 1];
  if (d != null) { const liq = (L.rows.liquid?.[4] || 0) + (L.rows.overnight?.[4] || 0) + (L.rows.moneymkt?.[4] || 0); b.push(`Debt funds: ${cr(d, { sign: true })}${dp != null ? ` (${monthShort(o.prev)}: ${cr(dp, { sign: true })})` : ''}, of which liquid, overnight and money market funds ${cr(liq, { sign: true })}.`); }
  const gold = L.rows.goldetf?.[4], silver = L.rows.silveretf?.[4];
  if (gold != null) b.push(`Gold ETFs ${cr(gold, { sign: true })}${silver != null ? `, silver ETFs ${cr(silver, { sign: true })}` : ''}.`);
  if (gP) { const add = gL[1] - gP[1]; b.push(`Investor folios ${add >= 0 ? 'rose' : 'fell'} by ${lakh(Math.abs(add))} ${seq ? 'in the month' : `since ${monthShort(o.prev)}`} to ${crore(gL[1])}.`); }
  if (L.nfo?.n) { const big = L.nfo.list?.[0]; b.push(`${L.nfo.n} new schemes raised ${cr(L.nfo.amt)}${big ? `; the largest was ${big.name} (${cr(big.amt)})` : ''}.`); }
  const sb = sipBullet(o);
  if (sb) b.push(sb);
  const fpi = o.fpi.months.indexOf(o.latest);
  if (fpi >= 0 && e != null) { const f = o.fpi.equity[fpi]; b.push(`Foreign portfolio investors were net ${f >= 0 ? 'buyers' : 'sellers'} of ${cr(Math.abs(f))} of Indian equities in ${monthLabel(o.latest).split(' ')[0]} (NSDL), while equity funds took in ${cr(e)}.`); }
  // The month after the report, from the daily sources: NSDL (foreign investors) and SEBI (funds' own buying and selling).
  const pm = o.fpi.partial && o.fpi.partial > o.latest ? o.fpi.partial : null, fp = pm ? o.fpi.equity[o.fpi.months.indexOf(pm)] : null, tc = o.trade.current;
  const tcOk = tc && tc.ok && tc.month > o.latest;
  if (fp != null || tcOk) {
    const mo = monthLabel(pm || tc.month).split(' ')[0], parts = [];
    if (fp != null) parts.push(`foreign portfolio investors were net ${fp >= 0 ? 'buyers' : 'sellers'} of ${cr(Math.abs(fp))} of Indian equities (NSDL, to ${o.fpi.upTo || 'date'})`);
    if (tcOk && (!pm || tc.month === pm)) parts.push(`mutual funds were net ${tc.total.eqNet >= 0 ? 'buyers' : 'sellers'} of ${cr(Math.abs(tc.total.eqNet))} of equities (SEBI, to ${dayLabel(tc.asOf)})`);
    b.push(`${mo} so far: ${parts.join('; ')}.`);
  }
  const xl = o.inst?.exch?.latest; // the exchanges' figures for the latest trading day
  if (xl) b.push(`Latest trading day (${dayLabel(xl.d)}, exchanges, provisional): FIIs net ${xl.fii.net >= 0 ? 'bought' : 'sold'} ${cr(Math.abs(xl.fii.net))} and DIIs net ${xl.dii.net >= 0 ? 'bought' : 'sold'} ${cr(Math.abs(xl.dii.net))} in the cash market.`);
  return b;
}

// SIP sentence: AMFI's SIP page (total, accounts, SIP assets) when it has passed its checks, else SEBI's table.
function sipBullet(o) {
  const A = o.sipAmfi;
  if (A?.latest) {
    const m = A.latest, v = A.amt[A.months.indexOf(m)], pv = A.amt[A.months.indexOf(addMonths(m, -1))], yv = A.amt[A.months.indexOf(addMonths(m, -12))];
    const d = A.det[m], dp = A.det[addMonths(m, -1)];
    let t = `SIP inflows were ${cr(v)} in ${monthLabel(m)} (AMFI)`;
    if (pv != null) t += `, ${v >= pv ? 'up' : 'down'} ${pct(Math.abs(v / pv - 1), 1)} from ${cr(pv)} in ${monthLabel(addMonths(m, -1)).split(' ')[0]}`;
    if (yv != null) t += ` and ${v >= yv ? 'up' : 'down'} ${pct(Math.abs(v / yv - 1), 1)} on a year earlier`;
    if (d && !d.unchecked && d.newReg != null && d.disc != null) {
      const ch = dp?.outstanding != null ? d.outstanding - dp.outstanding : d.newReg - d.disc;
      t += `; ${IN(d.newReg, 2)} lakh new SIPs against ${IN(d.disc, 2)} lakh discontinued or matured (stoppage ratio ${pct(d.disc / d.newReg, 1)}), so SIP accounts ${ch >= 0 ? 'rose' : 'fell'} by ${IN(Math.abs(ch), 2)} lakh to ${IN(d.outstanding / 100, 2)} crore; SIP assets ${cr(d.aum)}`;
    }
    return t + '.';
  }
  const sp = o.sip.latest && o.sip.m[o.sip.latest];
  if (!sp) return null;
  const pr = o.sip.m[addMonths(o.sip.latest, -1)], st = sp.acc.reg ? (sp.acc.mat + sp.acc.term) / sp.acc.reg : null;
  return `SIP inflows (${monthLabel(o.sip.latest)}, SEBI): ${cr(sp.total)}${pr ? ` vs ${cr(pr.total)} the month before` : ''}; ${lakh(sp.acc.reg)} new SIPs against ${lakh(sp.acc.mat + sp.acc.term)} stopped or matured (stoppage ratio ${pct(st, 1)})${sp.accOk ? '' : '; SEBI\'s category figures for SIP accounts do not add up to its total this month'}.`;
}

/* ---------------- SIPs from AMFI's SIP page, checked against SEBI ---------------- */
function sipFromAmfi(st, o) {
  const p = st.amfiSip;
  if (!p?.gate || !p.latest) return null;
  const months = Object.keys(p.history).sort();
  const det = { ...(st.sipDet || {}) };
  if (!p.accOk) for (const [m, d] of Object.entries(p.details || {})) if (!det[m]) det[m] = { ...d, unchecked: true }; // shown flagged
  const dm = Object.keys(det).sort().slice(-25);
  // Same month in both official sources: SIP amount and account totals must agree (AMFI rounds counts to 0.01 lakh).
  const cross = [];
  for (const m of o.sip.months) {
    const s = o.sip.m[m], a = det[m], amt = p.history[m];
    if (amt == null && !a) continue;
    const items = [];
    if (amt != null) items.push({ k: 'SIP inflows', ok: Math.abs(amt - s.total) <= 1, amfi: `₹${IN(amt)} cr`, sebi: `₹${IN(s.total, 2)} cr` });
    if (a && !a.unchecked && s.acc) for (const [k, x, y] of [['New SIPs', a.newReg, s.acc.reg], ['Discontinued or matured', a.disc, s.acc.mat != null && s.acc.term != null ? s.acc.mat + s.acc.term : null], ['SIP accounts at month-end', a.outstanding, s.acc.close]])
      if (x != null && y != null) items.push({ k, ok: Math.abs(x - y / 1e5) <= 0.011, amfi: `${IN(x, 2)} lakh`, sebi: `${IN(y / 1e5, 2)} lakh` });
    cross.push({ m, ok: items.every((x) => x.ok), items, sebiCatsOk: s.accOk });
  }
  return { latest: p.latest, months, amt: months.map((m) => p.history[m]), det: Object.fromEntries(dm.map((m) => [m, det[m]])), detMonths: dm, fyTotal: p.fyTotal, checks: p.checks, accOk: p.accOk, src: p.src || null, at: p.fetchedAt || null, cross };
}

/* ---------------- alert messages ---------------- */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function alertText(o) {
  const lines = (o.bullets || []).slice(0, 8);
  const subject = `Mutual funds: ${monthLabel(o.latest)} data is out (AMFI)`;
  const checks = o.status.find((s) => s.id === 'amfi');
  const foot = checks?.checksOk ? 'All AMFI totals checked: rows add up to every sub-total and the grand total.' : 'Note: some checks did not pass; see the Sources panel.';
  return { subject, text: `<b>${esc(subject)}</b>\n\n${lines.map((l) => '• ' + esc(l)).join('\n')}\n\n<i>${esc(foot)}</i>`, html: `<div style="font-family:Inter,Arial,sans-serif;max-width:640px"><h2 style="font-size:17px">${esc(subject)}</h2><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><p style="color:#6b7280;font-size:12px">${esc(foot)} For information only; not investment advice.</p></div>` };
}
export function sipAlertText(o, which = 'sebi') {
  if (which === 'amfi' && o.sipAmfi?.latest) {
    const A = o.sipAmfi, m = A.latest, d = A.det[m], foot = 'AMFI’s SIP page: the month’s total agrees across the page, and every financial-year total equals the sum of its months.';
    const lines = [sipBullet(o), ...(d && !d.unchecked ? [`SIP accounts that paid an instalment in the month: ${IN(d.contributing, 2)} lakh`] : ['SIP account figures are held back: AMFI’s accounts table did not pass its checks this time']), 'The split by category follows when SEBI publishes its table for the month.'];
    const subject = `Mutual funds: SIP data for ${monthLabel(m)} (AMFI)`;
    return { subject, text: `<b>${esc(subject)}</b>\n\n${lines.map((l) => '• ' + esc(l)).join('\n')}\n\n<i>${esc(foot)}</i>`, html: `<div style="font-family:Inter,Arial,sans-serif;max-width:640px"><h2 style="font-size:17px">${esc(subject)}</h2><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><p style="color:#6b7280;font-size:12px">${esc(foot)} For information only; not investment advice.</p></div>` };
  }
  const m = o.sip.latest, s = o.sip.m[m], p = o.sip.m[addMonths(m, -1)];
  const top = Object.entries(s.cats).filter(([k]) => BY_KEY[k]).sort((a, c) => c[1][0] - a[1][0]).slice(0, 3).map(([k, v]) => `${BY_KEY[k].name} ${cr(v[0])}`).join(', ');
  const st = s.acc.reg ? (s.acc.mat + s.acc.term) / s.acc.reg : null;
  const lines = [`SIP inflows: ${cr(s.total)}${p ? ` (previous month ${cr(p.total)})` : ''}`, `New SIPs ${lakh(s.acc.reg)}; stopped or matured ${lakh(s.acc.mat + s.acc.term)} (stoppage ratio ${pct(st, 1)}); stopped early ${lakh(s.acc.term)}${s.accOk ? '' : ' (as published; SEBI\'s category figures do not add up to its total)'}`, `Largest SIP categories: ${top}`];
  const subject = `Mutual funds: SIP split by category for ${monthLabel(m)} (SEBI)`;
  return { subject, text: `<b>${esc(subject)}</b>\n\n${lines.map((l) => '• ' + esc(l)).join('\n')}`, html: `<div style="font-family:Inter,Arial,sans-serif;max-width:640px"><h2 style="font-size:17px">${esc(subject)}</h2><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>` };
}

/* ---------------- main ---------------- */
const DONE = (s) => s && s.ok !== false;
export async function assembleAll(st, loadDoc) {
  const now = new Date().toISOString();
  const months = Object.entries(st.amfi.have || {}).filter(([, h]) => h.coreOk).map(([m]) => m).sort();
  const docs = Object.fromEntries((await Promise.all(months.map(async (m) => [m, await loadDoc('amfi', m)]))).filter(([, d]) => d));
  const ms = months.filter((m) => docs[m]);
  const sebiMonths = Object.keys(st.sebi.have || {}).sort();
  const sebi = Object.fromEntries((await Promise.all(sebiMonths.map(async (m) => [m, await loadDoc('sebi', m)]))).filter(([, d]) => d));
  const latest = ms[ms.length - 1] || null, prev = ms[ms.length - 2] || null;
  MONTHS_REF = ms;
  const o = { ok: !!latest, v: 1, builtAt: now, latest, prev, months: ms };
  o.meta = { cats: CATS.map((c, i) => ({ k: c.k, name: c.name, cls: c.cls, tk: c.tk, ord: i })), classes: CLASSES, trend: TREND.map((t) => ({ tk: t, name: BY_KEY[t]?.name || t, cls: BY_KEY[t]?.cls })) };
  // Per-month category rows: the last 13 months in full (for the month selector), NFO lists for the last 3.
  o.amfi = {};
  ms.slice(-13).forEach((m, j, arr) => {
    const d = docs[m];
    o.amfi[m] = { fmt: d.fmt, r: Object.fromEntries(Object.entries(d.rows).map(([k, v]) => [k, v.map((x, i) => (i <= 1 ? r0(x) : r2(x)))])), g: (d.total.grand || []).map((x, i) => (i <= 1 ? r0(x) : r2(x))), fof: d.fof && d.fof.map((x, i) => (i <= 1 ? r0(x) : r2(x))), nfo: d.nfo ? { n: d.nfo.n, amt: d.nfo.amt, list: j >= arr.length - 3 ? d.nfo.list : undefined } : null, failed: (d.checks || []).filter((c) => !c.ok).map((c) => c.id) };
  });
  o.trend = latest ? series(ms, docs) : null;
  // SIP (SEBI) and the SIP / lumpsum split where both sources cover a month.
  o.sip = { months: [], m: {}, latest: null };
  for (const m of sebiMonths) {
    const s = sebi[m]; if (!s?.sip || !s.sipData) continue;
    const ck = Object.fromEntries((s.sipChecks || []).map((c) => [c.id, c.ok]));
    if (!ck['sip-sum']) continue; // SIP amounts are shown only when SEBI's categories add up to its total;
    // account counts are shown as published, flagged (accOk false) when SEBI's categories don't add up to its total
    const a = docs[m];
    o.sip.months.push(m);
    o.sip.m[m] = { total: r2(s.sipData.total), mcr: r2(s.sipData.mcr), fof: r2(s.sipData.fof), acc: s.sipData.acc, accOk: ck['sip-accounts'] !== false, cats: Object.fromEntries(Object.entries(s.sipData.cats).map(([k, v]) => [k, [r2(v[0]), ...v.slice(1).map(r0)]])),
      lump: a ? Object.fromEntries(Object.entries(s.sipData.cats).filter(([k]) => a.rows[k]).map(([k, v]) => [k, r2(a.rows[k][2] - (v[0] || 0))])) : null, checks: s.sipChecks };
  }
  o.sip.latest = o.sip.months[o.sip.months.length - 1] || null;
  // SIP totals, accounts and SIP assets from AMFI's SIP page (out with AMFI's monthly data, weeks before SEBI's table).
  o.sipAmfi = sipFromAmfi(st, o);
  // AMFI vs SEBI cross-check for every month both have.
  o.cross = {};
  for (const m of sebiMonths) { const c = crossCheck(m, docs[m], sebi[m], sebi[addMonths(m, -1)]); if (c) o.cross[m] = { ...c, sebiSlips: (sebi[m].checks || []).filter((x) => !x.ok).map((x) => x.detail) }; }
  // Foreign portfolio investors (NSDL), aligned to the months shown.
  const fm = []; for (const y of Object.keys(st.fpi?.years || {}).sort()) for (const r of st.fpi.years[y].months || []) fm.push(r);
  fm.sort((a, b) => (a.m < b.m ? -1 : 1));
  const keepFrom = ms[0] || addMonths(new Date().toISOString().slice(0, 7), -36);
  const fv = fm.filter((r) => r.m >= keepFrom);
  const cur = st.fpi?.years?.[String(new Date().getUTCFullYear())];
  o.fpi = { months: fv.map((r) => r.m), equity: fv.map((r) => r.equity), debt: fv.map((r) => (r.debtGL || 0) + (r.debtVRR || 0) + (r.debtFAR || 0)), hybrid: fv.map((r) => r.hybrid), mf: fv.map((r) => (r.mfEq || 0) + (r.mfDebt || 0) + (r.mfHyb || 0) + (r.mfSol || 0) + (r.mfOther || 0)), total: fv.map((r) => r.total), partial: fv.find((r) => r.partial)?.m || null, upTo: cur?.upTo || null, checks: Object.values(st.fpi?.years || {}).flatMap((y) => (y.checks || []).map((c) => ({ ...c, id: `${c.id}-${y.year}` }))) };
  if (st.fpi?.fy?.length) { // NSDL's financial-year table against its calendar-year months
    const by = new Map(fm.map((r) => [r.m, r])), rec = [];
    for (const f of st.fpi.fy) { const y0 = +f.fy.slice(0, 4); const mm = Array.from({ length: 12 }, (_, k) => addMonths(`${y0}-04`, k)).filter((m) => by.has(m)); if (!mm.length || (mm.length < 12 && !f.partial)) continue; const se = sum(mm.map((m) => by.get(m).equity)); rec.push({ fy: f.fy, months: mm.length, sumEq: se, fyEq: f.equity, ok: Math.abs(se - f.equity) <= 2 * mm.length + 2 }); }
    o.fpi.recon = rec.slice(-3);
  }
  // Mutual funds' trading of shares (SEBI), recorded month by month as the site runs.
  o.trade = { current: st.trade?.current ? { month: st.trade.current.month, asOf: st.trade.current.asOf, total: st.trade.current.total, days: st.trade.current.days.map((x) => [x.d, x.eqNet]), ok: (st.trade.current.checks || []).every((c) => c.ok) } : null };
  // Direct plans by channel (AMFI).
  const bm = Object.keys(st.bif || {}).filter((m) => st.bif[m] && !st.bif[m].pending && st.bif[m].ok !== false).sort().slice(-25);
  o.bif = { months: bm, total: bm.map((m) => r2(st.bif[m].total)), ria: bm.map((m) => r2(st.bif[m].ria)), pms: bm.map((m) => r2(st.bif[m].pms)), diy: bm.map((m) => r2(st.bif[m].diy)) };
  // Fund houses (AMFI quarterly average AUM), with an independent check against the monthly reports.
  o.league = null;
  const fw = st.fundwise;
  if (Array.isArray(fw) && fw[0]) {
    const [q, qp] = fw, prevBy = new Map((qp?.rows || []).map((r) => [r.name, r])), prevRank = new Map((qp?.rows || []).slice().sort((a, b) => b.aaum - a.aaum).map((r, i) => [r.name, i + 1]));
    const cw = st.catwise && st.catwise.end === q.end ? st.catwise : null;
    const eqTot = cw ? sum(cw.amcs.map((a) => a.cls.equity || 0)) : 0;
    const cwBy = new Map((cw?.amcs || []).map((a) => [a.name, a]));
    let cwOk = 0, cwN = 0;
    for (const r of q.rows) { const c = cwBy.get(r.name); if (!c) continue; cwN++; if (Math.abs(c.total - r.aaum) <= Math.max(2, r.aaum * 0.01)) cwOk++; }
    const useCw = cw && cwN >= 20 && cwOk >= cwN * 0.9 && eqTot > 0;
    const rows = q.rows.slice().sort((a, b) => b.aaum - a.aaum).map((r, i) => { const p = prevBy.get(r.name); const c = cwBy.get(r.name);
      return { name: r.name, aaum: r2(r.aaum), prev: p ? r2(p.aaum) : null, share: r.aaum / q.total, prevShare: p && qp ? p.aaum / qp.total : null, rank: i + 1, prevRank: prevRank.get(r.name) || null, eqShare: useCw && c ? (c.cls.equity || 0) / eqTot : null, eqAaum: useCw && c ? r2(c.cls.equity || 0) : null }; });
    // Independent check: quarter average from AMFI's monthly reports (day-weighted) vs the sum across fund houses.
    const qm = [addMonths(q.end, -2), addMonths(q.end, -1), q.end], days = qm.map((m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).getUTCDate());
    const mAvg = qm.every((m) => docs[m]?.total?.grand) ? sum(qm.map((m, k) => docs[m].total.grand[6] * days[k])) / sum(days) : null;
    o.league = { period: q.label, end: q.end, prevPeriod: qp?.label || null, total: r2(q.total), prevTotal: qp ? r2(qp.total) : null, rows, eqFrom: useCw ? cw.label : null,
      check: mAvg ? { fromMonthly: r2(mAvg), diff: (q.total - mAvg) / mAvg, ok: Math.abs(q.total - mAvg) / mAvg <= 0.01 } : null, cwCheck: cw ? { matched: cwOk, of: cwN } : null };
  }
  o.nfoOpen = st.nfoOpen || null;
  o.inst = instFlows(st);
  o.bullets = latest ? bullets(o, docs[latest], prev ? docs[prev] : null) : [];
  o.status = statusRows(st, o, docs, sebi);
  o.next = nextDates(o);
  return o;
}

/* ---------------- FIIs and DIIs: day, month and year ---------------- */
// Three official series, kept apart because they measure different things:
//   exchanges (NSE/BSE): FII/FPI and DII net buying in the cash market, same evening, provisional; recorded day by day
//   NSDL: FPI net investment in equity by reporting date (a day after trading), final, including the primary market
//   SEBI: mutual funds' net purchases of equity by trading date (custodian reports); mutual funds are part of DII
// MF_EXCHANGES=off (the public site): the exchanges' figures are left out of the output entirely.
const exchOff = () => typeof process !== 'undefined' && process.env?.MF_EXCHANGES === 'off';
const ym = (d) => d.slice(0, 7), fyStart = (m) => (+m.slice(5, 7) >= 4 ? +m.slice(0, 4) : +m.slice(0, 4) - 1);
function instFlows(st) {
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10), curM = today.slice(0, 7);
  // Exchanges: every recorded day.
  const ex = exchOff() ? [] : Object.entries(st.exch?.days || {}).sort(([a], [b]) => (a < b ? -1 : 1));
  const exDays = ex.map(([d, x]) => [d, r2(x.fii.net), r2(x.dii.net), r2(x.fii.buy), r2(x.fii.sell), r2(x.dii.buy), r2(x.dii.sell), x.src.join('+')]);
  const lastEx = ex.length ? { d: ex[ex.length - 1][0], ...ex[ex.length - 1][1] } : null;
  // NSDL by reporting date and SEBI mutual funds by trading date (last 13 months).
  const fpiDays = Object.entries(st.fpiDaily?.days || {}).sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, v]) => [d, ...v.map(r2)]);
  const mfDays = Object.entries(st.trade?.daily || {}).sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, v]) => [d, ...v.map(r2)]);
  // NSDL monthly (calendar-year tables) and SEBI monthly totals.
  const fpiM = new Map(), fpiPartial = new Set();
  for (const yv of Object.values(st.fpi?.years || {})) for (const r of yv.months || []) { fpiM.set(r.m, r.equity); if (r.partial) fpiPartial.add(r.m); }
  const mfM = st.trade?.months || {};
  const sumBy = (rows, key, col) => { const o = {}; for (const r of rows) { const k = key(r[0]); (o[k] ||= { v: 0, n: 0 }); o[k].v += r[col] || 0; o[k].n++; } return o; };
  const exM = { fii: sumBy(exDays, ym, 1), dii: sumBy(exDays, ym, 2) };
  const first = [...fpiM.keys(), ...Object.keys(mfM)].sort()[0] || curM;
  const months = [];
  for (let m = first; m <= curM; m = addMonths(m, 1)) {
    const f = fpiM.get(m), mf = mfM[m];
    if (f == null && !mf && !exM.fii[m]) continue;
    months.push([m, f ?? null, fpiPartial.has(m) ? 1 : 0, mf?.eqNet ?? null, mf ? (mf.final || m < curM && mf.asOf >= addMonths(m, 1) ? 1 : 0) : 0, mf?.days ?? null, exM.fii[m] ? r2(exM.fii[m].v) : null, exM.dii[m] ? r2(exM.dii[m].v) : null, exM.fii[m]?.n ?? 0]);
  }
  // Years: calendar (NSDL's year totals; sums of SEBI months; sums of recorded exchange days) and financial (NSDL's FY table).
  const years = [];
  for (const y of [...new Set(months.map((r) => +r[0].slice(0, 4)))].sort()) {
    const ms = months.filter((r) => +r[0].slice(0, 4) === y), fy = st.fpi?.years?.[y];
    const mfMs = ms.filter((r) => r[3] != null), fiiDays = ms.reduce((a, r) => a + r[8], 0);
    years.push([y, fy?.total?.equity ?? null, fy ? (fy.months.some((r) => r.partial) || fy.months.length < 12 ? 1 : 0) : 1, mfMs.length ? r2(sum(mfMs.map((r) => r[3]))) : null, mfMs.length, fiiDays ? r2(sum(ms.map((r) => r[6] || 0))) : null, fiiDays ? r2(sum(ms.map((r) => r[7] || 0))) : null, fiiDays]);
  }
  const fyears = (st.fpi?.fy || []).map((f) => { const y0 = +f.fy.slice(0, 4), ms = months.filter((r) => fyStart(r[0]) === y0), mfMs = ms.filter((r) => r[3] != null), n = ms.reduce((a, r) => a + r[8], 0);
    return [f.fy, f.equity, f.partial ? 1 : 0, mfMs.length ? r2(sum(mfMs.map((r) => r[3]))) : null, mfMs.length, n ? r2(sum(ms.map((r) => r[6] || 0))) : null, n ? r2(sum(ms.map((r) => r[7] || 0))) : null, n]; });
  // Checks: NSDL's days add up to its own monthly figures; SEBI months reconcile; exchange days confirmed by both exchanges.
  const checks = [];
  const upToCy = st.fpi?.years?.[+curM.slice(0, 4)]?.upTo || null, upToIso = upToCy ? isoDay(upToCy) : null;
  for (const m of [...new Set(fpiDays.map((r) => ym(r[0])))].sort()) {
    const dsum = sum(fpiDays.filter((r) => ym(r[0]) === m).map((r) => r[1])), mon = fpiM.get(m), n = fpiDays.filter((r) => ym(r[0]) === m).length;
    const complete = st.fpiDaily?.months?.[m]?.final || (fpiPartial.has(m) && upToIso && st.fpiDaily?.upTo === upToIso);
    if (mon == null || !complete) continue;
    checks.push({ id: 'fpi-days-' + m, ok: Math.abs(dsum - mon) <= 1 + n * 0.01, detail: `${monthLabel(m)}: ${n} reporting dates add to ₹${IN(dsum, 2)} cr; NSDL's monthly table says ₹${IN(mon)} cr` });
  }
  const mfStored = Object.entries(mfM), mfBad = mfStored.filter(([, v]) => v.ok === false).map(([m]) => m);
  checks.push({ id: 'mf-months', ok: mfStored.length > 0 && !mfBad.length, detail: mfBad.length ? `SEBI months that do not reconcile: ${mfBad.slice(0, 4).join(', ')}` : `${mfStored.length} months of SEBI mutual fund trading, each adding up to its own total row` });
  const both = ex.filter(([, x]) => x.src.length > 1).length;
  if (ex.length) checks.push({ id: 'exch-both', ok: true, info: both < ex.length, detail: `${ex.length} trading days recorded since ${ex[0][0]}; ${both} confirmed by both NSE and BSE, ${ex.length - both} from one exchange` });
  return { exch: exchOff() ? null : { days: exDays.slice(-750), latest: lastEx, since: ex[0]?.[0] || null, errors: st.exch?.lastErrors || [] }, fpiDays, fpiUpTo: st.fpiDaily?.upTo || null, mfDays, mfAsOf: st.trade?.current?.asOf || null, months, years, fyears, checks,
    cols: { months: ['m', 'fpi', 'fpiPartial', 'mf', 'mfFinal', 'mfDays', 'fii', 'dii', 'exchDays'], years: ['y', 'fpi', 'fpiPartial', 'mf', 'mfMonths', 'fii', 'dii', 'exchDays'], fpiDays: ['d', 'eq', 'eqBuy', 'eqSell', 'viaExchanges', 'primary', 'debt', 'total', 'eqUsd'], mfDays: ['d', 'eqBuy', 'eqSell', 'eqNet', 'debtNet'], exch: ['d', 'fiiNet', 'diiNet', 'fiiBuy', 'fiiSell', 'diiBuy', 'diiSell', 'src'] } };
}
const isoDay = (s) => { const m = String(s).match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(20\d\d)/); if (!m) return null; const i = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase()); return i < 0 ? null : `${m[3]}-${String(i + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`; };

function nextDates(o) {
  const out = {};
  if (o.latest) { const nx = addMonths(o.latest, 1), rel = addMonths(nx, 1); out.amfi = { period: nx, window: `around 10–12 ${monthShort(rel).split(' ')[0]} ${rel.slice(0, 4)}` }; }
  if (o.sipAmfi?.latest) { const nx = addMonths(o.sipAmfi.latest, 1), rel = addMonths(nx, 1); out.sipAmfi = { period: nx, window: `around 10–12 ${monthShort(rel).split(' ')[0]} ${rel.slice(0, 4)}`, note: 'with AMFI’s monthly data' }; }
  if (o.sip.latest) out.sip = { period: addMonths(o.sip.latest, 1), note: 'usually several weeks after AMFI’s data' };
  if (o.league?.end) { const e = addMonths(o.league.end, 3), name = (p) => monthLabel(p).split(' ')[0]; out.fundwise = { period: `${name(addMonths(e, -2))} – ${name(e)} ${e.slice(0, 4)}`, when: monthLabel(addMonths(e, 1)) }; }
  return out;
}

function statusRows(st, o, docs, sebi) {
  const S = st.src || {}, rows = [];
  const state = (id) => { const s = S[id]; if (!s) return 'pending'; return s.ok ? 'live' : s.okAt ? 'last-good' : 'failed'; };
  const L = o.latest && docs[o.latest];
  const amfiChecks = L ? L.checks : [];
  const have = Object.keys(st.amfi.have || {}).length, bad = Object.entries(st.amfi.have || {}).filter(([, h]) => !h.coreOk).map(([m]) => m);
  rows.push({ id: 'amfi', name: 'AMFI monthly report', what: 'Category inflows, redemptions, AUM, folios, new fund offers', freq: 'Monthly, around the 10th–12th', latest: o.latest ? monthLabel(o.latest) : null, state: state('amfi') === 'pending' && o.latest ? 'live' : state('amfi'), at: S.amfi?.at || null, okAt: S.amfi?.okAt || null, error: S.amfi?.ok === false ? S.amfi.error : null,
    checks: amfiChecks, checksOk: amfiChecks.length > 0 && amfiChecks.every((c) => c.ok), note: `${o.months.length} months stored${bad.length ? `; ${bad.length} held back because checks failed (${bad.slice(-3).map(monthShort).join(', ')})` : ''}`, have });
  const A = o.sipAmfi, sipSt = state('sipPage');
  const crossChecks = (A?.cross || []).slice(-3).map((c) => ({ id: 'sebi-' + c.m, ok: c.ok, detail: `${monthLabel(c.m)}, AMFI vs SEBI: ${c.items.map((x) => `${x.k} ${x.amfi}${x.ok ? '' : ` vs ${x.sebi}`}`).join('; ')}${c.ok ? ' (all agree)' : ''}` }));
  rows.push({ id: 'sipPage', name: 'AMFI: SIP data page', what: 'SIP inflows by month since April 2016; SIP accounts and SIP assets this financial year', freq: 'Monthly, with AMFI’s data (around the 10th)', latest: A?.latest ? monthLabel(A.latest) : st.amfiSip?.latest ? monthLabel(st.amfiSip.latest) : null,
    state: sipSt, at: S.sipPage?.at || null, okAt: S.sipPage?.okAt || null, error: S.sipPage?.ok === false ? S.sipPage.error : null,
    checks: [...(A?.checks || st.amfiSip?.checks || []), ...crossChecks], checksOk: !!A && A.checks.every((c) => c.ok) && crossChecks.every((c) => c.ok),
    note: A ? (A.accOk ? null : 'Account figures for the latest month are held back: the accounts table did not pass its checks.') : st.amfiSip ? 'Not shown: the page did not pass its checks.' : null, src: A?.src || null });
  const sl = o.sip.latest, sx = sl && o.cross[sl];
  const crossTxt = Object.values(o.cross).slice(-3).map((c) => `${monthShort(c.period)}: AUM ${c.aum.ok}/${c.aum.n}, folios ${c.folios.ok}/${c.folios.n}${c.net.n ? `, net flows ${c.net.ok}/${c.net.n}` : ''} categories match`).join(' · ');
  rows.push({ id: 'sebi', name: 'SEBI monthly table (same report, with SIP)', what: 'SIP by category; independent copy used to cross-check AMFI', freq: 'Monthly, several weeks after AMFI', latest: Object.keys(sebi).length ? monthLabel(Object.keys(sebi).sort().pop()) : null, state: state('sebi') === 'pending' && Object.keys(sebi).length ? 'live' : state('sebi'), at: S.sebi?.at || S.sebiList?.at || null, okAt: S.sebi?.okAt || null, error: S.sebi?.ok === false ? S.sebi.error : S.sebiList?.ok === false ? S.sebiList.error : null,
    checks: sl ? o.sip.m[sl].checks : [], checksOk: sl ? o.sip.m[sl].checks.filter((c) => !c.info).every((c) => c.ok) : false, note: crossTxt || null, slips: sx?.sebiSlips || [] });
  rows.push({ id: 'nsdl', name: 'NSDL: foreign portfolio investors', what: 'FPI net investment by asset class', freq: 'Daily (next trading day); monthly totals', latest: o.fpi.upTo ? `to ${o.fpi.upTo}` : o.fpi.months.length ? monthLabel(o.fpi.months[o.fpi.months.length - 1]) : null, state: state('nsdl'), at: S.nsdl?.at || null, okAt: S.nsdl?.okAt || null, error: S.nsdl?.ok === false ? S.nsdl.error : null,
    checks: [...o.fpi.checks, ...(o.fpi.recon || []).map((r) => ({ id: 'fy-' + r.fy, ok: r.ok, detail: `FY ${r.fy}: monthly equity sums to ${IN(r.sumEq)} vs NSDL's financial-year table ${IN(r.fyEq)}` }))], checksOk: o.fpi.checks.length > 0 && o.fpi.checks.every((c) => c.ok) && (o.fpi.recon || []).every((r) => r.ok) });
  const tc = o.trade.current;
  rows.push({ id: 'trade', name: "SEBI: mutual funds' trading on exchanges", what: 'Funds’ purchases and sales of shares, this month', freq: 'Daily, published a few days later', latest: tc?.asOf ? `to ${dayLabel(tc.asOf)}` : null, state: state('trade'), at: S.trade?.at || null, okAt: S.trade?.okAt || null, error: S.trade?.ok === false ? S.trade.error : null, checks: st.trade?.current?.checks || [], checksOk: !!tc?.ok, note: 'This month, day by day; earlier months come from SEBI’s archive (see the month-by-month row)' });
  const lg = o.league;
  rows.push({ id: 'fundwise', name: 'AMFI: average AUM by fund house', what: 'League table of fund houses', freq: 'Quarterly, about a week after quarter-end', latest: lg?.period || null, state: state('fundwise'), at: S.fundwise?.at || null, okAt: S.fundwise?.okAt || null, error: S.fundwise?.ok === false ? S.fundwise.error : null,
    checks: lg?.check ? [{ id: 'aaum-sum', ok: lg.check.ok, detail: `fund houses add to ₹${IN(lg.total)} cr vs ₹${IN(lg.check.fromMonthly)} cr from AMFI's monthly reports (${pct(lg.check.diff, 2)})` }, ...(lg.cwCheck ? [{ id: 'catwise', ok: lg.cwCheck.matched >= lg.cwCheck.of * 0.9, detail: `AMFI's category-wise file matches ${lg.cwCheck.matched} of ${lg.cwCheck.of} fund-house totals` }] : [])] : [], checksOk: !!lg?.check?.ok,
    note: lg && !lg.eqFrom ? 'Share of active equity appears once AMFI’s category-wise file for the quarter is read; AMFI can take ~30 s to produce it, so the site retries.' : null });
  const bl = o.bif.months[o.bif.months.length - 1];
  rows.push({ id: 'bif', name: 'AMFI: direct plans by channel', what: 'Direct-plan AUM: self-directed, advisers, PMS', freq: 'Monthly', latest: bl ? monthLabel(bl) : null, state: state('bif'), at: S.bif?.at || null, okAt: S.bif?.okAt || null, error: S.bif?.ok === false ? S.bif.error : null, checks: bl ? [{ id: 'bif-sum', ok: st.bif[bl].ok !== false, detail: 'channels add up to the direct-plan total' }] : [], checksOk: !!bl && st.bif[bl].ok !== false });
  const I = o.inst, xl = I.exch?.latest;
  if (I.exch) rows.push({ id: 'exch', name: 'NSE and BSE: FII/FPI and DII trading (provisional)', what: 'Cash-market buying and selling by foreign and domestic institutions, latest trading day', freq: 'Each trading day, in the evening; no official archive, so the site records each day', latest: xl ? dayLabel(xl.d) : null, state: state('exch'), at: S.exch?.at || null, okAt: S.exch?.okAt || null, error: S.exch?.ok === false ? S.exch.error : null,
    checks: [...(xl ? [{ id: 'exch-arith', ok: true, detail: `${dayLabel(xl.d)}: buy − sell = net for FII/FPI and DII (checked before storing)` }, { id: 'exch-src', ok: true, info: xl.src.length < 2, detail: xl.src.length > 1 ? 'NSE and BSE published identical figures' : `only ${xl.src[0].toUpperCase()} answered${(I.exch.errors || []).length ? ` (${I.exch.errors.join(' · ')})` : ''}` }] : []), ...I.checks.filter((c) => c.id === 'exch-both')], checksOk: !!xl,
    note: I.exch.since ? `Recorded since ${dayLabel(I.exch.since)}` : 'Recording starts with the first run after deployment' });
  const fpiChecks = I.checks.filter((c) => c.id.startsWith('fpi-days-'));
  rows.push({ id: 'fpiDay', name: 'NSDL: FPI investment by reporting date', what: 'Final FPI figures for each day (equity via exchanges and primary market), last 13 months', freq: 'Daily, the morning after trading', latest: I.fpiUpTo ? dayLabel(I.fpiUpTo) : null, state: state('fpiDay') === 'live' && S.fpiArch?.ok === false ? 'live' : state('fpiDay'), at: S.fpiDay?.at || null, okAt: S.fpiDay?.okAt || null, error: S.fpiDay?.ok === false ? S.fpiDay.error : S.fpiArch?.ok === false ? 'archive: ' + S.fpiArch.error : null,
    checks: fpiChecks, checksOk: fpiChecks.length > 0 && fpiChecks.every((c) => c.ok), note: `${I.fpiDays.length} reporting dates stored` });
  const mfc = I.checks.find((c) => c.id === 'mf-months'), mfMonths = I.months.filter((r) => r[3] != null);
  rows.push({ id: 'mfArch', name: "SEBI: mutual funds' trading, month by month", what: 'Mutual funds’ net purchases of equity by day and month (archive)', freq: 'Monthly archive, read once per month; back to January 2016', latest: mfMonths.length ? monthLabel(mfMonths[mfMonths.length - 1][0]) : null, state: S.mfArch ? state('mfArch') : mfMonths.length ? 'live' : 'pending', at: S.mfArch?.at || null, okAt: S.mfArch?.okAt || null, error: S.mfArch?.ok === false ? S.mfArch.error : null,
    checks: mfc ? [mfc] : [], checksOk: !!mfc?.ok, note: mfMonths.length ? `${mfMonths.length} months stored, from ${monthLabel(mfMonths[0][0])}` : null });
  rows.push({ id: 'nfoOpen', name: 'AMFI: new fund offers open now', what: 'Schemes currently open for subscription', freq: 'As AMFI lists them', latest: st.nfoOpen?.at ? st.nfoOpen.at.slice(0, 10) : null, state: state('nfoOpen'), at: S.nfoOpen?.at || null, okAt: S.nfoOpen?.okAt || null, error: S.nfoOpen?.ok === false ? S.nfoOpen.error : null, checks: [], checksOk: true });
  return rows;
}
