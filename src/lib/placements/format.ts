import { weekdayOf } from '../time';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-11-20' → 'Fri 20 Nov' */
export function pptDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${weekdayOf(iso)} ${d} ${MONTHS[m! - 1]}`;
}

/** '19:00' → '7:00 PM' */
export function pptClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h! % 12 === 0 ? 12 : h! % 12}:${String(m).padStart(2, '0')} ${h! >= 12 ? 'PM' : 'AM'}`;
}

/** 'Godrej Properties PPT · Fri 20 Nov, 7:00 PM · Auditorium' (the venue is left out when there is none). */
export function pptSummary(p: { title: string; date: string; time: string; venue: string | null }): string {
  const when = `${pptDay(p.date)}, ${pptClock(p.time)}`;
  return [p.title, when, p.venue?.trim() || null].filter(Boolean).join(' · ');
}
