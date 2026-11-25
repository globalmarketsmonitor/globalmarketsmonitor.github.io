# Global Markets Monitor — public edition

The same dashboard as the private site — all ten tabs (Overview, World markets, Beyond Equities, Valuations,
Growth & inflation, Liquidity & risk, India, Mutual funds, Investment view, Calendar) — published free on GitHub Pages.
No server, no account to log in to, no monthly bill.

## How it stays accurate and current

- **Original sources first.** Every figure is read from its publisher wherever the publisher offers it: NSE, NSE Indices,
  AMFI, SEBI, NSDL, BSE, RBI, US Treasury, the New York Fed, the Federal Reserve (via the St. Louis Fed's FRED), OECD,
  BIS, CFTC, Bundesbank, Bank of England, Japan's Ministry of Finance, IMF and the central banks' own calendars. Copies
  (DBnomics) are used only as a fallback, and the page says when. Market prices without a free publisher feed (world
  indices, ETFs, futures, currencies) come from Yahoo Finance; Siblis Research supplies month-end index P/E.
- **Cross-checked.** The index valuation history (indexpe.in) is compared day by day with NSE Indices' own P/E, P/B and
  dividend yield, and NSE Indices' figures are used; the Fed balance sheet from FRED must match the Fed's own series;
  the Nifty 50 from NSE must match Yahoo's.
- **Updated on a schedule.** GitHub runs `scripts/build.mjs` every 10 minutes in Indian market hours (Monday to Friday,
  08:33–16:23 IST) and every 30 minutes at other times. Each run reads the sources that are due, rebuilds the data the
  page shows, checks it and publishes the site. Slow-moving sources are read on their own cycle (for example AMFI every
  hour in its release window).
- **Every feed checked, every update.** `scripts/audit.mjs` checks each of the ~20 feeds: is it as recent as its source
  publishes (live NSE data within 30 minutes while the market is open; daily, weekly and monthly series within their
  release cycle), is every value plausible, and do independent sources agree (Nifty 50 from NSE against Yahoo). The
  result is the **Data status** table at the foot of every tab and the badge at the top of the page.
- **Nothing silently out of date.** If a source fails, the last good copy stays on the page, marked *Needs attention*
  with the reason and its date. If updates stop altogether, a red banner says so. Every update's log is public (linked
  from Data status).

## One-time setup (about 10 minutes)

1. **Create a free organization, then the repository in it**, so the address carries the organization's name rather
   than your username. Profile picture → **Your organizations → New organization → Free** → choose the name (it becomes
   the address) → *My personal account* → **Next** → skip inviting members. Then, in the organization: **New repository**
   → name it exactly `<organization>.github.io` → **Public** → tick **Add a README file** → **Create repository**.
   The site's address will be `https://<organization>.github.io/`. (Public is required for free GitHub Pages; nothing
   secret is in it.) Before uploading anything, open your own **Settings → Emails** and tick **Keep my email addresses
   private**.
2. **Switch on Pages.** In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Upload the files.** **Add file → Upload files** → drag in everything from this folder, including the `.github`
   folder → **Commit changes**. On a Mac, press Cmd+Shift+. in Finder to see `.github`.
   Check the file list shows `.github`. If it does not: **Add file → Create new file**, type the name
   `.github/workflows/update.yml`, paste the contents of `update.yml` from this folder's `.github/workflows`, commit.
4. **Wait for the first run.** The upload starts it. Open the **Actions** tab: the first run reads every source from
   scratch and takes about 10 minutes. When it shows a green tick, the site is at
   `https://<organization>.github.io/` (also shown under Settings → Pages).

That is all. From then on it updates by itself.

## Optional

- **FRED** (credit spreads, financial conditions, GDPNow) and **Siblis Research** (daily month-end PE): add keys under
  **Settings → Secrets and variables → Actions → New repository secret**, named `FRED_API_KEY` and `SIBLIS_API_KEY`.
  Secrets are never shown in the code or the logs.
- **Refresh on demand (the Refresh button).** Without setup, Refresh loads the newest published data. To make it read
  every source at once (about 2–4 minutes), create a token on GitHub: profile picture → **Settings → Developer settings →
  Personal access tokens → Fine-grained tokens → Generate new token** → Resource owner: **the organization** →
  Repository access: *Only select repositories* → this repository → Permissions: **Actions: Read and write** →
  Generate. If GitHub asks for approval, approve it in the organization's **Settings → Personal access tokens**. On the site, open **Data status → Refresh
  button: read every source on demand**, paste it, **Save**. It stays in that browser only; repeat on each device you use.
- **Update now without the site:** Actions tab → *Update data and publish* → **Run workflow** (reads every source).

## Things to know

- **Freshness of live prices.** GitHub runs the update every 10 minutes in market hours, but it can start runs late
  when it is busy (often 5–15 minutes). The top of the page always says when the sources were last read.
- **The schedule.** GitHub switches off scheduled runs in a public repository after 60 days without activity; the
  update job re-enables itself on every run so this does not happen. If updates ever stop, the page shows a red
  banner: open the Actions tab and press **Enable workflow**.
- **Stored data** lives on the `data-state` branch (one commit, replaced every run). Do not edit it. If it is deleted,
  the next run simply reads everything from the sources again.
- **Hand-maintained inputs**, as on the private site: Siblis month-end figures (`lib/config.mjs`, without a Siblis key)
  and the India 10-year fallback (`lib/macro-config.mjs`). Data status flags them when they go out of date.
- **Data permissions.** NSE, Yahoo Finance, Siblis Research, indexpe.in and MSCI each set terms on republishing their
  data; a public site should be checked against them.
- **Investment view.** Model positions shown publicly in India can fall under SEBI's Research Analyst rules. For
  information only; not investment advice.

## Files

| Path | What it does |
|---|---|
| `public/` | The page (same as the private site) plus `status.js` (freshness strip, Data status table) |
| `public/data/` | Created by each run: one file per feed and `status.json` (not stored in the repository) |
| `netlify/functions/` | The data builders the page reads, the same as on the private site (run here by the build script) |
| `lib/` | Source readers, parsers, checks and the mutual fund engine (same as the private site) |
| `scripts/build.mjs` | One update: runs what is due, builds every feed, keeps last good copies, writes `status.json` |
| `scripts/audit.mjs` | The checks behind Data status |
| `.github/workflows/update.yml` | The schedule, and the steps that store the data and publish the site |
