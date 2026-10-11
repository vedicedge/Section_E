import type { Session } from '../timetable/parse';
import { subjectKey } from '../names';
import { addDays, toMinutes, weekdayOf } from '../time';

/**
 * Homework deadlines. "Next class" is resolved against the live timetable every time it is read,
 * so if the class moves, the deadline moves with it. The last resolved date is kept as a snapshot
 * for when the timetable is unavailable. Pure functions — safe on server and client, unit-tested.
 */

export type DueMode = 'next_class' | 'date';

export interface DueSpec {
  dueMode: DueMode;
  /** The day the homework was given (YYYY-MM-DD). "Next class" means the first class after this day. */
  givenOn: string;
  /** Fixed date (date mode) or the last resolved next-class date (snapshot). */
  dueDate: string | null;
  dueTime: string | null;
  subjectCode: string;
}

export interface ResolvedDue {
  date: string | null;
  /** 'HH:MM' class start time when known. */
  time: string | null;
  source: 'fixed' | 'timetable' | 'snapshot' | 'unknown';
}

/** Session id → subject code it belongs to (null when it matches no known subject). */
export type SubjectOf = (session: Session) => string | null;

export interface DueContext {
  sessions: Session[];
  subjectOf: SubjectOf;
}

const MOVED_AWAY = /\b(?:reschedul\w*|moved|shifted|postpon\w*)\s+(?:to|till|until)\b|\bpostponed\b/i;

/** A timetable cell that is a real class meeting (not cancelled, not "moved to Friday"). */
export function isClassHappening(s: Session): boolean {
  if (s.status === 'cancelled') return false;
  return !MOVED_AWAY.test(s.text);
}

function sameSubject(a: string | null, b: string): boolean {
  return a !== null && subjectKey(a) === subjectKey(b);
}

const byStart = (a: Session, b: Session) => (toMinutes(a.start) ?? 9999) - (toMinutes(b.start) ?? 9999);

/**
 * First class of `subjectCode` on a day after `afterDate`. Dated timetables are searched directly;
 * weekly (weekday-only) timetables are projected forward up to `horizonDays`.
 */
export function nextClassOf(subjectCode: string, afterDate: string, ctx: DueContext, horizonDays = 28): { date: string; time: string | null } | null {
  const relevant = ctx.sessions.filter((s) => isClassHappening(s) && sameSubject(ctx.subjectOf(s), subjectCode));
  if (!relevant.length) return null;
  const dated = ctx.sessions.some((s) => s.date);
  if (dated) {
    const next = relevant
      .filter((s) => s.date && s.date > afterDate)
      .sort((a, b) => a.date!.localeCompare(b.date!) || byStart(a, b))[0];
    return next ? { date: next.date!, time: next.start } : null;
  }
  for (let d = 1; d <= horizonDays; d++) {
    const date = addDays(afterDate, d);
    const day = weekdayOf(date);
    const first = relevant.filter((s) => s.day === day).sort(byStart)[0];
    if (first) return { date, time: first.start };
  }
  return null;
}

export function resolveDue(spec: DueSpec, ctx: DueContext | null): ResolvedDue {
  if (spec.dueMode === 'date') return { date: spec.dueDate, time: spec.dueTime, source: 'fixed' };
  const next = ctx ? nextClassOf(spec.subjectCode, spec.givenOn, ctx) : null;
  if (next) return { date: next.date, time: next.time, source: 'timetable' };
  if (spec.dueDate) return { date: spec.dueDate, time: spec.dueTime, source: 'snapshot' };
  return { date: null, time: null, source: 'unknown' };
}

export type DueBucket = 'past' | 'today' | 'tomorrow' | 'upcoming' | 'undated';

export function bucketOf(due: ResolvedDue, today: string): DueBucket {
  if (!due.date) return 'undated';
  if (due.date < today) return 'past';
  if (due.date === today) return 'today';
  if (due.date === addDays(today, 1)) return 'tomorrow';
  return 'upcoming';
}

/** Sort key: by due date, then time, then subject. Undated last. */
export function compareDue(a: { due: ResolvedDue; subjectCode: string }, b: { due: ResolvedDue; subjectCode: string }): number {
  const ad = a.due.date ?? '9999-12-31';
  const bd = b.due.date ?? '9999-12-31';
  return ad.localeCompare(bd) || (a.due.time ?? '99:99').localeCompare(b.due.time ?? '99:99') || a.subjectCode.localeCompare(b.subjectCode);
}
