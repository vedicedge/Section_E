import { resolver, type Grid, type GridCell } from '../grid';
import { WEEKDAYS, weekdayOf, todayISO } from '../time';

/**
 * Heuristic reader for college timetables. It never assumes fixed coordinates; instead it looks for
 *  1. a "slot axis": a header row (or column) containing ≥2 time ranges such as "9:00 – 10:15",
 *  2. the other axis: dates / weekdays (or section letters) along the opposite edge,
 *  3. how sections are separated: a "Section" column, section-labelled header columns, section
 *     block headings, per-section sheets, or "Sec E:" markers inside cells.
 * When it cannot isolate the requested section with confidence it says so (detection.ok = false) and
 * the UI falls back to rendering the official sheet as-is, rather than guessing.
 */

export const PARSER_VERSION = 3;

export type SessionStatus = 'scheduled' | 'cancelled' | 'rescheduled' | 'extra' | 'exam';

export interface Session {
  id: string;
  /** Stable identity for change detection: date-or-weekday + start time. */
  key: string;
  date: string | null;
  day: (typeof WEEKDAYS)[number] | null;
  start: string | null;
  end: string | null;
  slotLabel: string;
  text: string;
  subject: string | null;
  faculty: string | null;
  room: string | null;
  status: SessionStatus;
  sheet: string;
  cell: string;
}

export interface Detection {
  ok: boolean;
  summary: string;
  sheets: string[];
  orientation?: 'slots-across' | 'slots-down';
  sectionMode?: 'column' | 'header' | 'block' | 'sheet' | 'cell' | 'none';
}

export interface ParsedTimetable {
  parserVersion: number;
  sheets: Grid[];
  sessions: Session[];
  detection: Detection;
  warnings: string[];
}

/* ------------------------------------------------------------------ helpers */

const pad = (n: number) => String(n).padStart(2, '0');

function to24(h: number, m: number, ampm: string | undefined, inferPm: boolean): [number, number] {
  const marker = ampm?.toLowerCase().replace(/\./g, '');
  if (marker === 'pm' && h < 12) h += 12;
  if (marker === 'am' && h === 12) h = 0;
  if (!marker && inferPm && h >= 1 && h <= 7) h += 12; // a 1–7 o'clock lecture is in the afternoon
  return [h, m];
}

const TIME_RANGE_RE =
  /(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|to|till)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i;

