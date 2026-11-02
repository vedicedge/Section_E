import 'server-only';
import { query, queryOne } from '../db';
import { env } from '../env';
import { hmac, sha256 } from '../crypto';
import { HttpError } from '../http';
import { pickPlan, sessionsOn } from '../schedule';
import { activePlanSummaries, seatsForStudent, type MySeat } from '../seating/repo';
import { getTimetable } from '../timetable/service';
import type { Session } from '../timetable/parse';
import { APP_TZ, addDays, todayISO } from '../time';
import { buildCalendar, type CalendarEvent } from './ics';

/**
 * Each student's private calendar link: their classes, with their seat as each event's location,
 * so the phone's own calendar widget and lock screen show the next class and where to sit.
 * Calendar apps can't sign in, so the link carries a secret token. Only its hash is stored; the
 * token itself is derived again from the session secret, so the page can show it any time, and a
 * version bump retires it.
 */

const DEFAULT_LENGTH_MIN = 75;

function tokenFor(rollNo: string, version: number): string {
  return hmac(env.sessionSecret, `calendar:${rollNo}:${version}`).toString('base64url').slice(0, 32);
}

/**
 * The student's calendar token: the existing one, a new one when they have none and `create` is
 * set, or a replacement when `reset` is set (the old link stops working). Null when none exists.
 */
export async function calendarToken(rollNo: string, opts: { create?: boolean; reset?: boolean } = {}): Promise<string | null> {
  const row = await queryOne<{ calendar_version: number; calendar_token_hash: string | null }>(
    'SELECT calendar_version, calendar_token_hash FROM students WHERE roll_no = $1 AND active',
    [rollNo],
  );
  if (!row) throw new HttpError(404, 'Your registration could not be found.', 'not_found');
  if (row.calendar_token_hash && !opts.reset) return tokenFor(rollNo, Number(row.calendar_version));
  if (!opts.create && !opts.reset) return null;
  const version = Number(row.calendar_version) + (opts.reset ? 1 : 0);
  const token = tokenFor(rollNo, version);
  await query('UPDATE students SET calendar_version = $2, calendar_token_hash = $3 WHERE roll_no = $1', [rollNo, version, sha256(token)]);
  return token;
}

/** The registered, active student a calendar token belongs to. */
export async function studentForCalendarToken(token: string): Promise<{ rollNo: string } | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const row = await queryOne<{ roll_no: string }>(
    'SELECT roll_no FROM students WHERE calendar_token_hash = $1 AND active AND pin_hash IS NOT NULL',
    [sha256(token)],
  );
  return row ? { rollNo: row.roll_no } : null;
}

function seatText(seat: NonNullable<MySeat['seat']>): string {
  const row = seat.rowLabel || `Row ${seat.rowNumber ?? seat.rowIndex + 1}`;
  return `${row}, Seat ${seat.seatNumber}`;
}

function endOf(start: string, end: string | null): string {
  if (end && end > start) return end;
  const [h, m] = start.split(':').map(Number);
  const total = Math.min(h! * 60 + m! + DEFAULT_LENGTH_MIN, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** The student's classes as calendar events: two weeks back, about four months ahead. */
export async function calendarEvents(rollNo: string, siteUrl: string, today = todayISO()): Promise<CalendarEvent[]> {
  const state = await getTimetable().catch(() => null);
  if (!state || (state.status !== 'ok' && state.status !== 'stale') || !state.data.detection.ok) return [];
  const [plans, seats] = await Promise.all([activePlanSummaries(), seatsForStudent(rollNo)]);
  const seatByPlan = new Map(seats.filter((s) => s.seat).map((s) => [s.plan.id, s.seat!]));

  const all = state.data.sessions;
  const dated = all.some((s) => s.date);
  const occurrences: { session: Session; date: string }[] = [];
  if (dated) {
    const from = addDays(today, -14);
    const to = addDays(today, 120);
    for (const s of all) if (s.date && s.date >= from && s.date <= to) occurrences.push({ session: s, date: s.date });
  } else {
    // A weekly timetable repeats: lay it out over the coming weeks.
    for (let d = -7; d <= 56; d++) {
      const date = addDays(today, d);
      for (const s of sessionsOn(all, date)) occurrences.push({ session: s, date });
    }
  }

  const events: CalendarEvent[] = [];
  for (const { session: s, date } of occurrences) {
    if (!s.start) continue;
    const plan = pickPlan(s, plans, date);
    const seat = plan ? seatByPlan.get(plan.id) : undefined;
    const room = s.room ?? plan?.room ?? null;
    const name = plan ? (plan.title && plan.title.toUpperCase() !== plan.code.toUpperCase() ? `${plan.code} – ${plan.title}` : plan.code) : (s.subject ?? s.text.split('\n')[0]!);
    const cancelled = s.status === 'cancelled';
    const summary = cancelled && !/holiday/i.test(s.text) ? `Cancelled: ${name}` : name;
    const location = seat ? [seatText(seat), room].filter(Boolean).join(' · ') : room;
    const description = [
      seat ? `Your seat: ${seatText(seat)}${room ? ` (${room})` : ''}` : null,
      s.faculty ? `With ${s.faculty}` : null,
      s.text.replace(/\s*\n\s*/g, ' · ') !== name ? `On the timetable: ${s.text.replace(/\s*\n\s*/g, ' · ')}` : null,
      s.status === 'rescheduled' ? 'Marked as rescheduled — check the timetable.' : null,
      `Latest timetable: ${siteUrl}/timetable`,
    ]
      .filter(Boolean)
      .join('\n');
    events.push({
      uid: `${sha256(`${s.id}|${date}`).slice(0, 32)}@section-e`,
      date,
      start: s.start,
      end: endOf(s.start, s.end),
      summary,
      location,
      description,
      cancelled,
    });
  }
  return events;
}

export async function calendarFor(rollNo: string, siteUrl: string): Promise<string> {
  return buildCalendar({ name: 'Section E classes', tz: APP_TZ, events: await calendarEvents(rollNo, siteUrl) });
}
