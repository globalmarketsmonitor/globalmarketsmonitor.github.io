// Minimal reader for legacy Excel (.xls, BIFF8 inside an OLE2 compound file), the format of AMFI's monthly reports.
// Returns every sheet as a grid of raw cell values (numbers as numbers, text as text), like a spreadsheet export.
// No dependencies: only the records needed to read values are decoded (shared strings, labels, numbers, RK/MULRK,
// cached formula results, booleans). Formatting, dates and styles are ignored.

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const i32 = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
const f64 = (b, o) => new DataView(b.buffer, b.byteOffset + o, 8).getFloat64(0, true);
const ENDCHAIN = 0xFFFFFFFE, FREESECT = 0xFFFFFFFF;

/* ---------------- OLE2 / compound file ---------------- */
function cfbStream(buf, wanted) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u32(b, 0) !== 0xE011CFD0 || u32(b, 4) !== 0xE11AB1A1) throw new Error('xls: not an OLE2 compound file');
  const ss = 1 << u16(b, 0x1E), mss = 1 << u16(b, 0x20);
  const nFat = u32(b, 0x2C), dir0 = u32(b, 0x30), cutoff = u32(b, 0x38), mini0 = u32(b, 0x3C), nMini = u32(b, 0x40);
  let difat = u32(b, 0x44), nDifat = u32(b, 0x48);
  const sec = (i) => { const o = (i + 1) * ss; if (o >= b.length) throw new Error('xls: sector out of range'); return b.subarray(o, Math.min(o + ss, b.length)); };
  // FAT sector list: 109 entries in the header, the rest in the DIFAT chain.
  const fatSecs = [];
  for (let k = 0; k < 109 && fatSecs.length < nFat; k++) { const s = u32(b, 0x4C + 4 * k); if (s !== FREESECT) fatSecs.push(s); }
  for (let guard = 0; difat !== ENDCHAIN && difat !== FREESECT && nDifat-- > 0 && guard < 10000; guard++) {
    const d = sec(difat), per = ss / 4 - 1;
    for (let k = 0; k < per && fatSecs.length < nFat; k++) { const s = u32(d, 4 * k); if (s !== FREESECT) fatSecs.push(s); }
    difat = u32(d, 4 * per);
  }
  const fat = [];
  for (const s of fatSecs) { const d = sec(s); for (let k = 0; k < ss / 4; k++) fat.push(u32(d, 4 * k)); }
  const chain = (start, table) => { const out = []; const seen = new Set(); for (let s = start; s !== ENDCHAIN && s !== FREESECT && s < table.length; s = table[s]) { if (seen.has(s)) throw new Error('xls: sector loop'); seen.add(s); out.push(s); } return out; };
  const readChain = (start, size) => { const parts = chain(start, fat).map(sec); const out = new Uint8Array(parts.length * ss); parts.forEach((p, k) => out.set(p, k * ss)); return size != null ? out.subarray(0, size) : out; };
  // Directory
  const dir = readChain(dir0);
  const entries = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nl = u16(dir, o + 0x40); if (!nl) { entries.push(null); continue; }
    let name = ''; for (let k = 0; k < nl / 2 - 1; k++) name += String.fromCharCode(u16(dir, o + 2 * k));
    entries.push({ name, type: dir[o + 0x42], start: u32(dir, o + 0x74), size: u32(dir, o + 0x78) });
  }
  const root = entries[0];
  const ent = entries.find((e) => e && e.type === 2 && wanted.includes(e.name));
  if (!ent) throw new Error('xls: no Workbook stream (found: ' + entries.filter(Boolean).map((e) => e.name).join(', ') + ')');
  if (ent.size >= cutoff) return readChain(ent.start, ent.size);
  // Small stream: lives in the mini stream (root entry's data), addressed by the mini FAT.
  const minifat = []; for (const s of chain(mini0, fat).slice(0, nMini)) { const d = sec(s); for (let k = 0; k < ss / 4; k++) minifat.push(u32(d, 4 * k)); }
  const ministream = readChain(root.start, root.size);
  const ms = chain(ent.start, minifat); const out = new Uint8Array(ms.length * mss);
  ms.forEach((m, k) => out.set(ministream.subarray(m * mss, (m + 1) * mss), k * mss));
  return out.subarray(0, ent.size);
}

