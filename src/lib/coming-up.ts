import { addDays, todayISO } from './time';

/** Pure helpers for the home page's "Coming up" list and exam countdown (no database here). */

export type KeyDateKind = 'exam' | 'presentation' | 'quiz' | 'event';

export const KIND_LABEL: Record<KeyDateKind, string> = {
  exam: 'Exam',
  presentation: 'Presentation',
  quiz: 'Quiz',
  event: 'Event',
};

export interface KeyDate {
  id: string;
  kind: KeyDateKind;
  subject: string | null;
  title: string;
  onDate: string;
  atTime: string | null;
  details: string;
}

export interface UpcomingItem {
  key: string;
  date: string;
  time: string | null;
  /** 'homework' and 'test' come from elsewhere on the site; the rest are admin-entered dates. */
  kind: KeyDateKind | 'homework' | 'test' | 'placement';
  label: string;
  title: string;
  subject: string | null;
  href: string | null;
}

export interface HomeworkLike {
  id: string;
  subjectCode: string;
  title: string;
  done: boolean;
  due: { date: string | null; time: string | null };
}

/** A Pre-Placement Talk the student is on the attendee list for. */
export interface PlacementLike {
  id: string;
  title: string;
  date: string;
  time: string;
  venue: string | null;
  notes: string;
  endTime?: string | null;
}

export interface QuizLike {
  id: string;
  title: string;
  subject: string | null;
  opensAt: string | null;
  closesAt: string | null;
  phase: 'draft' | 'upcoming' | 'live' | 'closed';
}

/** Calendar date of an instant in the app's time zone. */
const dayOf = (iso: string) => todayISO(new Date(iso));
const timeOf = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: process.env.NEXT_PUBLIC_APP_TIMEZONE || 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(iso),
  );

/**
 * Everything in the next `days` days, soonest first: admin dates, the student's unfinished
 * homework, and mock tests that open or close. Same-day items keep a stable order by time, then kind.
 */
export function comingUp(
  input: { dates: KeyDate[]; homework: HomeworkLike[]; quizzes: QuizLike[] },
  opts: { today?: string; days?: number; limit?: number } = {},
  placements: PlacementLike[] = [],
): UpcomingItem[] {
  const today = opts.today ?? todayISO();
  const last = addDays(today, opts.days ?? 14);
  const within = (d: string | null): d is string => Boolean(d && d >= today && d <= last);
  const items: UpcomingItem[] = [];

  for (const d of input.dates) {
    if (!within(d.onDate)) continue;
    items.push({ key: `date-${d.id}`, date: d.onDate, time: d.atTime, kind: d.kind, label: KIND_LABEL[d.kind], title: d.title, subject: d.subject, href: null });
  }
  for (const h of input.homework) {
    if (h.done || !within(h.due.date)) continue;
    items.push({ key: `hw-${h.id}`, date: h.due.date, time: h.due.time, kind: 'homework', label: 'Homework due', title: h.title, subject: h.subjectCode, href: '/homework' });
  }
  for (const q of input.quizzes) {
    if (q.phase === 'upcoming' && q.opensAt && within(dayOf(q.opensAt))) {
      items.push({ key: `qo-${q.id}`, date: dayOf(q.opensAt), time: timeOf(q.opensAt), kind: 'test', label: 'Mock test opens', title: q.title, subject: q.subject, href: '/tests' });
    }
    if ((q.phase === 'upcoming' || q.phase === 'live') && q.closesAt && within(dayOf(q.closesAt))) {
      items.push({ key: `qc-${q.id}`, date: dayOf(q.closesAt), time: timeOf(q.closesAt), kind: 'test', label: 'Mock test closes', title: q.title, subject: q.subject, href: '/tests' });
    }
  }

  for (const p of placements) {
    if (!within(p.date)) continue;
    items.push({ key: `ppt-${p.id}`, date: p.date, time: p.time, kind: 'placement', label: 'PPT', title: p.title, subject: p.venue, href: null });
  }

  const ORDER = ['exam', 'quiz', 'presentation', 'placement', 'test', 'homework', 'event'];
  items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.title.localeCompare(b.title),
  );
  return opts.limit ? items.slice(0, opts.limit) : items;
}

