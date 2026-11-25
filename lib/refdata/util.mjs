// Date, time-zone and text helpers for the reference-data engine. All dates are ISO strings (YYYY-MM-DD, UTC).
import { get } from '../http.mjs';

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthIndex = (s) => { const k = String(s).slice(0, 3).toLowerCase(); return MON.findIndex((m) => m.toLowerCase() === k); };

export const iso = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10); // m is 0-based
export const parts = (s) => { const [y, m, d] = s.split('-').map(Number); return { y, m: m - 1, d }; };
export const dow = (s) => { const { y, m, d } = parts(s); return new Date(Date.UTC(y, m, d)).getUTCDay(); };
export const addDays = (s, n) => { const { y, m, d } = parts(s); return iso(y, m, d + n); };
export const today = () => new Date().toISOString().slice(0, 10);
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
export const nthWeekday = (y, m, wd, n) => { const first = new Date(Date.UTC(y, m, 1)).getUTCDay(); return iso(y, m, 1 + ((wd - first + 7) % 7) + 7 * (n - 1)); };
export const lastWeekday = (y, m, wd) => { const dl = daysInMonth(y, m), last = new Date(Date.UTC(y, m, dl)).getUTCDay(); return iso(y, m, dl - ((last - wd + 7) % 7)); };
export const fmtDM = (s) => { const { m, d } = parts(s); return `${d} ${MON[m]}`; };
export const monthName = (y, m) => `${MON[((m % 12) + 12) % 12]}`;
export const isWeekend = (s) => { const w = dow(s); return w === 0 || w === 6; };
export const nextWorkday = (s, hol = new Set()) => { let x = s; while (isWeekend(x) || hol.has(x)) x = addDays(x, 1); return x; };
export const prevWorkday = (s, hol = new Set()) => { let x = s; while (isWeekend(x) || hol.has(x)) x = addDays(x, -1); return x; };
export const nthWorkday = (y, m, n, hol = new Set()) => { let x = iso(y, m, 1), k = 0; for (;;) { if (!isWeekend(x) && !hol.has(x)) { k++; if (k === n) return x; } x = addDays(x, 1); } };
export const lastWorkday = (y, m, hol = new Set()) => prevWorkday(iso(y, m, daysInMonth(y, m)), hol);

// Gregorian Easter (anonymous algorithm).
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(y, month - 1, day);
}

// NYSE holidays by its published rules (weekend observance: Saturday → Friday, Sunday → Monday; New Year's Day on a Saturday is not moved).
export function nyseHolidays(y) {
  const obs = (s) => (dow(s) === 6 ? addDays(s, -1) : dow(s) === 0 ? addDays(s, 1) : s);
  const out = new Map();
  const ny = iso(y, 0, 1); if (dow(ny) !== 6) out.set(dow(ny) === 0 ? addDays(ny, 1) : ny, 'New Year’s Day');
  out.set(nthWeekday(y, 0, 1, 3), 'Martin Luther King Jr. Day');
  out.set(nthWeekday(y, 1, 1, 3), 'Presidents’ Day');
  out.set(addDays(easter(y), -2), 'Good Friday');
  out.set(lastWeekday(y, 4, 1), 'Memorial Day');
  out.set(obs(iso(y, 5, 19)), 'Juneteenth');
  out.set(obs(iso(y, 6, 4)), 'Independence Day');
  out.set(nthWeekday(y, 8, 1, 1), 'Labor Day');
  out.set(nthWeekday(y, 10, 4, 4), 'Thanksgiving');
  out.set(obs(iso(y, 11, 25)), 'Christmas');
  return out;
}
// US federal holidays (used by BLS and ISM business days): NYSE list minus Good Friday, plus Columbus and Veterans Day.
export function usFederalHolidays(y) {
  const out = new Map([...nyseHolidays(y)].filter(([, n]) => n !== 'Good Friday'));
  const ny = iso(y, 0, 1); if (dow(ny) === 6) out.set(addDays(ny, -1), 'New Year’s Day (observed)');
  out.set(nthWeekday(y, 9, 1, 2), 'Columbus Day');
  const v = iso(y, 10, 11); out.set(dow(v) === 6 ? addDays(v, -1) : dow(v) === 0 ? addDays(v, 1) : v, 'Veterans Day');
  return out;
}

/* ---------- time zones (DST rules) ---------- */
// US: 2nd Sunday of March to 1st Sunday of November. EU/UK: last Sunday of March to last Sunday of October.
export const usDST = (s) => { const { y } = parts(s); return s >= nthWeekday(y, 2, 0, 2) && s < nthWeekday(y, 10, 0, 1); };
export const euDST = (s) => { const { y } = parts(s); return s >= lastWeekday(y, 2, 0) && s < lastWeekday(y, 9, 0); };
// Convert a local clock time to IST. Returns e.g. '19:00 IST' or '00:30 IST (19 Nov)' when the IST date is the next day.
export function toIST(s, hhmm, utcOffsetHours) {
  const [h, m] = hhmm.split(':').map(Number);
  let mins = h * 60 + m - utcOffsetHours * 60 + 330, day = s;
  while (mins >= 1440) { mins -= 1440; day = addDays(day, 1); }
  while (mins < 0) { mins += 1440; day = addDays(day, -1); }
  const t = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')} IST`;
  return day === s ? t : `${t} (${fmtDM(day)})`;
}
export const usTime = (s, hhmm) => `${hhmm} ET · ${toIST(s, hhmm, usDST(s) ? -4 : -5)}`;
export const ecbTime = (s) => `14:15 ${euDST(s) ? 'CEST' : 'CET'} · ${toIST(s, '14:15', euDST(s) ? 2 : 1)}`;
export const boeTime = (s) => `12:00 ${euDST(s) ? 'BST' : 'GMT'} · ${toIST(s, '12:00', euDST(s) ? 1 : 0)}`;
export const BOJ_TIME = 'Around midday JST · ~08:30 IST';
export const CN_TIME = '09:30 Beijing · 07:00 IST';
export const IN_4PM = '16:00 IST';

/* ---------- text and fetching ---------- */
export const decode = (s) => String(s).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&#8217;/g, '’').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
export const strip = (s) => decode(String(s).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
export async function fetchText(url, { timeout = 8000, headers = {} } = {}) {
  const r = await get(url, { timeout, headers });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.text();
}
export async function fetchJSON(url, { timeout = 8000, headers = {} } = {}) {
  const r = await get(url, { timeout, headers: { Accept: 'application/json', ...headers } });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
}
