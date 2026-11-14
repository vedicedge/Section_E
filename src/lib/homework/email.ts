import { subjectKey } from '../names';
import { matchSubject } from '../timetable/match';
import type { Session } from '../timetable/parse';
import { addDays, isoDate as iso, WEEKDAYS } from '../time';
import { HOMEWORK_LIMITS } from './limits';

/**
 * Reads a faculty email and pulls out what looks like a deadline, so the admin can add it to
 * Homework with one click. Nothing here publishes anything: the result is only a suggestion.
 * Pure functions (no I/O), so they are easy to test.
 */

export interface IncomingEmail {
  subject: string;
  body: string;
  /** YYYY-MM-DD the email arrived, in the college time zone. Undated deadlines are read relative to it. */
  receivedOn: string;
}

export interface EmailSuggestion {
  title: string;
  /** The sentences that mention the deadline, for the admin to check against. */
  excerpt: string;
  dueMode: 'date' | 'next_class' | null;
  dueDate: string | null;
}

const KEYWORD = /\b(deadlines?|due\b(?!\s+to\b)|submit(?:ted|ting)?|submissions?|last\s+date|hand\s+in|upload(?:ed)?\s+(?:it|your|the)|turn\s+in)/i;
const NEXT_CLASS = /\b(?:next|coming|upcoming|following)\s+(?:class|session|lecture)\b|\bbefore\s+(?:the\s+)?(?:class|session|lecture)\b/i;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const ORD = '(?:st|nd|rd|th)?';
const YEAR = `(?:[\\s,'’]*(?:'|’)?(\\d{4}|\\d{2})(?!\\d|[:.]\\d))?`;

