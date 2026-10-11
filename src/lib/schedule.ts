import 'server-only';
import { getTimetable, type TimetableState } from './timetable/service';
import type { Session } from './timetable/parse';
import { matchSubject } from './timetable/match';
import { activePlanSummaries, planStatus, type PlanRecord } from './seating/repo';
import { addDays, minutesNow, todayISO, toMinutes, weekdayOf } from './time';

export interface DaySchedule {
  date: string;
  sessions: (Session & { planId: string | null; planCode: string | null; planTitle: string | null })[];
}

/** Sessions that apply to a calendar date: dated rows, or weekday rows of a recurring timetable. */
export function sessionsOn(sessions: Session[], date: string): Session[] {
  const dated = sessions.some((s) => s.date);
  return sessions.filter((s) => (dated ? s.date === date : s.day === weekdayOf(date)));
}

function pickPlan(session: Session, plans: PlanRecord[], date: string): PlanRecord | null {
  // Prefer exam plans that are valid on the day for exam sessions, otherwise class plans.
  const valid = plans.filter((p) => planStatus(p, date) === 'current');
  const exam = session.status === 'exam' ? matchSubject(session.text, valid.filter((p) => p.kind === 'exam')) : null;
  return exam ?? matchSubject(session.text, valid.filter((p) => p.kind === 'class')) ?? matchSubject(session.text, valid);
}

export async function upcomingSchedule(days = 7): Promise<{ state: TimetableState; days: DaySchedule[] }> {
  const state = await getTimetable();
  if ((state.status !== 'ok' && state.status !== 'stale') || !state.data.detection.ok) return { state, days: [] };
  const plans = await activePlanSummaries();
  const today = todayISO();
  const out: DaySchedule[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const list = sessionsOn(state.data.sessions, date);
    if (!list.length) continue;
    out.push({
      date,
      sessions: list.map((s) => {
        const plan = pickPlan(s, plans, date);
        return { ...s, planId: plan?.id ?? null, planCode: plan?.code ?? null, planTitle: plan?.title ?? null };
      }),
    });
  }
  return { state, days: out };
}

/** The next session that has not ended yet (today) or the first one on a following day. */
export function nextSession(days: DaySchedule[]) {
  const today = todayISO();
  const now = minutesNow();
  for (const day of days) {
    for (const s of day.sessions) {
      if (s.status === 'cancelled') continue;
      const end = toMinutes(s.end) ?? (toMinutes(s.start) ?? 0) + 75;
      if (day.date > today || end > now) return { date: day.date, session: s };
    }
  }
  return null;
}
