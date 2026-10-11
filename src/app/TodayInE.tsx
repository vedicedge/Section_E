import Link from 'next/link';
import { SessionList, type SessionView } from '@/components/SessionList';
import { getStudent } from '@/lib/session';
import { upcomingSchedule, nextSession } from '@/lib/schedule';
import { seatsForStudent } from '@/lib/seating/repo';
import { formatDay, minutesNow, todayISO, toMinutes } from '@/lib/time';
import styles from './TodayInE.module.css';

export async function TodayInE() {
  const [student, { state, days }] = await Promise.all([getStudent(), upcomingSchedule(7)]);
  const seats = student ? await seatsForStudent(student.rollNo) : [];
  const seatByPlan = new Map(seats.filter((s) => s.seat).map((s) => [s.plan.id, s.seat!]));
  const today = todayISO();
  const first = days[0];
  const next = nextSession(days);

  const header = (
    <div className={styles.head}>
      <div>
        <p className="eyebrow">From the live timetable</p>
        <h2 id="today-title" className={styles.title}>
          {first && first.date === today ? (
            <>
              Today <em>in</em> E
            </>
          ) : (
            <>
              Next <em>in</em> E
            </>
          )}
        </h2>
      </div>
      <Link href="/timetable" className="arrow-link">
        Full timetable <span aria-hidden>→</span>
      </Link>
    </div>
  );

  if (state.status !== 'ok' && state.status !== 'stale') {
    const message =
      state.status === 'error'
        ? `We couldn’t reach the official timetable just now. ${state.error.message}`
        : state.status === 'pending'
          ? 'The timetable source is set up — the first copy will appear here shortly.'
          : 'The live timetable has not been connected yet — the admin can link it from the dashboard.';
    return (
      <>
        {header}
        <p className={styles.empty}>{message}</p>
      </>
    );
  }
  if (!first) {
    let message = 'No classes on the timetable for the next seven days.';
    if (!state.data.detection.ok) message = 'The official timetable is live — open it to see this week’s schedule.';
    return (
      <>
        {header}
        <p className={styles.empty}>{message}</p>
      </>
    );
  }

  const now = minutesNow();
  const sessions: SessionView[] = first.sessions.map((s) => ({
    ...s,
    seat: s.planId ? (seatByPlan.get(s.planId) ?? null) : null,
    isNow: first.date === today && (toMinutes(s.start) ?? Infinity) <= now && now < (toMinutes(s.end) ?? -1),
  }));

  return (
    <>
      {header}
      <p className={styles.date}>
        {formatDay(first.date, true)}
        {next && next.date === first.date && next.session.start && (
          <span className={styles.next}>
            {' '}
            · Next up: {next.session.planTitle ?? next.session.subject ?? next.session.text}
          </span>
        )}
        {state.status === 'stale' && <span className="pill pill--warn" style={{ marginLeft: 12 }}>Showing last saved copy</span>}
      </p>
      <SessionList sessions={sessions} showSeats={Boolean(student)} />
      {!student && (
        <p className={styles.hint}>
          <Link href="/register" className="link">
            Register
          </Link>{' '}
          to see your seat next to every class.
        </p>
      )}
    </>
  );
}

export function TodaySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading today’s classes">
      <div className={styles.head}>
        <div>
          <p className="eyebrow">From the live timetable</p>
          <h2 id="today-title" className={styles.title}>
            Today <em>in</em> E
          </h2>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 14, marginTop: 28 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 64 }} />
        ))}
      </div>
    </div>
  );
}
