// One update of the public Global Markets Monitor. It runs each background job when it is due (on the same schedule as
// the private site), builds every answer the page reads (/api/live, /api/macro, …) as a file in public/data/, checks
// every file (scripts/audit.mjs) and writes public/data/status.json. A source that fails keeps its last good file on the
// page, flagged. The GitHub workflow runs this every 10 minutes in Indian market hours and every 30 minutes otherwise.
import { mkdir, readFile, writeFile, rename, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { audit } from './audit.mjs';

process.env.STATE_DIR ||= 'state';
const STATE = process.env.STATE_DIR, OUT = 'public/data', KEEP = `${STATE}/published`;
const MIN = 60e3, H = 60 * MIN, t0 = Date.now(), now = () => new Date().toISOString();
// The whole update must finish well inside the workflow's 30-minute limit, so the site is always published.
const DEADLINE = t0 + 20 * MIN, left = () => DEADLINE - Date.now();
// REFRESH=all (a manual run: the Refresh button or "Run workflow"): every source is read again now, whatever its schedule.
const FORCE = process.env.REFRESH === 'all';
if (FORCE) console.log('Manual refresh: every source is read again now.');
const readJ = async (f) => { try { return JSON.parse(await readFile(f, 'utf8')); } catch { return null; } };
const writeJ = async (f, v) => { await writeFile(f + '.tmp', JSON.stringify(v)); await rename(f + '.tmp', f); };
const limit = (p, ms, what) => { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what}: no answer within ${ms / 1000} s`)), ms); })]).finally(() => clearTimeout(t)); };
const warn = (m) => console.log(`::warning::${m}`);
await mkdir(OUT, { recursive: true }); await mkdir(KEEP, { recursive: true });
const meta = (await readJ(`${STATE}/build-meta.json`)) || {};
meta.jobs ||= {}; meta.files ||= {};

// 1) Background jobs. The reference data and mutual fund engines check each of their sources on its own schedule; the
//    positioning and research builds run every 3 hours, as on the private site.
const { buildRefdata } = await import('../lib/refdata/build.mjs');
const { refreshMF } = await import('../lib/mf/engine.mjs');
const { buildPositioning } = await import('../lib/positioning.mjs');
const { refreshResearch } = await import('../lib/research.mjs');
async function job(id, every, fn) {
  const j = meta.jobs[id];
  if (!FORCE && j?.okAt && Date.now() - Date.parse(j.okAt) < every) return;
  const at = now();
  if (left() < 8 * MIN) { meta.jobs[id] = { ...j, error: 'skipped: this update ran long; it runs in the next one' }; warn(`${id}: skipped (time)`); return; }
  try { await limit(fn(), Math.min(8 * MIN, left() - 6 * MIN), id); meta.jobs[id] = { at, okAt: at, error: null }; }
  catch (e) { meta.jobs[id] = { at, okAt: j?.okAt || null, error: String(e.message || e).slice(0, 200) }; warn(`${id}: ${meta.jobs[id].error}`); }
}
await job('refdata', 0, () => buildRefdata({ mode: FORCE ? 'click' : 'scheduled', budgetMs: 2 * MIN }));
await job('mf', 0, () => refreshMF({ mode: 'batch', budgetMs: 6 * MIN, force: FORCE }));
await job('positioning', 3 * H, () => buildPositioning());
await job('research', 3 * H, () => refreshResearch());

// 2) Every answer the page reads, built by the same handler the private site uses. The minimum age matches the private
//    site's cache time, so sources are not asked more often than they are there; an answer that had to fall back on a
//    saved copy is rebuilt at the next update. Market prices are read last, so they are as recent as possible when the
//    site is published.
const ENDPOINTS = [['history', 3 * H], ['macro', 30 * MIN], ['positioning', 0], ['research', 0], ['refdata', 0], ['mf', 0], ['global', 0], ['markets', 0], ['live', 0]];
const partial = (id, b) => !!(b?.stale || (id === 'history' && Object.values(b?.series || {}).some((s) => s.stale)));
const D = {};
for (const [id, minAge] of ENDPOINTS) {
  const f = meta.files[id];
  if (!FORCE && minAge && f?.okAt && !f.partial && Date.now() - Date.parse(f.okAt) < minAge && existsSync(`${KEEP}/${id}.json`)) { D[id] = await readJ(`${KEEP}/${id}.json`); continue; }
  try {
    if (left() < 30e3) throw new Error('not rebuilt: this update ran out of time');
    const mod = await import(`../netlify/functions/${id}.mjs`);
    const res = await limit(mod.default(new Request(`https://public.local/api/${id}`)), Math.min(3 * MIN, left()), id);
    const body = await res.json();
    if (res.status >= 400 || body?.ok === false) throw new Error(body?.error || `HTTP ${res.status}`);
    D[id] = body; await writeJ(`${KEEP}/${id}.json`, body);
    meta.files[id] = { okAt: now(), error: null, partial: partial(id, body) };
  } catch (e) {
    meta.files[id] = { okAt: f?.okAt || null, at: now(), error: String(e.message || e).slice(0, 200) };
    D[id] = await readJ(`${KEEP}/${id}.json`); // the last good copy stays up; the audit marks it
    warn(`${id}: ${meta.files[id].error}${D[id] ? ' (last good copy kept)' : ''}`);
  }
}

