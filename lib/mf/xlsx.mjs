// Minimal reader for Office Open XML workbooks (.xlsx). AMFI's monthly reports up to June 2025 are .xlsx files
// served under a .xls name (later ones are legacy .xls, see xls.mjs). Returns the same shape as readXls:
// { sheets: [{ name, hidden, rows }] } with raw cell values (numbers as numbers, text as text).
// Only Node's built-in zlib is used (to inflate the zip entries). Formatting, styles and drawings are ignored.
import { inflateRawSync } from 'node:zlib';

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const MAX_UNZIPPED = 64 * 1024 * 1024; // refuse absurd sizes (a corrupt or hostile file)

/* ---------------- zip container ---------------- */
export function zipEntries(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const stop = Math.max(0, b.length - 22 - 65535);
  let e = b.length - 22;
  while (e >= stop && u32(b, e) !== 0x06054b50) e--;
  if (e < stop) throw new Error('xlsx: zip directory not found');
  const n = u16(b, e + 10), cd = u32(b, e + 16);
  if (cd === 0xFFFFFFFF || cd >= b.length) throw new Error('xlsx: unsupported zip layout');
  const out = [], dec = new TextDecoder();
  for (let i = 0, p = cd; i < n; i++) {
    if (p + 46 > b.length || u32(b, p) !== 0x02014b50) throw new Error('xlsx: bad zip directory entry');
    const flags = u16(b, p + 8), method = u16(b, p + 10), csize = u32(b, p + 20), usize = u32(b, p + 24);
    const nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32), lh = u32(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    if (flags & 1) throw new Error('xlsx: encrypted entry ' + name);
    if (lh + 30 > b.length || u32(b, lh) !== 0x04034b50) throw new Error('xlsx: bad local header for ' + name);
    const start = lh + 30 + u16(b, lh + 26) + u16(b, lh + 28);
    if (start + csize > b.length) throw new Error('xlsx: truncated entry ' + name);
    out.push({ name, method, csize, usize, data: b.subarray(start, start + csize) });
  }
  return out;
}

