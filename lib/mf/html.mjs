// Small HTML table reader for SEBI and NSDL pages: tables → rows → cell text. Handles nested tables, colspan,
// unclosed cells and common entities. Not a general HTML parser; it only needs the data tables those pages publish.

const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—', hellip: '…', rupee: '₹' };
export function decode(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
export const textOf = (h) => decode(String(h || '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// Returns [{ rows: [[{t, cs, rs}...]...] }] in document order (inner tables after their parent opens).
export function htmlTables(html) {
  html = String(html || '');
  const tables = [], stack = []; // one frame per open table: { t, cell }
  const re = /<(\/?)(table|tr|td|th)\b([^>]*)>/gi;
  const closeCell = (f, end) => {
    if (!f?.cell) return;
    if (!f.t.rows.length) f.t.rows.push([]);
    f.t.rows[f.t.rows.length - 1].push({ t: textOf(html.slice(f.cell.start, end)), cs: f.cell.cs, rs: f.cell.rs });
    f.cell = null;
  };
  let m;
  while ((m = re.exec(html))) {
    const close = m[1] === '/', tag = m[2].toLowerCase(), attrs = m[3] || '';
    if (tag === 'table') {
      if (!close) { const f = { t: { rows: [] }, cell: null }; tables.push(f.t); stack.push(f); }
      else if (stack.length) closeCell(stack.pop(), m.index); // a parent's open cell stays open and later includes this table's text
      continue;
    }
    const f = stack[stack.length - 1];
    if (!f) continue;
    if (tag === 'tr') { closeCell(f, m.index); if (!close) f.t.rows.push([]); continue; }
    if (close) { closeCell(f, m.index); continue; }
    closeCell(f, m.index); // an unclosed previous cell ends where the next one starts
    const cs = +(attrs.match(/colspan\s*=\s*["']?(\d+)/i)?.[1] || 1), rs = +(attrs.match(/rowspan\s*=\s*["']?(\d+)/i)?.[1] || 1);
    f.cell = { start: m.index + m[0].length, cs, rs };
  }
  return tables.map((t) => ({ rows: t.rows.filter((r) => r.length) }));
}

// Plain grid: colspans expanded with empty cells, rowspans copied down (so each row has positional cells).
export function grid(table) {
  const out = [], carry = [];
  for (const r of table.rows) {
    const row = []; let c = 0;
    const take = () => { while (carry[c] && carry[c].n > 0) { row[c] = carry[c].t; carry[c].n--; c++; } };
    for (const cell of r) { take(); row[c] = cell.t; if (cell.rs > 1) carry[c] = { t: cell.t, n: cell.rs - 1 }; for (let k = 1; k < cell.cs; k++) row[c + k] = ''; c += cell.cs; }
    take();
    out.push(row.map((v) => v ?? ''));
  }
  return out;
}

// Numbers as AMFI/SEBI/NSDL print them: "1,23,456.78", "(6890.69)" = negative, "-" = nil, "## 161" = 161 (footnote marker).
export function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  let s = String(v).replace(/[#*]/g, '').replace(/[,\s₹]/g, '').trim();
  if (!s) return null;
  if (/^[-–—]$/.test(s)) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}
