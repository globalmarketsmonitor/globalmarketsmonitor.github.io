import { UA } from './config.mjs';

export async function get(url, { timeout = 9000, headers = {}, ...opts } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, { ...opts, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers }, signal: ctrl.signal, redirect: 'follow' });
  } finally { clearTimeout(timer); }
}

// Collect cookies from a response into a "name=value; ..." header string.
export function cookiesFrom(res, prev = '') {
  const jar = new Map(prev.split(/;\s*/).filter(Boolean).map((c) => c.split(/=(.*)/s).slice(0, 2)));
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const c of list) { const [kv] = c.split(';'); const i = kv.indexOf('='); if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); }
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}

// JSON response with browser + Netlify CDN caching.
export function json(body, { cdn = 60, swr = 300, status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': `public, durable, s-maxage=${cdn}, stale-while-revalidate=${swr}`,
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export const num = (v) => { const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : v; return Number.isFinite(n) ? n : null; };
