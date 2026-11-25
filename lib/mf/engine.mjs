// Mutual fund data engine: checks each official source on its own schedule, stores every month separately in
// Netlify Blobs, keeps a month only if AMFI's own totals add up, and rebuilds the tab's data after each run.
// A new AMFI month, a new month on AMFI's SIP page and a new SEBI SIP month send alerts through the brief's
// Telegram/email channels.
import * as SRC from './sources.mjs';
import { saveLastGood, loadLastGood } from '../sources.mjs';
import { deliver, channels } from '../notify.mjs';
import { assembleAll, alertText, sipAlertText, CORE_CHECKS } from './assemble.mjs';
import { addMonths } from './taxonomy.mjs';

const H = 3600e3, MIN = 60e3, KEEP = 36;
const DAY_MONTHS = 13, MF_FROM = '2016-01', FPI_FROM = 2016; // day-by-day history kept; mutual fund and FPI history from
const istDay = () => +new Date(Date.now() + 5.5 * H).toISOString().slice(8, 10);
const istHour = () => +new Date(Date.now() + 5.5 * H).toISOString().slice(11, 13);
const istMonth = () => new Date(Date.now() + 5.5 * H).toISOString().slice(0, 7);
// [scheduled, click]. AMFI's index is checked hourly in its usual release window (7th–16th).
const TTL = () => ({
  index: [istDay() >= 7 && istDay() <= 16 ? H : 4 * H, 15 * MIN], sebiList: [6 * H, H], nsdl: [3 * H, 20 * MIN], nsdlHist: [7 * 24 * H, 7 * 24 * H],
  nsdlFy: [24 * H, 6 * H], trade: [3 * H, 20 * MIN], fundwise: [24 * H, 6 * H], nfoOpen: [6 * H, H],
  sipPage: [istDay() >= 7 && istDay() <= 16 ? H : 6 * H, 15 * MIN], // AMFI's SIP page updates with its monthly data
  exch: [istHour() >= 17 ? 45 * MIN : 6 * H, 15 * MIN], // the exchanges post each day's FII/DII figures in the evening (IST)
  fpiDay: [3 * H, 30 * MIN],
});
// Batch runs (GitHub Actions on the public site) have minutes, not seconds, so the light sources are re-checked hourly.
const TTL_BATCH = () => ({
  index: [istDay() >= 7 && istDay() <= 16 ? H : 3 * H], sipPage: [istDay() >= 7 && istDay() <= 16 ? H : 3 * H],
  nsdl: [H], fpiDay: [H], trade: [H], nfoOpen: [3 * H], sebiList: [6 * H],
});
// MF_EXCHANGES=off (the public site): the exchanges' FII/DII figures are not fetched, stored or shown.
export const exchangesOn = () => !(typeof process !== 'undefined' && process.env?.MF_EXCHANGES === 'off');
// The timer is cleared as soon as the work settles, so a finished run never waits on a leftover timeout.
const withTimeout = (p, ms) => { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`timed out after ${Math.round(ms / 1000)} s`)), ms); })]).finally(() => clearTimeout(t)); };
const blank = () => ({ v: 1, src: {}, amfi: { have: {}, fail: {} }, sebi: { have: {}, paths: {}, fail: {} }, fpi: { years: {} }, trade: { months: {}, daily: {}, fail: {} }, bif: {}, alerts: {}, exch: { days: {} }, fpiDaily: { days: {}, months: {}, fail: {} } });
// Compact day records: NSDL [equity, buy, sell, via exchanges, primary market, debt, total, equity US$ m]; SEBI [buy, sell, net, debt net].
const putFpiDays = (st, days) => { for (const x of days) st.fpiDaily.days[x.d] = [x.eq, x.eqBuy, x.eqSell, x.eqSE, x.eqPM, x.debt, x.total, x.eqUsd]; };
const putMfDays = (st, days) => { for (const x of days) st.trade.daily[x.d] = [x.eqBuy ?? null, x.eqSell ?? null, x.eqNet ?? null, x.dNet ?? null]; };
const monthRec = (t, extra = {}) => ({ asOf: t.asOf, eqNet: t.total?.eqNet ?? null, eqBuy: t.total?.eqBuy ?? null, eqSell: t.total?.eqSell ?? null, dNet: t.total?.dNet ?? null, days: t.days.length, ok: t.checks.every((c) => c.ok), ...extra });

