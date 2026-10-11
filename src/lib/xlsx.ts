import 'server-only';
import ExcelJS from 'exceljs';
import type { Grid, GridCell } from './grid';

const MAX_ROWS = 600;
const MAX_COLS = 80;
const MAX_SHEETS = 40;

/** ARGB like 'FFFF0000' → '#ff0000'; theme / indexed colours are ignored (they need the theme part). */
function argbToHex(argb: unknown): string | undefined {
  if (typeof argb !== 'string' || !/^[0-9a-f]{8}$/i.test(argb)) return undefined;
  return `#${argb.slice(2).toLowerCase()}`;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Excel datetimes carry no zone; ExcelJS materialises them as UTC, so read them back with getUTC*. */
function fromExcelDate(d: Date): Pick<GridCell, 't' | 'v' | 'text'> {
  const y = d.getUTCFullYear();
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  const isTimeOnly = y < 1901;
  const time = `${pad(hh)}:${pad(mm)}`;
  if (isTimeOnly) return { t: 'time', v: time, text: time };
  const date = `${y}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const hasTime = hh !== 0 || mm !== 0;
  const text = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${y}${hasTime ? ` ${time}` : ''}`;
  return { t: 'date', v: hasTime ? `${date}T${time}` : date, text };
}

function normaliseValue(value: ExcelJS.CellValue): Pick<GridCell, 't' | 'v' | 'text'> | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return fromExcelDate(value);
  if (typeof value === 'number') return { t: 'n', v: value, text: Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4))) };
  if (typeof value === 'boolean') return { t: 's', v: String(value), text: String(value).toUpperCase() };
  if (typeof value === 'string') {
    const text = value.replace(/\r\n?/g, '\n').trim();
    return text ? { t: 's', v: text, text } : null;
  }
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return normaliseValue(value.richText.map((r) => r.text).join(''));
    }
    if ('result' in value) return normaliseValue((value as { result?: ExcelJS.CellValue }).result ?? null);
    if ('text' in value && typeof (value as { text: unknown }).text === 'string') return normaliseValue((value as { text: string }).text);
    if ('error' in value) return null;
  }
  return null;
}

function decodeAddress(addr: string): [number, number] {
  const m = /^([A-Z]+)(\d+)$/.exec(addr);
  if (!m) throw new Error(`Bad cell address ${addr}`);
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return [Number(m[2]) - 1, col - 1];
}

export function encodeAddress(r: number, c: number): string {
  let col = '';
  let n = c + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return `${col}${r + 1}`;
}

function sheetToGrid(ws: ExcelJS.Worksheet): Grid {
  const rowCount = Math.min(ws.rowCount, MAX_ROWS);
  const colCount = Math.min(ws.columnCount, MAX_COLS);
  const cells: (GridCell | null)[][] = [];
  let maxR = -1;
  let maxC = -1;

  for (let r = 0; r < rowCount; r++) {
    const row = ws.getRow(r + 1);
    const out: (GridCell | null)[] = [];
    for (let c = 0; c < colCount; c++) {
      const cell = row.getCell(c + 1);
      const isSlave = cell.isMerged && cell.master.address !== cell.address;
      const base = normaliseValue(isSlave ? null : cell.value);
      const font = cell.font ?? {};
      const fill = cell.fill && cell.fill.type === 'pattern' && cell.fill.pattern === 'solid' ? argbToHex(cell.fill.fgColor?.argb) : undefined;
      const style: GridCell['style'] = {};
      if (font.bold) style.bold = true;
      if (font.italic) style.italic = true;
      if (font.strike) style.strike = true;
      const color = argbToHex(font.color?.argb);
      if (color && color !== '#000000') style.color = color;
      if (fill && fill !== '#ffffff') style.fill = fill;
      const hasStyle = Object.keys(style).length > 0;
      if (!base && !hasStyle) {
        out.push(null);
        continue;
      }
      out.push({ ...(base ?? { t: 'z', v: null, text: '' }), ...(hasStyle ? { style } : {}) });
      if (base) {
        maxR = Math.max(maxR, r);
        maxC = Math.max(maxC, c);
      }
    }
    cells.push(out);
  }

  const merges: Grid['merges'] = [];
  for (const range of (ws.model as { merges?: string[] }).merges ?? []) {
    const [a, b] = range.split(':');
    if (!a || !b) continue;
    const [r1, c1] = decodeAddress(a);
    const [r2, c2] = decodeAddress(b);
    if (r1 >= rowCount || c1 >= colCount) continue;
    merges.push({ r1, c1, r2: Math.min(r2, rowCount - 1), c2: Math.min(c2, colCount - 1) });
    maxR = Math.max(maxR, Math.min(r2, rowCount - 1));
  }

  const rows = maxR + 1;
  const cols = maxC + 1;
  return {
    name: ws.name.trim(),
    rows,
    cols,
    cells: cells.slice(0, rows).map((r) => r.slice(0, cols)),
    merges: merges.filter((m) => m.r1 < rows && m.c1 < cols).map((m) => ({ ...m, c2: Math.min(m.c2, cols - 1) })),
    hidden: ws.state !== 'visible',
  };
}

export async function readWorkbook(buffer: ArrayBuffer | Buffer): Promise<Grid[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as ArrayBuffer);
  } catch {
    throw new Error('This file could not be read as an Excel workbook (.xlsx).');
  }
  return wb.worksheets.slice(0, MAX_SHEETS).map(sheetToGrid);
}

export function looksLikeXlsx(buf: Uint8Array): boolean {
  // .xlsx files are zip archives: "PK\x03\x04"
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}