/* ---------------- BIFF8 records ---------------- */
function* records(w, start = 0) {
  for (let o = start; o + 4 <= w.length;) {
    const type = u16(w, o), len = u16(w, o + 2);
    yield { type, off: o, data: w.subarray(o + 4, o + 4 + len) };
    o += 4 + len;
  }
}

// Reads Unicode strings that may continue across CONTINUE records (each continuation restarts with a flags byte
// when it falls inside the characters of a string).
class Segs {
  constructor(parts) { this.p = parts; this.i = 0; this.o = 0; }
  left() { return this.p[this.i] ? this.p[this.i].length - this.o : 0; }
  next() { this.i++; this.o = 0; }
  byte() { while (this.left() <= 0) { if (this.i >= this.p.length) throw new Error('xls: string past end'); this.next(); } return this.p[this.i][this.o++]; }
  bytes(n) { const out = new Uint8Array(n); for (let k = 0; k < n; k++) out[k] = this.byte(); return out; }
  u16() { const a = this.byte(); return a | (this.byte() << 8); }
  u32() { const a = this.u16(); return (a | (this.u16() << 16)) >>> 0; }
  skip(n) { while (n > 0) { if (this.left() <= 0) { this.next(); continue; } const k = Math.min(n, this.left()); this.o += k; n -= k; } }
  chars(cch, high) {
    let s = '';
    while (cch > 0) {
      if (this.left() <= 0) { this.next(); high = this.byte() & 1; continue; } // continuation: new flags byte
      if (high) { if (this.left() < 2) { const lo = this.byte(); const hi = this.byte(); s += String.fromCharCode(lo | (hi << 8)); cch--; continue; } const p = this.p[this.i]; s += String.fromCharCode(p[this.o] | (p[this.o + 1] << 8)); this.o += 2; }
      else { s += String.fromCharCode(LATIN1[this.p[this.i][this.o]]); this.o++; }
      cch--;
    }
    return s;
  }
  // XLUnicodeRichExtendedString (SST entries)
  rich() {
    const cch = this.u16(), fl = this.byte(), high = fl & 1;
    const cRun = fl & 8 ? this.u16() : 0, cbExt = fl & 4 ? this.u32() : 0;
    const s = this.chars(cch, high);
    if (cRun) this.skip(4 * cRun);
    if (cbExt) this.skip(cbExt);
    return s;
  }
}
// Windows-1252 code points for bytes 0x80–0x9F; everything else maps 1:1 (Latin-1).
const LATIN1 = Array.from({ length: 256 }, (_, k) => k);
[0x20AC, 0x81, 0x201A, 0x192, 0x201E, 0x2026, 0x2020, 0x2021, 0x2C6, 0x2030, 0x160, 0x2039, 0x152, 0x8D, 0x17D, 0x8F, 0x90, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x2DC, 0x2122, 0x161, 0x203A, 0x153, 0x9D, 0x17E, 0x178]
  .forEach((c, k) => { LATIN1[0x80 + k] = c; });

function shortStr(d, o) { // ShortXLUnicodeString (sheet names): cch u8, flags u8
  const cch = d[o], high = d[o + 1] & 1; let s = '';
  for (let k = 0; k < cch; k++) s += high ? String.fromCharCode(u16(d, o + 2 + 2 * k)) : String.fromCharCode(LATIN1[d[o + 2 + k]]);
  return s;
}
function rk(v) {
  let n;
  if (v & 2) n = v >> 2; // signed 30-bit integer
  else { const dv = new DataView(new ArrayBuffer(8)); dv.setUint32(0, 0, true); dv.setUint32(4, v & 0xFFFFFFFC, true); n = dv.getFloat64(0, true); }
  return v & 1 ? n / 100 : n;
}

