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

function readTime(raw: string | null): string | null {
  if (!raw) return null;
  const m = /\b(\d{1,2})(?:\s*[:.]\s*(\d{2}))?\s*([ap])\.?\s*m\b\.?|\b(\d{1,2})\s*[:.]\s*(\d{2})\b/i.exec(raw);
  if (!m) return null;
  let h: number;
  let min: number;
  if (m[3]) {
    h = Number(m[1]);
    min = Number(m[2] ?? 0);
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0);
  } else {
    h = Number(m[4]);
    min = Number(m[5]);
  }
  if (h > 23 || min > 59) return null;
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