export function parseTimeRange(text: string): { start: string; end: string } | null {
  const m = TIME_RANGE_RE.exec(text);
  if (!m) return null;
  const [, h1, m1, ap1, h2, m2, ap2] = m;
  // Require something time-like (minutes or am/pm) so "12-10" (a date) is not read as a time.
  if (m1 === undefined && m2 === undefined && !ap1 && !ap2) return null;
  const sh = Number(h1);
  const eh = Number(h2);
  if (sh > 23 || eh > 23) return null;
  let [a, b] = to24(sh, Number(m1 ?? 0), ap1 ?? (ap2 && sh <= eh ? ap2 : undefined), true);
  let [c, d] = to24(eh, Number(m2 ?? 0), ap2, true);
  if (c * 60 + d <= a * 60 + b && c < 12) c += 12;
  if (c * 60 + d <= a * 60 + b) return null;
  if ((c * 60 + d) - (a * 60 + b) > 5 * 60) return null;
  return { start: `${pad(a)}:${pad(b)}`, end: `${pad(c)}:${pad(d)}` };
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** Picks the year that puts a yearless date closest to today (timetables span the current term). */
function nearestYear(month: number, day: number, today: string): number {
  const y = Number(today.slice(0, 4));
  const candidates = [y - 1, y, y + 1];
  const t = Date.parse(today);
  return candidates.sort((a, b) => Math.abs(Date.UTC(a, month - 1, day) - t) - Math.abs(Date.UTC(b, month - 1, day) - t))[0]!;
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseDateText(text: string, today = todayISO()): string | null {
  const s = text.toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1');
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  // 12/10/2026, 12-10-26, 12.10.2026 — Indian day-first order.
  m = /\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/.exec(s);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    return iso(y, +m[2]!, +m[1]!);
  }
  // 12 Oct 2026 / 12-Oct-26 / 12 October
  m = /\b(\d{1,2})[\s\-/.]*([a-z]{3,9})[\s\-/.,]*(\d{2,4})?\b/.exec(s);
  if (m && MONTHS[m[2]!.slice(0, 4) === 'sept' ? 'sept' : m[2]!.slice(0, 3)]) {
    const month = MONTHS[m[2]!.slice(0, 3)]!;
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : nearestYear(month, +m[1]!, today);
    return iso(y, month, +m[1]!);
  }
  // Oct 12, 2026
  m = /\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s*(\d{4})?\b/.exec(s);
  if (m && MONTHS[m[1]!.slice(0, 3)]) {
    const month = MONTHS[m[1]!.slice(0, 3)]!;
    const y = m[3] ? +m[3] : nearestYear(month, +m[2]!, today);
    return iso(y, month, +m[2]!);
  }
  return null;
}

const DAY_RE = /\b(mon|tue|wed|thu|fri|sat|sun)(?:day|sday|nesday|rsday|urday|s|r|rs)?\b\.?/i;

export function parseWeekday(text: string): (typeof WEEKDAYS)[number] | null {
  const m = DAY_RE.exec(text);
  if (!m) return null;
  const key = m[1]!.toLowerCase();
  return WEEKDAYS.find((d) => d.toLowerCase() === key) ?? null;
}

function cellDate(cell: GridCell | null, today: string): string | null {
  if (!cell) return null;
  if (cell.t === 'date' && typeof cell.v === 'string') return cell.v.slice(0, 10);
  if (cell.t === 'n' && typeof cell.v === 'number' && cell.v > 40000 && cell.v < 60000) {
    // A raw Excel serial date that lost its number format.
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(cell.v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (cell.t === 's') return parseDateText(cell.text, today);
  return null;
}

const SECTION_ONLY_RE = /^(?:sec(?:tion)?\.?\s*[-:]?\s*)?([A-J])$/i;
// "Sec E", "Section D & E", "Secs D, E and F" — captures the letter list.
const SECTION_MENTION_RE = /\bsec(?:tion)?s?\.?\s*[-:]?\s*([A-J](?:\s*(?:&|,|and|\+)\s*[A-J])*)\b/gi;

function mentionedSections(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(SECTION_MENTION_RE)) {
    for (const letter of m[1]!.toUpperCase().split(/\s*(?:&|,|AND|\+)\s*/)) if (letter) out.push(letter);
  }
  return out;
}

function sectionLabel(text: string): string | null {
  const m = SECTION_ONLY_RE.exec(text.trim());
  return m ? m[1]!.toUpperCase() : null;
}

const NOISE_RE = /^(?:-+|–|—|x|nil|n\/a|na|\.|break|lunch(?: break)?|tea(?: break)?|short break|recess)$/i;
const BREAK_RE = /^(?:lunch|tea|break|short break|recess)\b/i;

const ROOM_RE =
  /\b((?:room|rm|cr|lt|lh|hall|lab|audi(?:torium)?|seminar hall|conference room|class ?room|mdp|block)\s*[-#:.]?\s*[A-Z0-9][\w-]*|[A-Z]-?\d{3}[A-Z]?)\b/i;
const FACULTY_RE = /\b((?:[Pp]rof|PROF|[Dd]r|DR|Mrs|Mr|Ms|MRS|MR|MS)\.?[ \t]+[A-Z][\w.']*(?:[ \t]+[A-Z][\w.']*){0,3})/;
const PAREN_RE = /\(([^()]{2,40})\)/g;

function classify(text: string, strike: boolean): SessionStatus {
  if (strike || /\bcancel+ed\b|\bno class\b|\bholiday\b|\bsuspended\b/i.test(text)) return 'cancelled';
  if (/reschedul|postpone|prepone|shifted|swapped|changed to|moved to/i.test(text)) return 'rescheduled';
  if (/\b(?:mid[\s-]?term|end[\s-]?term|exam|quiz|olt|test|viva|presentation)\b/i.test(text)) return 'exam';
  if (/\bextra\b|\badditional\b|\bmake[\s-]?up\b|\bremedial\b/i.test(text)) return 'extra';
  return 'scheduled';
}

export function describeCell(text: string): Pick<Session, 'subject' | 'faculty' | 'room'> {
  let rest = text;
  let room: string | null = null;
  let faculty: string | null = null;

  const roomMatch = ROOM_RE.exec(rest);
  if (roomMatch) {
    room = roomMatch[1]!.trim();
    rest = rest.replace(roomMatch[0], ' ');
  }
  const facMatch = FACULTY_RE.exec(rest);
  if (facMatch) {
    faculty = facMatch[1]!.trim();
    rest = rest.replace(facMatch[0], ' ');
  } else {
    // "(RKS)" / "(Neha Rao)" — parentheses that are not a section marker, room or time.
    for (const m of rest.matchAll(PAREN_RE)) {
      const inner = m[1]!.trim();
      if (SECTION_ONLY_RE.test(inner) || ROOM_RE.test(inner) || /\d{1,2}[:.]\d{2}/.test(inner)) continue;
      if (/^[A-Z][A-Za-z.\s]{1,38}$/.test(inner)) {
        faculty = inner;
        rest = rest.replace(m[0], ' ');
        break;
      }
    }
  }
  const subject =
    rest
      .split('\n')
      .map((l) => l.replace(/\bsec(?:tion)?\.?\s*[-:]?\s*[A-J]\b/gi, '').replace(/[()[\]]/g, ' ').replace(/^[\s\-–—:/,|]+|[\s\-–—:/,|]+$/g, '').replace(/\s+/g, ' ').trim())
      .find((l) => l.length > 0) ?? null;
  return { subject, faculty, room };
}

/**
 * When one cell lists several sections ("SM – Sec E / CF – Sec F"), keep only our section's part.
 * Returns null when the cell names other sections but not ours.
 */
export function sectionPart(text: string, section: string): string | null {
  const segments = text.split(/\n|\/|;|\|/).map((s) => s.trim()).filter(Boolean);
  const marked = segments.map((seg) => {
    const found = mentionedSections(seg);
    const paren = /\(([A-J])\)/.exec(seg)?.[1]?.toUpperCase();
    if (paren) found.push(paren);
    return { seg, sections: found };
  });
  const anyMarked = marked.filter((m) => m.sections.length > 0);
  if (anyMarked.length === 0) return text;
  // Combined classes ("Sec D & E") count for every listed section.
  const ours = marked.filter((m) => m.sections.includes(section));
  if (!ours.length) return null;
  if (anyMarked.length === 1 && marked.length > 1) {
    // Only one segment is marked (e.g. "SM\nSec E") → the whole cell is ours.
    return text;
  }
  return ours.map((m) => m.seg).join('\n');
}

/* ------------------------------------------------------------- the parser */

interface SlotAxisItem {
  index: number; // column (across) or row (down)
  start: string | null;
  end: string | null;
  label: string;
}

function slotFromCell(cell: GridCell | null): { start: string | null; end: string | null } | null {
  if (!cell) return null;
  if (cell.t === 'time' && typeof cell.v === 'string') return { start: cell.v, end: null };
  if (cell.t !== 's') return null;
  return parseTimeRange(cell.text);
}

function fillEnds(items: SlotAxisItem[]) {
  for (let i = 0; i < items.length; i++) {
    if (!items[i]!.end && items[i + 1]?.start) items[i]!.end = items[i + 1]!.start;
  }
}

interface SheetResult {
  sessions: Session[];
  /** Sessions whose cell explicitly names our section (only meaningful in 'cell' mode). */
  explicit: number;
  orientation: Detection['orientation'];
  sectionMode: NonNullable<Detection['sectionMode']>;
  mentionsOtherSections: boolean;
  dated: boolean;
}

function parseSheet(grid: Grid, section: string, today: string, sheetIsOurs: boolean): SheetResult | null {
  const r = resolver(grid);
  const rows = grid.rows;
  const cols = grid.cols;

  // Does the sheet talk about other sections anywhere? (Guards against showing their classes.)
  let mentionsOtherSections = false;
  for (let i = 0; i < rows && !mentionsOtherSections; i++) {
    for (let j = 0; j < cols; j++) {
      const t = r.text(i, j);
      if (!t) continue;
      if (mentionedSections(t).some((x) => x !== section)) mentionsOtherSections = true;
      const only = sectionLabel(t);
      if (only && only !== section && t.length > 1) mentionsOtherSections = true;
    }
  }

  // ---- find header rows with ≥2 time slots (slots across) and columns with ≥2 (slots down)
  const acrossHeaders: { row: number; items: SlotAxisItem[] }[] = [];
  for (let i = 0; i < rows; i++) {
    const items: SlotAxisItem[] = [];
    for (let j = 0; j < cols; j++) {
      if (r.isCovered(i, j)) continue;
      const slot = slotFromCell(r.get(i, j));
      if (slot) items.push({ index: j, ...slot, label: r.text(i, j) });
    }
    if (items.length >= 2) {
      fillEnds(items);
      acrossHeaders.push({ row: i, items });
    }
  }
  let bestDown: { col: number; items: SlotAxisItem[] } | null = null;
  for (let j = 0; j < Math.min(cols, 12); j++) {
    const items: SlotAxisItem[] = [];
    for (let i = 0; i < rows; i++) {
      if (r.isCovered(i, j)) continue;
      const slot = slotFromCell(r.get(i, j));
      if (slot) items.push({ index: i, ...slot, label: r.text(i, j) });
    }
    if (items.length >= 2 && (!bestDown || items.length > bestDown.items.length)) bestDown = { col: j, items };
  }

  const acrossCount = acrossHeaders.reduce((n, h) => n + h.items.length, 0);
  if (!acrossHeaders.length && !bestDown) return null;

  const sessions: Session[] = [];
  let explicit = 0;
  const emitted = new Set<string>();
  const push = (s: Omit<Session, 'id' | 'key' | 'subject' | 'faculty' | 'room' | 'status'>, cell: GridCell | null) => {
    const text = s.text.trim();
    if (!text || NOISE_RE.test(text) || BREAK_RE.test(text)) return;
    const dedupe = `${s.date ?? s.day}|${s.cell}`;
    if (emitted.has(dedupe)) return;
    emitted.add(dedupe);
    if (mentionedSections(text).includes(section) || /\(([A-J])\)/.exec(text)?.[1]?.toUpperCase() === section) explicit++;
    const day = s.day ?? (s.date ? weekdayOf(s.date) : null);
    sessions.push({
      ...s,
      day,
      text,
      id: `${grid.name}!${s.cell}@${s.date ?? s.day ?? ''}`,
      key: `${s.date ?? day ?? '?'}|${s.start ?? s.slotLabel}`,
      status: classify(text, Boolean(cell?.style?.strike)),
      ...describeCell(text),
    });
  };

  const addr = (i: number, j: number) => {
    let col = '';
    let n = j + 1;
    while (n > 0) {
      col = String.fromCharCode(65 + ((n - 1) % 26)) + col;
      n = Math.floor((n - 1) / 26);
    }
    return `${col}${i + 1}`;
  };

  let sectionMode: SheetResult['sectionMode'] = sheetIsOurs ? 'sheet' : 'none';
  let dated = false;

  if (acrossHeaders.length && (!bestDown || acrossCount >= bestDown.items.length)) {
    // ---------------------------------------------- slots across the top
    const firstSlotCol = Math.min(...acrossHeaders.flatMap((h) => h.items.map((it) => it.index)));
    const contextCols = Array.from({ length: firstSlotCol }, (_, j) => j);

    // A "Section" column: ≥3 single-letter section labels in one context column.
    let sectionCol = -1;
    for (const j of contextCols) {
      let hits = 0;
      for (let i = 0; i < rows; i++) if (sectionLabel(r.text(i, j))) hits++;
      if (hits >= 3) {
        sectionCol = j;
        break;
      }
    }
    if (sectionCol >= 0) sectionMode = 'column';

    for (const [h, header] of acrossHeaders.entries()) {
      const endRow = acrossHeaders[h + 1]?.row ?? rows;
      let date: string | null = null;
      let day: Session['day'] = null;
      let blockSection: string | null = null;
      // A section heading or date can sit on / just above the header row ("SECTION E", "Week of 12 Oct").
      for (let i = Math.max(0, header.row - 2, h > 0 ? acrossHeaders[h - 1]!.row + 1 : 0); i <= header.row; i++) {
        for (let j = 0; j < cols; j++) {
          if (i === header.row && j >= firstSlotCol) break;
          const t = r.text(i, j);
          const m = /\bsec(?:tion)?\.?\s*[-:]?\s*([A-J])\b/i.exec(t);
          if (m) blockSection = m[1]!.toUpperCase();
          const d = cellDate(r.get(i, j), today);
          if (d) {
            date = d;
            dated = true;
          }
          day = (t && parseWeekday(t)) || (d ? weekdayOf(d) : day);
        }
      }
      if (blockSection && sectionCol < 0 && sectionMode === 'none') sectionMode = 'block';
      for (let i = header.row + 1; i < endRow; i++) {
        let rowSection: string | null = null;
        let rowHasSlots = false;
        for (const it of header.items) if (r.text(i, it.index)) rowHasSlots = true;

        for (const j of contextCols) {
          const cell = r.get(i, j);
          const d = cellDate(cell, today);
          if (d) {
            date = d;
            dated = true;
          }
          const wd = cell?.t === 's' ? parseWeekday(cell.text) : null;
          if (wd) day = wd;
          if (j === sectionCol) rowSection = sectionLabel(r.text(i, j));
        }
        if (!rowHasSlots) {
          // A heading row inside the block, e.g. "SECTION E" or "Monday, 12 Oct" spanning the width.
          const heading = Array.from({ length: cols }, (_, j) => r.text(i, j)).join(' ');
          const headingDate = parseDateText(heading, today);
          if (headingDate) {
            date = headingDate;
            dated = true;
          }
          day = parseWeekday(heading) ?? (headingDate ? weekdayOf(headingDate) : day);
          const m = /\bsec(?:tion)?\.?\s*[-:]?\s*([A-J])\b/i.exec(heading);
          if (m) {
            blockSection = m[1]!.toUpperCase();
            if (sectionMode === 'none') sectionMode = 'block';
          }
          continue;
        }
        if (sectionCol >= 0 && rowSection && rowSection !== section) continue;
        if (sectionCol < 0 && blockSection && blockSection !== section) continue;
        if (sectionCol < 0 && blockSection === section && sectionMode === 'none') sectionMode = 'block';

        for (const [k, it] of header.items.entries()) {
          if (r.isCovered(i, it.index)) {
            const [mr, mc] = r.master(i, it.index);
            if (mc !== it.index && mr === i) continue; // continuation of a multi-slot merge in this row
          }
          let text = r.text(i, it.index);
          if (!text) continue;
          if (sectionCol >= 0 && !rowSection) {
            const part = sectionPart(text, section);
            if (!part || part === text) continue;
            text = part;
          } else if (sectionMode === 'none' || sectionMode === 'cell') {
            const part = sectionPart(text, section);
            if (part === null) {
              sectionMode = 'cell';
              continue;
            }
            if (part !== text) sectionMode = 'cell';
            text = part;
          }
          // Horizontal merges spanning several slots → extend the end time.
          let end = it.end;
          const [mr, mc] = r.master(i, it.index);
          const merge = grid.merges.find((m) => m.r1 === mr && m.c1 === mc);
          if (merge && merge.c2 > it.index) {
            const last = [...header.items].reverse().find((x) => x.index <= merge.c2);
            if (last?.end) end = last.end;
          }
          push(
            {
              date,
              day,
              start: it.start,
              end,
              slotLabel: it.label || `Slot ${k + 1}`,
              text,
              sheet: grid.name,
              cell: addr(mr, mc),
            },
            r.get(i, it.index),
          );
        }
      }
    }
    return { sessions, explicit, orientation: 'slots-across', sectionMode, mentionsOtherSections, dated };
  }

  // ------------------------------------------------ slots down the side
  const down = bestDown!;
  fillEnds(down.items);
  const firstTimeRow = down.items[0]!.index;

  // Header row: nearest row above the first slot with ≥2 dates / weekdays / section labels.
  let headerRow = -1;
  let headerKind: 'days' | 'sections' = 'days';
  for (let i = firstTimeRow - 1; i >= Math.max(0, firstTimeRow - 6) && headerRow < 0; i--) {
    let days = 0;
    let secs = 0;
    for (let j = down.col + 1; j < cols; j++) {
      const t = r.text(i, j);
      if (!t) continue;
      if (cellDate(r.get(i, j), today) || parseWeekday(t)) days++;
      if (sectionLabel(t)) secs++;
    }
    if (secs >= 2) {
      headerRow = i;
      headerKind = 'sections';
    } else if (days >= 2) headerRow = i;
  }
  if (headerRow < 0) return { sessions: [], explicit, orientation: 'slots-down', sectionMode, mentionsOtherSections, dated };

  const columns: { col: number; date: string | null; day: Session['day'] }[] = [];
  if (headerKind === 'sections') {
    sectionMode = 'header';
    for (let j = down.col + 1; j < cols; j++) if (sectionLabel(r.text(headerRow, j)) === section) columns.push({ col: j, date: null, day: null });
  } else {
    for (let j = down.col + 1; j < cols; j++) {
      const t = r.text(headerRow, j);
      const date = cellDate(r.get(headerRow, j), today);
      const day = parseWeekday(t) ?? (date ? weekdayOf(date) : null);
      if (date || day) columns.push({ col: j, date, day });
      if (date) dated = true;
    }
  }

  let date: string | null = null;
  let day: Session['day'] = null;
  for (const it of down.items) {
    if (headerKind === 'sections') {
      // Dates live in a context column left of the time column; carry them down.
      for (let j = 0; j < down.col; j++) {
        const d = cellDate(r.get(it.index, j), today);
        if (d) {
          date = d;
          dated = true;
        }
        const wd = parseWeekday(r.text(it.index, j));
        if (wd) day = wd;
      }
    }
    for (const c of columns) {
      const [mr, mc] = r.master(it.index, c.col);
      if (mr !== it.index && r.isCovered(it.index, c.col)) continue; // continuation of a vertical merge
      let text = r.text(it.index, c.col);
      if (!text) continue;
      if (sectionMode === 'none' || sectionMode === 'cell') {
        const part = sectionPart(text, section);
        if (part === null) {
          sectionMode = 'cell';
          continue;
        }
        if (part !== text) sectionMode = 'cell';
        text = part;
      }
      let end = it.end;
      const merge = grid.merges.find((m) => m.r1 === mr && m.c1 === mc);
      if (merge && merge.r2 > it.index) {
        const last = [...down.items].reverse().find((x) => x.index <= merge.r2);
        if (last?.end) end = last.end;
      }
      push(
        {
          date: c.date ?? date,
          day: c.day ?? day,
          start: it.start,
          end,
          slotLabel: it.label,
          text,
          sheet: grid.name,
          cell: addr(mr, mc),
        },
        r.get(it.index, c.col),
      );
    }
  }
  return { sessions, explicit, orientation: 'slots-down', sectionMode, mentionsOtherSections, dated };
}

function sheetSection(name: string): string | null {
  const m = /^(?:.*\b)?sec(?:tion)?\.?\s*[-:]?\s*([A-J])\b/i.exec(name) ?? /^([A-J])$/i.exec(name.trim());
  return m ? m[1]!.toUpperCase() : null;
}

export function parseTimetable(grids: Grid[], opts: { section: string; today?: string }): ParsedTimetable {
  const section = opts.section.toUpperCase();
  const today = opts.today ?? todayISO();
  const warnings: string[] = [];
  const visible = grids.filter((g) => !g.hidden && g.rows > 0);

  // If sheets are split by section, only read ours.
  const sectionSheets = visible.filter((g) => sheetSection(g.name));
  const candidates = sectionSheets.length >= 2 ? sectionSheets.filter((g) => sheetSection(g.name) === section) : visible;
  if (sectionSheets.length >= 2 && !candidates.length) warnings.push(`No sheet is named for Section ${section}.`);

  const sessions: Session[] = [];
  const used: string[] = [];
  let orientation: Detection['orientation'];
  let sectionMode: Detection['sectionMode'] = 'none';
  let unsure = false;

  for (const grid of candidates) {
    const res = parseSheet(grid, section, today, sectionSheets.length >= 2);
    if (!res || !res.sessions.length) continue;
    const unsplit = res.sectionMode === 'none' || (res.sectionMode === 'cell' && res.explicit === 0);
    if (unsplit && res.mentionsOtherSections) {
      unsure = true;
      warnings.push(`"${grid.name}" mentions other sections but no section column or heading was found.`);
      continue;
    }
    sessions.push(...res.sessions);
    used.push(grid.name);
    orientation ??= res.orientation;
    if (res.sectionMode !== 'none') sectionMode = res.sectionMode;
  }

  sessions.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || WEEKDAYS.indexOf(a.day ?? 'Sun') - WEEKDAYS.indexOf(b.day ?? 'Sun') || (a.start ?? '').localeCompare(b.start ?? ''));

  const ok = sessions.length > 0 && !(unsure && !used.length);
  const how: Record<NonNullable<Detection['sectionMode']>, string> = {
    column: `rows filtered by the Section column (= ${section})`,
    header: `the Section ${section} column`,
    block: `the Section ${section} block`,
    sheet: `the Section ${section} sheet`,
    cell: `cells marked for Section ${section}`,
    none: 'all rows (the sheet does not split sections)',
  };
  const summary = ok
    ? `Read ${sessions.length} sessions from ${used.map((n) => `"${n}"`).join(', ')} using ${how[sectionMode]}.`
    : unsure
      ? `The timetable mixes several sections in a layout we could not split reliably, so the official sheet is shown as-is.`
      : `No time-slot grid was recognised, so the official sheet is shown as-is.`;

  return {
    parserVersion: PARSER_VERSION,
    sheets: visible,
    sessions,
    detection: { ok, summary, sheets: used, orientation, sectionMode },
    warnings,
  };
}