/** Whole days from `today` to `date` (0 = today). */
export function daysUntil(date: string, today = todayISO()): number {
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = date.split('-').map(Number);
  return Math.round((Date.UTC(y2!, m2! - 1, d2!) - Date.UTC(y1!, m1! - 1, d1!)) / 86_400_000);
}

export interface Countdown {
  /** Days to the first exam still ahead (0 = today). */
  days: number;
  first: KeyDate;
  /** Every exam still ahead, soonest first (today's included). */
  remaining: KeyDate[];
}

/** The exam countdown: null when no exam is today or later. */
export function examCountdown(dates: KeyDate[], today = todayISO()): Countdown | null {
  const remaining = dates
    .filter((d) => d.kind === 'exam' && d.onDate >= today)
    .sort((a, b) => a.onDate.localeCompare(b.onDate) || (a.atTime ?? '').localeCompare(b.atTime ?? ''));
  if (!remaining.length) return null;
  return { days: daysUntil(remaining[0]!.onDate, today), first: remaining[0]!, remaining };
}

export interface ParsedLine {
  line: number;
  subject: string | null;
  title: string;
  onDate: string;
  atTime: string | null;
}

const MONTH_NUM: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** "2026-12-08", "08/12/2026", "8 Dec 2026", "8 Dec" (year from `today`) → ISO date, or null. */
export function parseLooseDate(raw: string, today = todayISO()): string | null {
  const s = raw.trim();
  let y: number | undefined, m: number | undefined, d: number | undefined;
  let r: RegExpExecArray | null;
  if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) [y, m, d] = [+r[1]!, +r[2]!, +r[3]!];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s))) [d, m, y] = [+r[1]!, +r[2]!, +r[3]! < 100 ? 2000 + +r[3]! : +r[3]!];
  else if ((r = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?(?:\s+(\d{4}))?$/i.exec(s))) {
    d = +r[1]!;
    m = MONTH_NUM[r[2]!.toLowerCase()];
    y = r[3] ? +r[3] : undefined;
    if (m && !y) {
      // No year: the next time that day comes round (an exam list is about the future).
      const thisYear = Number(today.slice(0, 4));
      const candidate = `${thisYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      y = candidate < addDays(today, -30) ? thisYear + 1 : thisYear;
    }
  }
  if (!y || !m || !d || m > 12 || d > 31) return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const check = new Date(`${iso}T00:00:00Z`);
  return check.getUTCMonth() + 1 === m && check.getUTCDate() === d ? iso : null;
}

/** "10:00", "2 pm", "2:30pm", "14.30" → 'HH:MM', or null. */
export function parseLooseTime(raw: string): string | null {
  const r = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i.exec(raw.trim());
  if (!r) return null;
  let h = +r[1]!;
  const min = r[2] ? +r[2] : 0;
  const ap = r[3]?.toLowerCase();
  if (!ap && !r[2]) return null; // a bare number is too ambiguous to be a time
  if (ap) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ap === 'pm' ? 12 : 0);
  }
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * A pasted schedule, one per line: "date, subject, title[, time]" (commas, tabs or " | ").
 * Pasting from a spreadsheet gives tabs, which work too. Returns the rows plus readable errors.
 */
export function parseDateLines(text: string, today = todayISO()): { rows: ParsedLine[]; errors: string[] } {
  const rows: ParsedLine[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const cells = raw.split(/\t|\s*\|\s*|\s*,\s*/).map((c) => c.trim());
    const onDate = parseLooseDate(cells[0] ?? '', today);
    if (!onDate) return void errors.push(`Line ${line}: “${cells[0]}” isn’t a date I can read (try 2026-12-08 or 8 Dec).`);
    let atTime: string | null = null;
    if (cells.length > 2) {
      const t = parseLooseTime(cells[cells.length - 1]!);
      if (t) {
        atTime = t;
        cells.pop();
      }
    }
    const [, rawSubject, ...rest] = cells;
    const subject = rawSubject ? rawSubject.toUpperCase().slice(0, 40) : null;
    const title = rest.filter(Boolean).join(', ').trim() || (subject ? `${subject} exam` : '');
    if (!title) return void errors.push(`Line ${line}: add a subject or a title after the date.`);
    rows.push({ line, subject, title: title.slice(0, 160), onDate, atTime });
  });
  return { rows, errors };
}

export function countdownLabel(days: number): string {
  if (days === 0) return 'The first exam is today';
  if (days === 1) return 'day to the first exam';
  return 'days to the first exam';
}