let MEM = null; const DOCS = new Map();
export async function loadState() {
  if (MEM) return MEM;
  const b = await loadLastGood('mf-state');
  return (MEM = { ...blank(), ...(b?.value || {}) });
}
export async function loadDoc(kind, m) {
  const k = `mf-${kind}-${m}`;
  if (DOCS.has(k)) return DOCS.get(k);
  const v = (await loadLastGood(k))?.value || null;
  if (v) DOCS.set(k, v);
  return v;
}
async function saveDoc(kind, m, v) { DOCS.set(`mf-${kind}-${m}`, v); await saveLastGood(`mf-${kind}-${m}`, v); }

let OUT = null;
export async function getMF() { if (OUT) return OUT; return (OUT = (await loadLastGood('mf-out'))?.value || null); }

// Months to keep: AMFI's index if available, otherwise the last 36 calendar months.
function wanted(st) {
  const idx = (st.amfi.index || []).map((x) => x.period);
  if (idx.length) return idx.slice(0, KEEP);
  const ym = new Date(Date.now() + 5.5 * H).toISOString().slice(0, 7);
  return Array.from({ length: KEEP }, (_, k) => addMonths(ym, -(k + 1)));
}

export async function refreshMF({ mode = 'scheduled', budgetMs = 25000, force = false } = {}) {
  const t0 = Date.now(), left = () => budgetMs - (Date.now() - t0), click = mode === 'click' ? 1 : 0, batch = mode === 'batch';
  const st = await loadState(), T = batch ? { ...TTL(), ...TTL_BATCH() } : TTL(), now = () => new Date().toISOString();
  st.exch ||= { days: {} }; st.fpiDaily ||= { days: {}, months: {}, fail: {} }; st.trade.daily ||= {}; st.trade.fail ||= {}; // sites deployed before these existed
  // A source is read again once its time-to-live has passed; one whose last attempt failed is tried again within the hour
  // (the fund-house table, which can take 15 s, every 3 hours, so a slow AMFI doesn't eat every hourly run's time).
  const RETRY = { fundwise: 3 * H };
  const due = (id) => { const s = st.src[id]; if (force || !s?.at) return true; const ttl = T[id][click]; return Date.now() - Date.parse(s.at) > (s.ok === false ? Math.min(ttl, RETRY[id] || H) : ttl); };
  const touched = [], newAmfi = [], newSebi = [], newSipAmfi = [];
  async function run(id, fn, cap = Infinity) {
    const prev = st.src[id] || {}, at = now();
    try { await withTimeout(fn(), Math.max(1500, Math.min(cap, left() - 600))); st.src[id] = { ok: true, at, okAt: at }; }
    catch (e) {
      const error = String(e.message || e).slice(0, 220);
      // A click that runs out of its short time is not a failure: the source is tried again, and the hourly run has more time.
      if (!(click && /^timed out/.test(error))) st.src[id] = { ok: false, at, okAt: prev.okAt || null, error };
    }
    touched.push(id);
  }
  // Light checks get a few seconds each on a click (so AMFI's report, which fills the tab, still has time) and at most
  // 10 s on the hourly run, so one slow or blocked site cannot hold up the rest.
  const CAP1 = click ? 3000 : batch ? 45000 : 10000;
  // 1) Light checks, in parallel.
  await Promise.all([
    due('index') && run('index', async () => { st.amfi.index = await SRC.amfiIndex(); }, CAP1),
    due('sebiList') && run('sebiList', async () => { // SEBI lists every table since 2020; only the last 14 months are used
      const l = await SRC.sebiListing(), floor = addMonths(l.map((x) => x.period).sort().pop(), -13);
      for (const x of l) if (x.period >= floor) st.sebi.paths[x.period] = x.path;
      for (const m of Object.keys(st.sebi.paths)) if (m < floor) { delete st.sebi.paths[m]; delete st.sebi.have[m]; }
    }, CAP1),
    due('nsdl') && run('nsdl', async () => { Object.assign(st.fpi.years, await SRC.nsdlYears()); }, CAP1),
    due('trade') && run('trade', async () => {
      const t = await SRC.sebiTrade(); st.trade.current = t;
      if (!st.trade.months[t.month]?.final) st.trade.months[t.month] = monthRec(t);
      if (t.checks.every((c) => c.ok)) putMfDays(st, t.days);
    }, CAP1),
    // Exchanges' FII/DII figures for the latest trading day: NSE and BSE publish the same combined numbers and keep no
    // archive, so each day is recorded as it comes. When both answer for a day they must agree to the paisa.
    exchangesOn() && due('exch') && run('exch', async () => {
      const per = click ? 2500 : 6000; // each exchange on its own clock: if one hangs, the other's figures are still used
      const got = await Promise.allSettled([withTimeout(SRC.nseFiiDii(), per), withTimeout(SRC.bseFiiDii(), per)]);
      const res = got.map((g) => (g.status === 'fulfilled' ? g.value : null)), errs = got.map((g, i) => (g.status === 'rejected' ? `${['NSE', 'BSE'][i]}: ${String(g.reason?.message || g.reason).slice(0, 90)}` : res[i].ok ? null : `${['NSE', 'BSE'][i]}: ${res[i].checks.filter((c) => !c.ok).map((c) => c.detail).join('; ').slice(0, 120)}`)).filter(Boolean);
      const good = res.filter((x) => x && x.ok);
      st.exch.lastErrors = errs;
      if (!good.length) throw new Error(errs.join(' · ') || 'no exchange answered');
      const byDate = {}; for (const x of good) (byDate[x.date] ||= []).push(x);
      for (const [d, xs] of Object.entries(byDate)) {
        if (xs.length === 2 && ['fii', 'dii'].some((k) => ['buy', 'sell', 'net'].some((f) => Math.abs(xs[0][k][f] - xs[1][k][f]) > 0.02))) throw new Error(`NSE and BSE give different figures for ${d}; neither is stored until they agree`);
        const prev = st.exch.days[d], x = xs[0];
        const changed = prev && ['fii', 'dii'].some((k) => Math.abs(prev[k].net - x[k].net) > 0.02);
        st.exch.days[d] = { fii: x.fii, dii: x.dii, src: [...new Set([...(prev?.src || []), ...xs.map((y) => y.src)])].sort(), at: prev?.at || now(), seen: now(), ...(changed ? { revisedFrom: { fii: prev.fii.net, dii: prev.dii.net } } : prev?.revisedFrom ? { revisedFrom: prev.revisedFrom } : {}) };
      }
    }, CAP1),
    // NSDL: FPI investment by reporting date, this month (final figures, a day after trading).
    due('fpiDay') && run('fpiDay', async () => {
      let p; try { p = await SRC.nsdlDailyCurrent(); } catch (e) { if (/no reporting dates/.test(e.message)) return; throw e; } // first days of a month
      if (!p.ok) throw new Error('NSDL daily figures failed their checks: ' + p.checks.filter((c) => !c.ok).map((c) => c.detail).join('; ').slice(0, 160));
      putFpiDays(st, p.days); st.fpiDaily.upTo = p.upTo;
      for (const m of new Set(p.days.map((x) => x.d.slice(0, 7)))) if (!st.fpiDaily.months[m]?.final) st.fpiDaily.months[m] = { n: p.days.filter((x) => x.d.startsWith(m)).length, at: now() };
    }, CAP1),
    due('nfoOpen') && run('nfoOpen', async () => { st.nfoOpen = { at: now(), list: await SRC.amfiNfoOpen() }; }, CAP1),
    due('sipPage') && run('sipPage', async () => { // used only when its own checks pass; account history is kept as months pass
      const p = await SRC.amfiSip();
      if (!p.gate) throw new Error('AMFI SIP page failed its checks: ' + p.checks.filter((c) => !c.ok).map((c) => c.detail).join('; ').slice(0, 200));
      if (p.latest > (st.amfiSip?.latest || '')) newSipAmfi.push(p.latest);
      st.sipDet = { ...(st.sipDet || {}), ...(p.accOk ? p.details : {}) };
      st.amfiSip = p;
    }, CAP1),
    // Fund houses' average AUM changes once a quarter and AMFI's API is slow from overseas servers, so it is read on the
    // hourly runs only, with more time than the other sources (its requests go out in parallel), never on a click.
    !click && due('fundwise') && run('fundwise', async () => { st.fundwise = await SRC.amfiFundwise(2); }, batch ? 60000 : 15000),
  ].filter(Boolean));

  // Self-repair (hourly and batch runs): a stored month whose saved copy cannot be read, lost or damaged, is read again
  // from the official source instead of quietly dropping out of the page. The copies are cached for step 8 anyway.
  if (!click) {
    for (const m of Object.keys(st.amfi.have)) if (!(await loadDoc('amfi', m))) { delete st.amfi.have[m]; console.warn(`AMFI ${m}: saved copy missing, reading it again`); }
    for (const m of Object.keys(st.sebi.have)) if (!(await loadDoc('sebi', m))) { delete st.sebi.have[m]; console.warn(`SEBI ${m}: saved copy missing, reading it again`); }
  }

  // 2) AMFI monthly reports: newest missing months first, then history (36 months), three at a time.
  const want = wanted(st), idx = new Map((st.amfi.index || []).map((x) => [x.period, x.xls]));
  // A month that timed out is tried again after 20 minutes; one that failed for another reason after 2 hours (6 on a click).
  const retry = (m) => { const f = st.amfi.fail[m]; return !f || Date.now() - Date.parse(f.at) > (/^timed out/.test(f.error || '') ? 20 * MIN : click ? 6 * H : 2 * H); };
  const queue = want.filter((m) => !st.amfi.have[m] && retry(m)).slice(0, click ? 3 : batch ? KEEP : 15);
  for (let i = 0; i < queue.length && left() > 4500; i += 3) {
    await Promise.all(queue.slice(i, i + 3).map(async (m) => {
      try {
        const rec = await withTimeout(SRC.amfiMonth(m, idx.get(m) || SRC.amfiXlsUrl(m)), Math.max(2500, left() - 900));
        const failed = rec.checks.filter((c) => !c.ok).map((c) => c.id), coreOk = !failed.some((id) => CORE_CHECKS.includes(id));
        await saveDoc('amfi', m, rec);
        st.amfi.have[m] = { seen: now(), fmt: rec.fmt, coreOk, failed };
        delete st.amfi.fail[m];
        if (coreOk) newAmfi.push(m);
        st.src.amfi = { ok: coreOk, at: now(), okAt: coreOk ? now() : st.src.amfi?.okAt || null, error: coreOk ? null : `${m}: checks failed (${failed.join(', ')})` };
      } catch (e) {
        const error = String(e.message || e).slice(0, 200);
        if (click && /^timed out/.test(error)) return; // a click that ran out of time is not a failure: tried again next time
        st.amfi.fail[m] = { at: now(), error };
        // A month not yet on AMFI's server (pattern fallback) is not an error.
        if (!/HTTP 404/.test(st.amfi.fail[m].error)) st.src.amfi = { ok: false, at: now(), okAt: st.src.amfi?.okAt || null, error: `${m}: ${st.amfi.fail[m].error}` };
      }
    }));
  }
  for (const m of Object.keys(st.amfi.have)) if (!want.includes(m) && Object.keys(st.amfi.have).length > KEEP) delete st.amfi.have[m];

  // 3) SEBI monthly tables (current financial year as listed by SEBI): any period not stored, newest first.
  // A table that fails (a broken link, say) is retried after 12 hours rather than on every run.
  st.sebi.fail ||= {};
  const sebiTodo = Object.keys(st.sebi.paths).sort().reverse().filter((m) => !st.sebi.have[m] && (!st.sebi.fail[m] || Date.now() - Date.parse(st.sebi.fail[m].at) > 12 * H)).slice(0, click ? 2 : batch ? 14 : 8);
  for (const m of sebiTodo) {
    if (left() < 4000) break;
    await run('sebi', async () => {
      try {
        const rec = await SRC.sebiMcr(st.sebi.paths[m]);
        if (rec.period !== m) throw new Error(`${st.sebi.paths[m]} shows ${rec.period}`);
        await saveDoc('sebi', m, rec);
        st.sebi.have[m] = { at: now(), sip: rec.sip, sipOk: (rec.sipChecks || []).filter((c) => !c.info).every((c) => c.ok) };
        delete st.sebi.fail[m];
        newSebi.push(m);
      } catch (e) { st.sebi.fail[m] = { at: now(), error: String(e.message || e).slice(0, 160) }; throw e; }
    });
  }

  // 4) NSDL history (once a week) and its financial-year table (daily), for the reconciliation check.
  const y = new Date().getUTCFullYear();
  // Years back to 2016 are read once (for the year-wise table); the last two are read again each week in case of revisions.
  const fpiMissing = Array.from({ length: Math.max(0, y - FPI_FROM) }, (_, k) => y - 1 - k).filter((yy) => !st.fpi.years[yy]);
  if ((due('nsdlHist') || fpiMissing.length) && left() > 6000) await run('nsdlHist', async () => { // one year at a time, so one bad year doesn't lose the others
    const errs = [];
    for (const yy of [...new Set([...(due('nsdlHist') ? [y - 1, y - 2] : []), ...fpiMissing])]) { if (left() < 3500) break; try { Object.assign(st.fpi.years, await SRC.nsdlYears([yy])); } catch (e) { errs.push(`${yy}: ${e.message || e}`); } }
    if (errs.length) throw new Error(errs.join('; ').slice(0, 220));
  });
  if (due('nsdlFy') && left() > 3500) await run('nsdlFy', async () => { st.fpi.fy = await SRC.nsdlFy(); });

  // 5) Direct plans by channel: latest months first; months AMFI has not posted yet are retried later.
  const bifNeed = want.slice(0, 25).filter((m) => !st.bif[m] || (st.bif[m].pending && Date.now() - Date.parse(st.bif[m].at) > (click ? 3 * H : 12 * H)));
  for (const m of bifNeed.slice(0, click ? 2 : batch ? 25 : 10)) {
    if (left() < 3000) break;
    await run('bif', async () => { const b = await SRC.amfiBifurcation(m); st.bif[m] = b ? { ...b, at: now() } : { pending: true, at: now() }; });
  }

  // 6) Fund houses by asset class: one large AMFI file per quarter, scheduled runs only. AMFI can take ~30 s to build it
  //    the first time it is asked for (afterwards it is served in a few seconds), so a run that times out retries 2 h later.
  const q = Array.isArray(st.fundwise) && st.fundwise[0], cwFailAt = st.src.catwise && !st.src.catwise.ok ? Date.parse(st.src.catwise.at) : 0;
  if (!click && q && st.catwise?.end !== q.end && left() > 8000 && Date.now() - cwFailAt > 2 * H) await run('catwise', async () => { st.catwise = await SRC.amfiCategorywise(q); });

  // 7) Day-by-day history from the archives, scheduled runs only, newest month first: NSDL (FPIs, last 13 months) and
  //    SEBI (mutual funds: days for the last 13 months, month totals back to 2016). A month is read once more after it
  //    ends, so its last days are final; a month that fails is retried after 12 hours.
  if (!click) {
    const cur = istMonth(), back = (n) => Array.from({ length: n }, (_, k) => addMonths(cur, -(k + 1)));
    const again = (fail, m) => !fail[m] || Date.now() - Date.parse(fail[m].at) > 12 * H;
    const fpiTodo = back(DAY_MONTHS).filter((m) => !st.fpiDaily.months[m]?.final && again(st.fpiDaily.fail, m)).slice(0, batch ? DAY_MONTHS : 3);
    for (const m of fpiTodo) {
      if (left() < 6000) break;
      await run('fpiArch', async () => {
        try {
          const p = await SRC.nsdlDailyMonth(m);
          if (!p.ok) throw new Error(`${m}: failed its checks (${p.checks.filter((c) => !c.ok).map((c) => c.id).join(', ')})`);
          putFpiDays(st, p.days); st.fpiDaily.months[m] = { n: p.days.length, at: now(), final: true }; delete st.fpiDaily.fail[m];
        } catch (e) { st.fpiDaily.fail[m] = { at: now(), error: String(e.message || e).slice(0, 160) }; throw e; }
      });
    }
    const nMf = (+cur.slice(0, 4) - +MF_FROM.slice(0, 4)) * 12 + (+cur.slice(5) - +MF_FROM.slice(5));
    const mfTodo = back(nMf).filter((m) => !st.trade.months[m]?.final && again(st.trade.fail, m)).slice(0, batch ? 36 : 6);
    for (const m of mfTodo) {
      if (left() < 4500) break;
      await run('mfArch', async () => {
        try {
          const t = await SRC.sebiTradeMonth(m);
          if (!t.checks.every((c) => c.ok)) throw new Error(`${m}: failed its checks (${t.checks.filter((c) => !c.ok).map((c) => c.id).join(', ')})`);
          st.trade.months[m] = monthRec(t, { final: true });
          if (m >= addMonths(cur, -DAY_MONTHS)) putMfDays(st, t.days);
          delete st.trade.fail[m];
        } catch (e) { st.trade.fail[m] = { at: now(), error: String(e.message || e).slice(0, 160) }; throw e; }
      });
    }
    const floorDay = addMonths(cur, -DAY_MONTHS) + '-01';
    for (const d of Object.keys(st.fpiDaily.days)) if (d < floorDay) delete st.fpiDaily.days[d];
    for (const d of Object.keys(st.trade.daily)) if (d < floorDay) delete st.trade.daily[d];
  }

  // 8) Rebuild the tab's data, alert on anything new, save.
  const out = await assembleAll(st, loadDoc);
  out.run = { mode, ms: Date.now() - t0, touched, newAmfi, newSebi, newSipAmfi };
  OUT = out;
  await saveLastGood('mf-out', out);
  await maybeAlert(st, out, newAmfi, newSebi, newSipAmfi).catch((e) => { st.alerts.error = String(e.message || e).slice(0, 160); });
  MEM = st;
  await saveLastGood('mf-state', st);
  return out;
}

