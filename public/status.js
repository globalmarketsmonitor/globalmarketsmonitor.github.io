/* Public site only: says how fresh and how checked the data is. Reads data/status.json, written by the update job after
   it checks every feed (scripts/audit.mjs): the time the sources were last read, how many checks passed, a warning if
   updates are late, and the Data status table (every feed, its date, its checks). */
(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const link = (href, text) => { const a = el('a', null, text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; };
  const MIN = 60e3, H = 60 * MIN;
  const ist = (iso) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';
  const ago = (iso) => { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / MIN)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
  // Updates run every 10 minutes in Indian market hours and every 30 minutes otherwise; GitHub sometimes starts them late.
  const marketHours = () => { const t = new Date(Date.now() + 5.5 * H), d = t.getUTCDay(), m = t.getUTCHours() * 60 + t.getUTCMinutes(); return d >= 1 && d <= 5 && m >= 9 * 60 && m <= 16 * 60; };
  const LABEL = { ok: 'Up to date', stale: 'Needs attention', failed: 'Not available' };
  let S = null, loadErr = null, open = new Set();

  function frame() {
    const pill = $('pub-checked'), banner = $('pub-banner'), badge = $('pub-checks');
    const built = S?.build?.at || S?.at;
    const msgs = [];
    if (built) {
      const age = Date.now() - Date.parse(built), late = marketHours() ? 40 * MIN : 75 * MIN;
      pill.className = 'pill ' + (age > late ? 'warn' : 'live');
      pill.replaceChildren(el('span', 'dot'), el('span', null, `Data checked ${ago(built)}`));
      pill.title = `The sources were last read at ${ist(built)}`;
      if (age > 6 * H) msgs.push(['bad', `Updates have stopped: the sources were last read at ${ist(built)} (${ago(built)}). Figures may be out of date; each one shows the date it covers.`]);
      else if (age > late) msgs.push(['warn', `The latest update is late: the sources were last read at ${ist(built)} (${ago(built)}). Updates normally run every ${marketHours() ? 10 : 30} minutes and GitHub sometimes delays them.`]);
    }
    if (loadErr) msgs.push([S ? 'warn' : 'bad', `Could not load the data status (${loadErr}); retrying automatically.`]);
    if (job) msgs.unshift([job.kind || 'info', job.text]);
    banner.hidden = !msgs.length;
    banner.className = 'pub-banner ' + (msgs.some(([k]) => k === 'bad') ? 'bad' : 'warn');
    banner.replaceChildren(...msgs.map(([, t]) => el('p', null, t)));
    if (!S) return;
    const T = S.totals, attention = S.feeds.filter((f) => f.state !== 'ok');
    badge.hidden = false;
    badge.className = 'pill pub-badge ' + (attention.length ? 'warn' : 'ok');
    badge.replaceChildren(el('span', 'dot'), el('span', null, attention.length ? `${T.checks - T.passed} of ${T.checks} checks need attention (${attention.length} feed${attention.length > 1 ? 's' : ''})` : `All ${T.checks} checks passed`));
    badge.title = attention.length ? `Needs attention: ${attention.map((f) => f.name).join(', ')}` : 'Every feed is up to date and passed its checks';
  }

  function table() {
    if (!S) return;
    const t = $('tbl-ds'); t.replaceChildren();
    const th = el('thead'), hr = el('tr');
    for (const [h, c] of [['Feed', 'left'], ['Source', 'left ds-wide'], ['As of', 'left ds-wide'], ['State', 'left ds-wide'], ['Checks', 'ds-wide']]) hr.append(el('th', c, h));
    th.append(hr); t.append(th);
    const tb = el('tbody');
    for (const f of S.feeds) {
      const gated = f.checks.filter((c) => !c.info), passed = gated.filter((c) => c.ok).length, tr = el('tr', 'ds-row');
      // On a phone only the first cell shows; its second line carries the state, date and checks.
      const name = el('td', 'left ds-feed'); name.append(el('span', 'ds-name', f.name));
      const sub = el('span', 'ds-sub'); sub.append(el('span', 'ds-state ' + f.state, LABEL[f.state] || f.state), ` ${f.asOfText || '—'} · ${passed} of ${gated.length} checks`);
      name.append(sub);
      tr.append(name, el('td', 'left muted ds-wide', f.source), el('td', 'left ds-wide', f.asOfText || f.asOf || '—'));
      const st = el('td', 'left ds-wide'); st.append(el('span', 'ds-state ' + f.state, LABEL[f.state] || f.state)); tr.append(st);
      tr.append(el('td', 'ds-wide', `${passed} of ${gated.length}`));
      tr.tabIndex = 0; tr.setAttribute('aria-expanded', open.has(f.id) ? 'true' : 'false');
      const toggle = () => { open.has(f.id) ? open.delete(f.id) : open.add(f.id); table(); };
      tr.onclick = toggle; tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
      tb.append(tr);
      if (open.has(f.id)) {
        const dr = el('tr', 'drill'), td = el('td'); td.colSpan = 5;
        const ul = el('ul', 'mf-checks');
        for (const c of f.checks) { const li = el('li', c.info ? 'info' : c.ok ? 'ok' : 'bad'); li.append(el('i', null, c.info ? 'i' : c.ok ? '✓' : '✗'), el('span', null, c.detail)); ul.append(li); }
        td.append(ul); dr.append(td); tb.append(dr);
      }
    }
    t.append(tb);
    const b = S.build || {}, prov = $('ds-prov');
    prov.replaceChildren(`Built ${ist(b.at || S.at)}${b.ms ? ` in ${(b.ms / 1000).toFixed(0)} s` : ''}. `, ...(b.run?.url ? ['Every update is a public, automated job: ', link(b.run.url, `this update's log${b.run.number ? ` (#${b.run.number})` : ''}`), b.repoUrl ? ' · ' : '. '] : []), ...(b.repoUrl ? [link(b.repoUrl, 'the code it ran'), '.'] : []));
  }

  async function load() {
    try {
      const r = await fetch(`data/status.json?v=${Math.floor(Date.now() / 60e3)}&t=${Date.now() % 1e5}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      S = await r.json(); loadErr = null; table(); owner();
    } catch (e) { loadErr = String(e.message || e).slice(0, 60); }
    frame();
  }

  /* ---- Refresh on demand: the Refresh button starts a full update on GitHub when this browser holds the owner's token ---- */
  const KEY = 'gmm-gh-token';
  const keep = { get: () => { try { return localStorage.getItem(KEY); } catch { return null; } }, set: (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* storage blocked */ } } };
  const repo = () => { const m = String(S?.build?.repoUrl || '').match(/github\.com\/([^/]+)\/([^/?#]+)/); return m ? { owner: m[1], name: m[2], branch: S.build.branch || 'main', wf: S.build.workflow || 'update.yml' } : null; };
  const gh = (path, opts = {}) => fetch(`https://api.github.com/repos/${repo().owner}/${repo().name}${path}`, { ...opts, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${keep.get()}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  let job = null, internal = false, pollT = null;
  const clock = (t) => new Date(t).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';
  function owner() {
    const box = $('ds-owner'); if (!box) return;
    box.hidden = !repo() || !!window.GMM_PREVIEW;
    const st = $('ds-token-state'), on = !!keep.get();
    st.textContent = on ? 'Saved in this browser: Refresh reads every source now.' : 'No token saved: Refresh loads the newest published data.';
    $('refresh').title = on ? 'Read every source again now (about 2–4 minutes), then load the new data' : 'Load the most recently published data';
  }
  async function startRefresh() {
    const R = repo(); if (!R || !keep.get() || job?.running) return;
    const t = Date.now();
    job = { running: true, since: t, kind: 'info', text: `Refreshing: every source is being read again (started ${clock(t)}). The new data appears here in about 2–4 minutes.` }; frame();
    try {
      const r = await gh(`/actions/workflows/${R.wf}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: R.branch, inputs: { refresh: 'true' } }) });
      if (r.status !== 204) throw new Error(r.status === 401 || r.status === 403 || r.status === 404 ? 'GitHub did not accept the saved token' : `GitHub answered ${r.status}`);
      poll();
    } catch (e) { job = { kind: 'warn', text: `The refresh could not start: ${e.message}. The newest published data is shown; automatic updates continue.` }; frame(); }
  }
  async function poll() {
    clearTimeout(pollT);
    if (!job?.running) return;
    await load();
    const built = Date.parse(S?.build?.at || 0);
    if (built >= job.since - 5000 && S?.build?.manual) {
      job = { kind: 'info', text: `Refreshed: every source was read again; published ${clock(built)}.` };
      internal = true; try { $('refresh').click(); } finally { internal = false; } // the page reloads every feed it shows
      frame(); setTimeout(() => { if (job && !job.running) { job = null; frame(); } }, 120e3);
      return;
    }
    // Say what GitHub is doing while we wait.
    try {
      const r = await gh(`/actions/runs?event=workflow_dispatch&per_page=1`);
      const run = r.ok ? (await r.json()).workflow_runs?.[0] : null;
      if (run && Date.parse(run.created_at) >= job.since - 60e3) job.text = `Refreshing: ${run.status === 'queued' || run.status === 'waiting' || run.status === 'pending' ? 'waiting for GitHub to start the update' : run.status === 'completed' ? (run.conclusion === 'success' ? 'publishing the new data' : `the update ended (${run.conclusion}); the previous data stays up`) : 'reading every source'} (started ${clock(job.since)}).`;
      if (run?.status === 'completed' && run.conclusion !== 'success' && Date.parse(run.created_at) >= job.since - 60e3) { job = { kind: 'warn', text: job.text }; frame(); return; }
    } catch { /* progress is optional */ }
    if (Date.now() - job.since > 15 * 60e3) { job = { kind: 'warn', text: 'The refresh is taking longer than usual. The new data will appear here once GitHub publishes it.' }; frame(); return; }
    frame();
    pollT = setTimeout(poll, 15e3);
  }
  document.addEventListener('click', (e) => { if (!internal && e.target.closest?.('#refresh') && keep.get() && repo() && !window.GMM_PREVIEW) startRefresh(); }, true);
  const form = $('ds-token-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = $('ds-token').value.trim(), st = $('ds-token-state'); if (!v) return;
      keep.set(v); $('ds-token').value = '';
      st.textContent = 'Checking the token with GitHub…';
      try {
        const r = await gh(`/actions/workflows/${repo().wf}`);
        if (!r.ok) throw new Error(r.status);
        owner(); st.textContent = 'Saved and accepted by GitHub: Refresh now reads every source.';
      } catch (err) { keep.set(null); owner(); st.textContent = `GitHub did not accept this token for ${repo()?.owner}/${repo()?.name} (${err.message}). Nothing was saved.`; }
    });
    $('ds-token-clear').addEventListener('click', () => { keep.set(null); owner(); });
  }
  // "Data status" links scroll to the table without leaving the tab being read (the tabs use the address's #).
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href="#data-status"]'); if (!a) return;
    e.preventDefault(); $('data-status').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  load();
  setInterval(load, 5 * MIN);
  setInterval(frame, MIN); // keeps "checked … ago" and the warning current between loads
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