// 3) The daily brief, composed from the data just built. The Investment view's day-by-day log ("what changed since last
//    week") is written once each weekday after 07:00 IST, as the private site does when it sends the brief.
globalThis.__GMM_DATA = D;
const { composeBrief } = await import('../lib/brief.mjs');
const ist = new Date(Date.now() + 5.5 * H), today = ist.toISOString().slice(0, 10), wd = ist.getUTCDay();
const writeLog = wd >= 1 && wd <= 5 && ist.getUTCHours() >= 7 && meta.viewLogDay !== today;
try {
  const b = await limit(composeBrief({ viewLogWrite: writeLog }), 2 * MIN, 'brief');
  if (!b?.ok) throw new Error(b?.error || 'brief not built');
  D.brief = b; await writeJ(`${KEEP}/brief.json`, b); meta.files.brief = { okAt: now(), error: null };
  if (writeLog) meta.viewLogDay = today;
} catch (e) {
  meta.files.brief = { okAt: meta.files.brief?.okAt || null, at: now(), error: String(e.message || e).slice(0, 200) };
  D.brief = await readJ(`${KEEP}/brief.json`); warn(`brief: ${meta.files.brief.error}`);
}

// 4) Publish: one file per answer (a feed that has never worked gets a short error file, so the page says so), then the
//    checks of every file.
for (const id of [...ENDPOINTS.map(([id]) => id), 'brief']) await writeJ(`${OUT}/${id}.json`, D[id] ?? { ok: false, error: meta.files[id]?.error || 'not built yet' });
const env = process.env, run = env.GITHUB_RUN_ID && env.GITHUB_REPOSITORY ? `${env.GITHUB_SERVER_URL || 'https://github.com'}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null;
const status = audit(D, { meta });
status.build = {
  at: now(), ms: Date.now() - t0, commit: env.GITHUB_SHA ? env.GITHUB_SHA.slice(0, 12) : null, manual: FORCE,
  branch: env.GITHUB_REF_NAME || null, workflow: 'update.yml',
  repoUrl: env.GITHUB_REPOSITORY ? `${env.GITHUB_SERVER_URL || 'https://github.com'}/${env.GITHUB_REPOSITORY}` : null,
  run: run ? { url: run, number: env.GITHUB_RUN_NUMBER || null } : null,
};
await writeJ(`${OUT}/status.json`, status);
await writeJ(`${STATE}/build-meta.json`, meta);

// 5) Run log: one line per feed; GitHub shows the warnings on the run's page.
console.log(`Built in ${((Date.now() - t0) / 1000).toFixed(1)} s · ${status.totals.passed} of ${status.totals.checks} checks passed`);
for (const f of status.feeds) {
  const bad = f.checks.filter((c) => !c.ok);
  console.log(`  ${f.state === 'ok' ? '✓' : '✗'} ${f.name}: ${f.state}${f.asOfText ? ` · as of ${f.asOfText}` : ''}${bad.length ? ` · ${bad.map((c) => c.detail).join('; ').slice(0, 300)}` : ''}`);
  if (f.state !== 'ok') warn(`${f.name}: ${f.state}${bad.length ? ` — ${bad[0].detail}` : ''}`);
}
if (env.GITHUB_STEP_SUMMARY) {
  const rows = status.feeds.map((f) => `| ${f.name} | ${f.state === 'ok' ? '✓ up to date' : f.state} | ${f.asOfText || '—'} | ${f.checks.filter((c) => c.ok).length}/${f.checks.length} | ${f.checks.filter((c) => !c.ok).map((c) => c.detail).join('; ').replace(/\|/g, '/').slice(0, 300)} |`);
  await appendFile(env.GITHUB_STEP_SUMMARY, [`### Data built ${status.build.at}`, `**${status.totals.passed} of ${status.totals.checks} checks passed**`, '', '| Feed | State | As of | Checks | Problems |', '|---|---|---|---|---|', ...rows, ''].join('\n'));
}

// Done. If an idle network connection still holds the process open after 10 s, end it.
setTimeout(() => process.exit(0), 10000).unref();
