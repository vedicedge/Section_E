import type { Grid } from '../grid';
import { findDate } from '../homework/email';

/**
 * Reads a placement (Pre-Placement Talk) email and its attendee spreadsheet.
 * Pure functions with no I/O. Anything not clearly stated comes back as null, never a guess.
 */

export interface PlacementDetails {
  company: string | null;
  title: string;
  /** YYYY-MM-DD */
  date: string | null;
  /** HH:MM, 24-hour */
  time: string | null;
  venue: string | null;
  notes: string[];
}

/** Gmail plain text keeps `*bold*` markers (even stray ones like `f**or**`); drop them and tidy spaces. */
function stripMarkup(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\*/g, '').replace(/[ \t]+/g, ' ');
}

function field(text: string, label: string): string | null {
  const m = new RegExp(String.raw`^[\s\-•]*${label}\s*:\s*(.+?)\s*$`, 'im').exec(text);
  return m?.[1]?.trim() || null;
}

function to24(h: number, meridiem: string): number {
  return (h % 12) + (meridiem.toLowerCase() === 'p' ? 12 : 0);
}

/**
 * The start time in a `Time:` field, as HH:MM (24-hour). A meridiem written only after the end of a
 * range ("7:00 - 8:30 PM") also applies to the start. A bare 12-hour looking time ("3:00") is
 * ambiguous, so it is null unless it is clearly 24-hour (hour 13 or more, or a leading zero).
 */
function readTime(raw: string | null): string | null {
  if (!raw) return null;
  const m = /(?<!\d)(\d{1,2})(?:\s*[:.]\s*(\d{2}))?(?!\d)\s*(?:([ap])\.?\s*m(?![a-z])\.?)?/i.exec(raw);
  if (!m) return null;
  const hour = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (min > 59) return null;
  let h: number | null = null;
  if (m[3]) {
    if (hour < 1 || hour > 12) return null;
    h = to24(hour, m[3]);
  } else {
    const end = /^\s*(?:-|–|—|to|till|until)\s*(\d{1,2})(?:\s*[:.]\s*(\d{2}))?\s*([ap])\.?\s*m(?![a-z])/i.exec(raw.slice(m.index + m[0].length));
    const endHour = end ? Number(end[1]) : 0;
    if (end && endHour >= 1 && endHour <= 12 && hour >= 1 && hour <= 12) {
      const endMinutes = to24(endHour, end[3]!) * 60 + Number(end[2] ?? 0);
      const same = to24(hour, end[3]!);
      const other = to24(hour, end[3]!.toLowerCase() === 'p' ? 'a' : 'p');
      // The meridiem that puts the start before the end wins; "11:00 - 1:00 PM" starts at 11 am.
      if (same * 60 + min < endMinutes) h = same;
      else if (other * 60 + min < endMinutes) h = other;
    } else if (m[2] !== undefined && (hour >= 13 || (m[1]!.length === 2 && m[1]!.startsWith('0')))) {
      h = hour;
    }
  }
  if (h === null || h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function readCompany(subject: string, text: string): string | null {
  const parts = subject.split('||').map((p) => p.trim());
  if (parts.length > 1 && parts[parts.length - 1]) return parts[parts.length - 1]!;
  const m = /(?:that|inform you that)\s+([^\n]+?)\s+will\s+be\s+conducting/i.exec(text.replace(/\s+/g, ' '));
  return m?.[1]?.trim() || null;
}

/** The calendar date (YYYY-MM-DD) the email arrived, in the college time zone. */
function receivedOnIst(receivedAt: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(receivedAt));
}

export function parsePlacementEmail(input: { subject: string; body: string; receivedAt: string }): PlacementDetails {
  const text = stripMarkup(input.body);
  const company = readCompany(input.subject, text);

  const dateText = field(text, 'Date');
  const date = dateText ? findDate(dateText, receivedOnIst(input.receivedAt)) : null;
  const time = readTime(field(text, 'Time'));
  const venue = field(text, 'Venue');

  const notes: string[] = [];
  if (/formals?\b/i.test(text)) notes.push('Business formals');
  if (/mandatory/i.test(text)) notes.push('Attendance is mandatory for everyone on the attendee list');

  const title = company ? `${company} PPT` : 'Pre-Placement Talk';
  return { company, title, date, time, venue, notes };
}

const ROLL = /\b(\d{2}PGDM\d{3}R?)\b/gi;

/** Roll numbers (like 24PGDM144, 24PGDM046R) from every sheet: unique, upper-cased, in sheet order. */
export function attendeeRolls(grids: Grid[]): string[] {
  const seen = new Set<string>();
  for (const grid of grids) {
    for (const row of grid.cells) {
      for (const c of row) {
        const text = typeof c?.text === 'string' ? c.text : '';
        for (const m of text.matchAll(ROLL)) seen.add(m[1]!.toUpperCase());
      }
    }
  }
  return [...seen];
}

/** Roll numbers in pasted text (one per line, comma-separated, or copied from a sheet): unique, upper-cased. */
export function rollsInText(text: string): string[] {
  return [...new Set([...text.matchAll(ROLL)].map((m) => m[1]!.toUpperCase()))];
}
