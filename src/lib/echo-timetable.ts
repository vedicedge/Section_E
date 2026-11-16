import type { Session } from './timetable/parse';
import { weekdayOf } from './time';

/** The class timetable as Echo needs it: when, what, who and where. Class-wide, nothing about a student. */
export interface EchoSession {
  start: string | null;
  end: string | null;
  subject: string;
  /** Seating-plan code (CF, SM, ...) when the session matches one. */
  code: string | null;
  faculty: string | null;
  room: string | null;
  status: Session['status'];
}

export interface EchoTimetableDay {
  date: string;
  weekday: string;
  sessions: EchoSession[];
}

type SessionLike = Pick<Session, 'start' | 'end' | 'text' | 'subject' | 'faculty' | 'room' | 'status'> & {
  planCode: string | null;
  planTitle: string | null;
};

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export function timetableForEcho(days: { date: string; sessions: SessionLike[] }[]): EchoTimetableDay[] {
  return days.map((d) => ({
    date: d.date,
    weekday: weekdayOf(d.date),
    sessions: d.sessions.map((s) => ({
      start: s.start,
      end: s.end,
      subject: clip((s.planTitle ?? s.subject ?? s.text ?? '').replace(/\s+/g, ' ').trim(), 120),
      code: s.planCode,
      faculty: s.faculty,
      room: s.room,
      status: s.status,
    })),
  }));
}
