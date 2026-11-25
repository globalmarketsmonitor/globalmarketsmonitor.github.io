// Opens a spreadsheet whatever its container. AMFI serves every monthly report under a .xls name, but the files up
// to June 2025 are really .xlsx (zip) and the later ones legacy .xls (OLE2). The bytes decide, not the name.
import { readXls } from './xls.mjs';
import { readXlsx } from './xlsx.mjs';

export function readWorkbook(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) return { ...readXls(b), format: 'xls' };
  if (b[0] === 0x50 && b[1] === 0x4B && b[2] === 3 && b[3] === 4) return { ...readXlsx(b), format: 'xlsx' };
  const head = new TextDecoder().decode(b.subarray(0, 64)).trim();
  throw new Error(head.startsWith('<') ? 'spreadsheet expected, got a web page' : 'unknown spreadsheet format');
}