async function maybeAlert(st, out, newAmfi, newSebi, newSipAmfi = []) {
  const ch = channels(), sa = out.sipAmfi?.latest || null;
  if (!out.latest) return;
  // First run after deployment: remember where we are without sending (the backfill is not news).
  if (!st.alerts.base) { st.alerts = { base: new Date().toISOString(), amfi: out.latest, sip: out.sip.latest, sipAmfi: sa }; return; }
  if (sa && !st.alerts.sipAmfi) st.alerts.sipAmfi = sa; // first sight of AMFI's SIP page (e.g. after this update): record it, don't resend old news
  if (!ch.telegram && !ch.email) { st.alerts.amfi = out.latest; st.alerts.sip = out.sip.latest; st.alerts.sipAmfi = sa; return; }
  if (out.latest > (st.alerts.amfi || '') && newAmfi.includes(out.latest)) {
    const a = alertText(out); st.alerts.amfiSent = { at: new Date().toISOString(), period: out.latest, r: await deliver(a.subject, a.text, a.html) }; st.alerts.amfi = out.latest;
    if (sa === out.latest) st.alerts.sipAmfi = sa; // that message already carried the month's SIP figures
  }
  // AMFI's SIP figures for a month (when they land after the monthly report), then SEBI's split by category weeks later.
  if (sa && sa > (st.alerts.sipAmfi || '') && newSipAmfi.includes(sa)) {
    const a = sipAlertText(out, 'amfi'); st.alerts.sipAmfiSent = { at: new Date().toISOString(), period: sa, r: await deliver(a.subject, a.text, a.html) }; st.alerts.sipAmfi = sa;
  }
  if (out.sip.latest && out.sip.latest > (st.alerts.sip || '') && newSebi.includes(out.sip.latest)) {
    const a = sipAlertText(out, 'sebi'); st.alerts.sipSent = { at: new Date().toISOString(), period: out.sip.latest, r: await deliver(a.subject, a.text, a.html) }; st.alerts.sip = out.sip.latest;
  }
}

// For local tests and previews: preload parsed documents without network access.
export function _seed({ state, docs } = {}) { if (state) MEM = { ...blank(), ...state }; for (const [k, v] of Object.entries(docs || {})) DOCS.set(k, v); OUT = null; }