const DAY_MONTH = new RegExp(`\\b(\\d{1,2})${ORD}\\s*(?:of\\s+)?${MONTH}\\b\\.?${YEAR}`, 'i');
const MONTH_DAY = new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})${ORD}\\b(?:,?\\s*(\\d{4}))?`, 'i');
const NUMERIC = /\b(\d{1,2})([/.-])(\d{1,2})(?:\2(\d{4}|\d{2}))?\b/;
const WEEKDAY = /\b(?:by|on|before|till|until|this|next)\s+(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i;
const RELATIVE = /\b(today|tonight|tomorrow)\b/i;

function fullYear(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return raw.length === 2 ? 2000 + n : n;
}

/** A date written without a year is the next one on or after the email (allowing a week of slack for late reminders). */
function withYear(m: number, d: number, year: number | null, receivedOn: string): string | null {
  if (year) return iso(year, m, d);
  const base = Number(receivedOn.slice(0, 4));
  const same = iso(base, m, d);
  if (!same) return iso(base + 1, m, d);
  return same < addDays(receivedOn, -7) ? iso(base + 1, m, d) : same;
}

/** The first date written in `text`, read as a deadline relative to `receivedOn`. */
export function findDate(text: string, receivedOn: string): string | null {
  const candidates: { at: number; date: string | null }[] = [];

  const dm = DAY_MONTH.exec(text);
  if (dm) candidates.push({ at: dm.index, date: withYear(MONTHS[dm[2]!.toLowerCase()]!, Number(dm[1]), fullYear(dm[3]), receivedOn) });

  const md = MONTH_DAY.exec(text);
  if (md) candidates.push({ at: md.index, date: withYear(MONTHS[md[1]!.toLowerCase()]!, Number(md[2]), fullYear(md[3]), receivedOn) });

  const num = NUMERIC.exec(text);
  // "10.30" is a time, not a date: dotted and dashed forms need a year.
  if (num && (num[2] === '/' || num[4])) {
    candidates.push({ at: num.index, date: withYear(Number(num[3]), Number(num[1]), fullYear(num[4]), receivedOn) });
  }

  const wd = WEEKDAY.exec(text);
  if (wd) {
    const target = WEEKDAYS.findIndex((w) => w.toLowerCase() === wd[1]!.toLowerCase().slice(0, 3));
    const from = new Date(`${receivedOn}T00:00:00Z`).getUTCDay();
    const ahead = ((target - from + 7) % 7) || 7;
    candidates.push({ at: wd.index, date: addDays(receivedOn, ahead) });
  }

  const rel = RELATIVE.exec(text);
  if (rel) candidates.push({ at: rel.index, date: addDays(receivedOn, rel[1]!.toLowerCase() === 'tomorrow' ? 1 : 0) });

  const first = candidates.filter((c) => c.date).sort((a, b) => a.at - b.at)[0];
  return first?.date ?? null;
}

/** Drops quoted replies and forwarded headers, so an old deadline in the thread isn't picked up twice. */
function ownText(body: string): string {
  const lines: string[] = [];
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*>/.test(line)) continue;
    if (/^\s*On .{4,200}wrote:\s*$/.test(line)) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line)) break;
    lines.push(line);
  }
  return lines.join('\n');
}

function sentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function cleanSubject(subject: string): string {
  return subject
    .replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns a suggestion when the email mentions a deadline or a submission, else null.
 * The due date is the first date in the deadline sentences; "before the next class" becomes a
 * next-class deadline; anything else is left for the admin to fill in.
 */
export function suggestFromEmail(email: IncomingEmail): EmailSuggestion | null {
  const text = ownText(email.body);
  const hits = sentences(`${email.subject}\n${text}`).filter((s) => KEYWORD.test(s));
  if (!hits.length) return null;

  let dueDate: string | null = null;
  let nextClass = false;
  for (const s of hits) {
    dueDate ??= findDate(s, email.receivedOn);
    nextClass ||= NEXT_CLASS.test(s);
  }
  // A deadline before the email arrived is a misread (or a past date quoted for context).
  if (dueDate && dueDate < email.receivedOn) dueDate = null;

  const excerpt = [...new Set(hits)].slice(0, 3).join(' … ');
  const title = cleanSubject(email.subject) || hits[0]!;
  return {
    title: title.slice(0, HOMEWORK_LIMITS.title),
    excerpt: excerpt.length > 600 ? `${excerpt.slice(0, 597)}…` : excerpt,
    dueMode: dueDate ? 'date' : nextClass ? 'next_class' : null,
    dueDate,
  };
}

/* ----------------------------------------------------------- subject guess */

interface SubjectLike {
  code: string;
  title: string;
}

/** Words of a person's name worth matching ("Dr. Priya Chaudhary" → ["PRIYA", "CHAUDHARY"]). */
function nameParts(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/\b(DR|PROF|MR|MRS|MS)\b\.?/g, ' ')
    .split(/[^A-Z]+/)
    .filter((w) => w.length >= 3);
}

/**
 * Which subject an email is about: first by the sender teaching it on the timetable (the faculty
 * name in the timetable cell), then by a subject code or title in the email subject or excerpt.
 */
export function guessSubject<T extends SubjectLike>(
  input: { senderName: string; emailSubject: string; excerpt: string },
  subjects: T[],
  timetable: { sessions: Session[]; subjectOf: (s: Session) => string | null } | null,
): T | null {
  const byKey = new Map(subjects.map((s) => [subjectKey(s.code), s]));
  const parts = nameParts(input.senderName);
  if (timetable && parts.length) {
    const counts = new Map<string, number>();
    for (const session of timetable.sessions) {
      const who = `${session.faculty ?? ''} ${session.text}`.toUpperCase();
      const words = new Set(who.split(/[^A-Z]+/));
      // Surname plus one more part, or a single distinctive name when that is all we have.
      const matched = parts.filter((p) => words.has(p)).length;
      if (matched < Math.min(2, parts.length)) continue;
      const code = timetable.subjectOf(session);
      if (code && byKey.has(subjectKey(code))) counts.set(subjectKey(code), (counts.get(subjectKey(code)) ?? 0) + 1);
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) return byKey.get(best[0])!;
  }
  const withAliases = subjects.map((s) => ({ ...s, aliases: [] as string[] }));
  const hit = matchSubject(`${input.emailSubject} ${input.excerpt}`, withAliases);
  return hit ? byKey.get(subjectKey(hit.code)) ?? null : null;
}