/* ---------------- XML helpers (machine-written SpreadsheetML; no DTDs) ---------------- */
const XENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const unxml = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : XENT[e.toLowerCase()]));
const unesc = (s) => s.replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16))); // OOXML escapes, e.g. _x000D_
const attrs = (s) => { const o = {}; for (const m of String(s).matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) o[m[1]] = unxml(m[2] ?? m[3]); return o; };
const RPH = /<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g; // phonetic runs are not part of the text
const T = /<(?:\w+:)?t\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g;
const runText = (x) => { let s = ''; for (const m of String(x).replace(RPH, '').matchAll(T)) if (m[1]) s += unesc(unxml(m[1])); return s; };
function resolvePath(dir, target) {
  const out = [];
  for (const p of (target.startsWith('/') ? target.slice(1) : dir + target).split('/')) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
  return out.join('/');
}
function relsOf(getText, path) {
  const dir = path.replace(/[^/]*$/, ''), x = getText(dir + '_rels/' + path.slice(dir.length) + '.rels'), out = [];
  if (!x) return out;
  for (const m of x.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g)) {
    const a = attrs(m[1]);
    if (!a.Target || a.TargetMode === 'External') continue;
    out.push({ id: a.Id, type: String(a.Type || '').replace(/^.*\//, ''), target: resolvePath(dir, a.Target) });
  }
  return out;
}

/* ---------------- workbook ---------------- */
const colIdx = (s) => { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const KEY = 16384; // columns per row in SpreadsheetML
function sheetRows(x, sst) {
  const sd = x.match(/<(?:\w+:)?sheetData\b[^>]*?(?:\/>|>([\s\S]*)<\/(?:\w+:)?sheetData>)/);
  const cells = new Map();
  let maxR = -1, maxC = -1, row = -1;
  const put = (r, c, v) => { if (v === '' || v == null || (typeof v === 'number' && !Number.isFinite(v))) return; cells.set(r * KEY + c, v); if (r > maxR) maxR = r; if (c > maxC) maxC = c; };
  for (const rm of (sd?.[1] || '').matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const ra = attrs(rm[1]);
    row = ra.r ? +ra.r - 1 : row + 1;
    let col = -1;
    for (const cm of (rm[2] || '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const ca = attrs(cm[1]), ref = String(ca.r || '').match(/^\$?([A-Z]+)\$?(\d+)$/);
      col = ref ? colIdx(ref[1]) : col + 1;
      const r = ref ? +ref[2] - 1 : row, body = cm[2] || '', t = ca.t || 'n';
      const vm = body.match(/<(?:\w+:)?v\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?v>)/), v = vm ? unxml(vm[1] || '') : null;
      let val = null;
      if (t === 'inlineStr') { const is = body.match(/<(?:\w+:)?is\b[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/); val = is ? runText(is[1]) : null; }
      else if (v == null) val = null;
      else if (t === 's') val = sst[+v] ?? null;
      else if (t === 'str') val = unesc(v);
      else if (t === 'b') val = v === '1' || v === 'true';
      else if (t === 'e') val = null; // error values are skipped, as in readXls
      else if (t === 'd') { const ms = Date.parse(v); val = Number.isFinite(ms) ? (ms - EXCEL_EPOCH) / 864e5 : null; }
      else val = v.trim() === '' ? null : Number(v);
      put(r, col, val);
    }
  }
  const rows = [];
  for (let r = 0; r <= maxR; r++) {
    const a = [];
    for (let c = 0; c <= maxC; c++) a.push(cells.has(r * KEY + c) ? cells.get(r * KEY + c) : null);
    while (a.length && a[a.length - 1] == null) a.pop();
    rows.push(a);
  }
  return rows;
}

// getText(partPath) returns the part's text, or null when the package has no such part.
export function xlsxFromParts(getText) {
  const root = relsOf(getText, '').find((r) => r.type === 'officeDocument');
  const wbPath = root ? root.target : 'xl/workbook.xml';
  const wb = getText(wbPath);
  if (!wb) throw new Error('xlsx: workbook part missing');
  const rels = relsOf(getText, wbPath), byId = new Map(rels.map((r) => [r.id, r]));
  const ssPath = rels.find((r) => r.type === 'sharedStrings')?.target;
  const ssx = ssPath ? getText(ssPath) : null;
  const sst = ssx ? [...ssx.matchAll(/<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g)].map((m) => runText(m[1] || '')) : [];
  const sheets = [];
  for (const m of wb.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g)) {
    const a = attrs(m[1]), rid = Object.keys(a).find((k) => k.includes(':') && k.replace(/^.*:/, '') === 'id');
    const rel = rid ? byId.get(a[rid]) : null;
    if (!rel || rel.type !== 'worksheet') continue; // chart sheets etc. carry no cell values
    const x = getText(rel.target);
    if (x == null) throw new Error('xlsx: sheet part missing: ' + rel.target);
    sheets.push({ name: a.name || '', hidden: /hidden/i.test(a.state || ''), rows: sheetRows(x, sst) });
  }
  if (!sheets.length) throw new Error('xlsx: no worksheets');
  return { sheets };
}

export function readXlsx(buf) {
  const ents = new Map(zipEntries(buf).map((e) => [e.name.toLowerCase(), e]));
  let total = 0;
  return xlsxFromParts((path) => {
    const e = ents.get(path.toLowerCase());
    if (!e) return null;
    if (e.method !== 0 && e.method !== 8) throw new Error('xlsx: unsupported compression in ' + path);
    const raw = e.method === 0 ? e.data : inflateRawSync(e.data, { maxOutputLength: MAX_UNZIPPED });
    total += raw.length;
    if (total > MAX_UNZIPPED) throw new Error('xlsx: file too large');
    return new TextDecoder().decode(raw);
  });
}