export function readXls(buf) {
  const w = cfbStream(buf, ['Workbook', 'Book']);
  // Globals: sheet directory and shared strings.
  const sheets = []; let sst = [];
  const it = records(w);
  let first = true;
  for (const r of it) {
    if (first) { if (r.type !== 0x0809) throw new Error('xls: workbook does not start with BOF'); first = false; continue; }
    if (r.type === 0x0085) sheets.push({ off: u32(r.data, 0), hidden: r.data[4], kind: r.data[5], name: shortStr(r.data, 6) });
    else if (r.type === 0x00FC) {
      const parts = [r.data.subarray(8)];
      const total = u32(r.data, 4);
      let o = r.off + 4 + r.data.length;
      while (o + 4 <= w.length && u16(w, o) === 0x003C) { const len = u16(w, o + 2); parts.push(w.subarray(o + 4, o + 4 + len)); o += 4 + len; }
      const S = new Segs(parts); sst = new Array(total);
      for (let k = 0; k < total; k++) { try { sst[k] = S.rich(); } catch { sst.length = k; break; } }
    } else if (r.type === 0x000A) break; // end of globals
  }
  const out = [];
  for (const sh of sheets) {
    if (sh.kind !== 0) continue; // worksheets only (no charts, macros)
    const cells = new Map(); let maxR = -1, maxC = -1, pendingStr = null;
    const put = (row, col, v) => { if (v === '' || v == null) return; cells.set(row * 65536 + col, v); if (row > maxR) maxR = row; if (col > maxC) maxC = col; };
    let seenBof = false;
    for (const r of records(w, sh.off)) {
      const d = r.data;
      if (r.type === 0x0809) { if (seenBof) break; seenBof = true; continue; }
      if (r.type === 0x000A) break;
      switch (r.type) {
        case 0x00FD: put(u16(d, 0), u16(d, 2), sst[u32(d, 6)] ?? null); break;                                   // LABELSST
        case 0x0203: put(u16(d, 0), u16(d, 2), f64(d, 6)); break;                                                // NUMBER
        case 0x027E: put(u16(d, 0), u16(d, 2), rk(u32(d, 6))); break;                                            // RK
        case 0x00BD: { const row = u16(d, 0), c0 = u16(d, 2), n = (d.length - 6) / 6;                            // MULRK
          for (let k = 0; k < n; k++) put(row, c0 + k, rk(u32(d, 4 + 6 * k + 2))); break; }
        case 0x0204: { const S = new Segs([d.subarray(6)]); const cch = S.u16(), fl = S.byte(); put(u16(d, 0), u16(d, 2), S.chars(cch, fl & 1)); break; } // LABEL
        case 0x0205: if (d[7] === 0) put(u16(d, 0), u16(d, 2), !!d[6]); break;                                   // BOOLERR (errors skipped)
        case 0x0006: {                                                                                             // FORMULA (cached result)
          const row = u16(d, 0), col = u16(d, 2);
          if (u16(d, 12) === 0xFFFF) { const t = d[6]; if (t === 0) pendingStr = [row, col]; else if (t === 1) put(row, col, !!d[8]); }
          else put(row, col, f64(d, 6));
          break; }
        case 0x0207: if (pendingStr) { const parts = [d]; let o = r.off + 4 + d.length; while (o + 4 <= w.length && u16(w, o) === 0x003C) { const len = u16(w, o + 2); parts.push(w.subarray(o + 4, o + 4 + len)); o += 4 + len; }
          const S = new Segs(parts); const cch = S.u16(), fl = S.byte(); put(pendingStr[0], pendingStr[1], S.chars(cch, fl & 1)); pendingStr = null; } break; // STRING
        default: break;
      }
    }
    const rows = [];
    for (let rr = 0; rr <= maxR; rr++) {
      const row = []; for (let cc = 0; cc <= maxC; cc++) row.push(cells.has(rr * 65536 + cc) ? cells.get(rr * 65536 + cc) : null);
      while (row.length && row[row.length - 1] == null) row.pop();
      rows.push(row);
    }
    out.push({ name: sh.name, hidden: !!sh.hidden, rows });
  }
  return { sheets: out };
}

// Same normalisation the parsers use: text trimmed with inner whitespace collapsed; empty strings dropped.
export function normRows(rows) {
  return rows.map((r) => { const a = r.map((v) => (typeof v === 'string' ? (v.replace(/\s+/g, ' ').trim() || null) : v)); while (a.length && a[a.length - 1] == null) a.pop(); return a; });
}
