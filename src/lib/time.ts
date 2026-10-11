/**
 * Date helpers pinned to the college's time zone (Asia/Kolkata by default) so "today" and
 * "next class" are right no matter where the server runs. Safe to import on client or server.
 */

export const APP_TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE || 'Asia/Kolkata';

function parts(date: Date, tz = APP_TZ) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  return out;
}

/** 'YYYY-MM-DD' in the app time zone. */
export function todayISO(now = new Date()): string {
  const p = parts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes since local midnight in the app time zone. */
export function minutesNow(now = new Date()): number {
  const p = parts(now);
  return Number(p.hour) * 60 + Number(p.minute);
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function weekdayOf(iso: string): (typeof WEEKDAYS)[number] {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return dt.toISOString().slice(0, 10);
}

/** Monday of the week containing `iso`. */
export function startOfWeek(iso: string): string {
  const idx = WEEKDAYS.indexOf(weekdayOf(iso));
  return addDays(iso, idx === 0 ? -6 : 1 - idx);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-10-12' → 'Mon, 12 Oct' */
export function formatDay(iso: string, withYear = false): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${weekdayOf(iso)}, ${d} ${MONTHS[m! - 1]}${withYear ? ` ${y}` : ''}`;
}

/** '14:05' → '2:05 pm' */
export function formatClock(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h! >= 12 ? 'pm' : 'am';
  const h12 = h! % 12 === 0 ? 12 : h! % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h! * 60 + m! : null;
}

/** "3 min ago", "2 h ago", "4 days ago". */
export function relativeTime(from: Date | string | number, now = Date.now()): string {
  const diff = Math.round((now - new Date(from).getTime()) / 1000);
  const abs = Math.abs(diff);
  const future = diff < 0;
  const fmt = (n: number, unit: string) => (future ? `in ${n} ${unit}` : `${n} ${unit} ago`);
  if (abs < 45) return future ? 'in a moment' : 'just now';
  if (abs < 3600) return fmt(Math.round(abs / 60), 'min');
  if (abs < 86400) return fmt(Math.round(abs / 3600), 'h');
  const days = Math.round(abs / 86400);
  return fmt(days, days === 1 ? 'day' : 'days');
}

/** Absolute timestamp in the app zone: '11 Oct, 6:42 pm'. */
export function formatDateTime(value: Date | string | number): string {
  const d = new Date(value);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: APP_TZ,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

/** Value for <input type="datetime-local"> in the app zone. */
export function toLocalInput(value: Date | string | null | undefined): string {
  if (!value) return '';
  const p = parts(new Date(value));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Offset of the app zone from UTC in minutes at a given instant (e.g. +330 for IST). */
function zoneOffsetMinutes(at: Date): number {
  const p = parts(at);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** Parses a datetime-local value as wall-clock time in the app zone → ISO instant. */
export function fromLocalInput(local: string | null | undefined): string | null {
  if (!local) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const guess = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  const offset = zoneOffsetMinutes(new Date(guess));
  return new Date(guess - offset * 60000).toISOString();
}
