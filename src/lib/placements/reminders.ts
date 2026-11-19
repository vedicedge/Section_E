import 'server-only';
import { query } from '../db';
import { sendPush } from '../push';
import { addDays } from '../time';

/**
 * Reminders for approved Pre-Placement Talks: one the evening before (from 7 pm) and one about an
 * hour before the start. The inbox script checks in every 30 minutes, so each is a window rather
 * than an exact minute, and each is claimed in the database first so it goes out once.
 */

const OFFSET = '+05:30'; // IST, the college's time zone (India has no daylight saving)
const EVE_FROM = '19:00';
const HOUR_FROM_MIN = 90;
const HOUR_TO_MIN = 30;

/** The moment a date and 'HH:MM' fall on in the college's time zone. */
export function startInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${OFFSET}`);
}

export type ReminderKind = 'eve' | 'hour';

export function remindersDue(
  e: { date: string; time: string; remindedEveAt: Date | null; remindedHourAt: Date | null },
  now: Date,
): ReminderKind[] {
  const start = startInstant(e.date, e.time).getTime();
  const t = now.getTime();
  if (t >= start) return [];
  const due: ReminderKind[] = [];
  const hourOpens = start - HOUR_FROM_MIN * 60_000;
  const hourCloses = start - HOUR_TO_MIN * 60_000;
  const eveOpens = startInstant(addDays(e.date, -1), EVE_FROM).getTime();
  // The evening reminder stops when the hour window opens, so a late check-in never sends both.
  if (!e.remindedEveAt && t >= eveOpens && t < hourOpens) due.push('eve');
  if (!e.remindedHourAt && t >= hourOpens && t < hourCloses) due.push('hour');
  return due;
}

function clock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${((h! + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h! < 12 ? 'am' : 'pm'}`;
}

interface DueRow {
  id: string;
  title: string;
  date: string;
  time: string;
  venue: string | null;
  eve: Date | null;
  hour: Date | null;
}

/** Sends whatever reminders are due now to the listed students. Returns how many reminders went out. */
export async function sendPlacementReminders(now: Date): Promise<number> {
  const rows = await query<DueRow>(
    `SELECT id, title, on_date::text AS date, at_time AS time, venue, reminded_eve_at AS eve, reminded_hour_at AS hour
       FROM placement_events
      WHERE status = 'approved' AND on_date IS NOT NULL AND at_time IS NOT NULL
        AND on_date BETWEEN ($1::timestamptz::date - 1) AND ($1::timestamptz::date + 2)`,
    [now.toISOString()],
  );
  let sent = 0;
  for (const r of rows) {
    for (const kind of remindersDue({ date: r.date, time: r.time, remindedEveAt: r.eve, remindedHourAt: r.hour }, now)) {
      const column = kind === 'eve' ? 'reminded_eve_at' : 'reminded_hour_at';
      const claimed = await query<{ id: string }>(
        `UPDATE placement_events SET ${column} = $2 WHERE id = $1 AND ${column} IS NULL RETURNING id`,
        [r.id, now.toISOString()],
      );
      if (!claimed.length) continue;
      const rolls = (await query<{ roll_no: string }>('SELECT roll_no FROM placement_attendees WHERE event_id = $1', [r.id])).map((a) => a.roll_no);
      const when = kind === 'eve' ? `tomorrow at ${clock(r.time)}` : `today at ${clock(r.time)}`;
      await sendPush(rolls, {
        title: kind === 'eve' ? `Tomorrow: ${r.title}` : `Starting soon: ${r.title}`,
        body: `${r.title} is ${when}${r.venue ? ` · ${r.venue}` : ''}.`,
        url: '/',
        tag: `placement-${r.id}-${kind}`,
      }).catch(() => undefined);
      sent++;
    }
  }
  return sent;
}
