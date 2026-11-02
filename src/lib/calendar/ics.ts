/**
 * A minimal iCalendar (RFC 5545) writer for the class feed. Pure, so it is unit-tested.
 * Times are written in UTC, converted from the college's wall-clock time.
 */

export interface CalendarEvent {
  uid: string;
  /** 'YYYY-MM-DD' in the college's time zone. */
  date: string;
  /** 'HH:MM' local start and end. */
  start: string;
  end: string;
  summary: string;
  location: string | null;
  description: string | null;
  cancelled: boolean;
}

/** Offset of `tz` from UTC at `utcMs`, in minutes (Asia/Kolkata → 330). */
function offsetMinutes(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((wall - utcMs) / 60_000);
}

/** The UTC instant of a wall-clock time in `tz`. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  const first = guess - offsetMinutes(guess, tz) * 60_000;
  // A second pass settles times near a daylight-saving change (not needed for India, harmless elsewhere).
  return new Date(guess - offsetMinutes(first, tz) * 60_000);
}

/** 20261102T051500Z */
export function icsTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Escapes a TEXT value: backslash, semicolon, comma and newlines. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a content line to 75 octets, continuing with CRLF + space, without splitting a character. */
export function foldLine(line: string): string {
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  if (bytes(line) <= 75) return line;
  const out: string[] = [];
  let current = '';
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes(current + ch) > limit) {
      out.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.join('\r\n ');
}

export function buildCalendar(opts: { name: string; tz: string; events: CalendarEvent[]; now?: Date }): string {
  const stamp = icsTime(opts.now ?? new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Section E//Classes//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    `X-WR-TIMEZONE:${opts.tz}`,
    // Ask calendar apps to check hourly (Apple Calendar honours this; Google refreshes on its own schedule).
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of opts.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsTime(zonedToUtc(e.date, e.start, opts.tz))}`,
      `DTEND:${icsTime(zonedToUtc(e.date, e.end, opts.tz))}`,
      `SUMMARY:${escapeText(e.summary)}`,
    );
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push(`STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`, 'TRANSP:OPAQUE', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
