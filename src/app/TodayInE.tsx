import Link from 'next/link';
import { SessionList, type SessionView } from '@/components/SessionList';
import { homeworkForStudent } from '@/lib/homework/repo';
import { upcomingSchedule, nextSession } from '@/lib/schedule';
import { seatsForStudent } from '@/lib/seating/repo';
import { getTimetableConfig, membersOnly } from '@/lib/timetable/service';
import { addDays, formatClock, formatDay, minutesNow, todayISO, toMinutes } from '@/lib/time';
import styles from './TodayInE.module.css';

interface Props {
  /** The live-timetable switch; when off only a registered student's homework is shown. */
  timetable: boolean;
  student: { rollNo: string; name: string } | null;
}

interface DueItem {
  id: string;
  subjectCode: string;
  title: string;
  time: string | null;
  done: boolean;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** The student's own homework due tomorrow, or null when it couldn't be loaded. */
async function dueTomorrow(rollNo: string): Promise<DueItem[] | null> {
  try {
    const items = await homeworkForStudent(rollNo);
    return items
      .filter((h) => h.bucket === 'tomorrow')
      .map((h) => ({ id: h.id, subjectCode: h.subjectCode, title: h.title, time: h.due.time, done: h.done }));
  } catch (err) {
    console.error('[section-e] homework for the landing page unavailable:', err instanceof Error ? err.message : err);
    return null;
  }
}

function Tick({ done }: { done: boolean }) {
  return (
    <span className={`${styles.tick} ${done ? styles.tickDone : ''}`} aria-hidden>
      {done && (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M6 12.5l4 4 8-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

function DueList({ items, large = false }: { items: DueItem[]; large?: boolean }) {
  return (
    <ul className={`${styles.dueList} ${large ? styles.dueListLarge : ''}`}>
      {items.map((h) => (
        <li key={h.id} className={`${styles.dueItem} ${h.done ? styles.dueItemDone : ''}`}>
          <Tick done={h.done} />
          <div className={styles.dueBody}>
            <p className={styles.dueMeta}>
              <span className="sr-only">{h.done ? 'Done: ' : 'To do: '}</span>
              <span className={styles.dueCode}>{h.subjectCode}</span>
              {h.time && <span> · by {formatClock(h.time)}</span>}
            </p>
            <p className={styles.dueTitle}>{h.title}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

const ALL_HOMEWORK = (
  <Link href="/homework" className="arrow-link">
    All homework <span aria-hidden>→</span>
  </Link>
);

const UNAVAILABLE = 'Homework couldn’t be loaded just now — open the homework page to try again.';

/** Beside the schedule: what this student has due tomorrow. */
function HomeworkAside({ items }: { items: DueItem[] | null }) {
  const left = items?.filter((h) => !h.done).length ?? 0;
  return (
    <aside className={styles.homework} aria-labelledby="due-title">
      <p className="eyebrow">Your homework</p>
      <h3 id="due-title" className={styles.dueHeading}>
        Due <em>tomorrow</em>
        {items && items.length > 0 && <span className="count tabular">({pad2(items.length)})</span>}
      </h3>
      {items === null ? (
        <p className={styles.dueNone}>{UNAVAILABLE}</p>
      ) : items.length ? (
        <>
          <DueList items={items} />
          <p className={styles.dueSummary}>{left ? `${left} still to do` : 'All done — nicely ahead.'}</p>
        </>
      ) : (
        <p className={styles.dueNone}>Nothing due tomorrow.</p>
      )}
      <div className={styles.homeworkFoot}>{ALL_HOMEWORK}</div>
    </aside>
  );
}

/** Timetable switched off: the band carries only the student's homework for tomorrow. */
function HomeworkOnly({ items }: { items: DueItem[] | null }) {
  const tomorrow = addDays(todayISO(), 1);
  const left = items?.filter((h) => !h.done).length ?? 0;
  return (
    <>
      <div className={styles.head}>
        <div>
          <p className="eyebrow">Your homework</p>
          <h2 id="today-title" className={styles.title}>
            Tomorrow <em>in</em> E
          </h2>
        </div>
        {ALL_HOMEWORK}
      </div>
      <p className={styles.date}>
        {formatDay(tomorrow, true)}
        {items && items.length > 0 && (
          <span className={styles.next}> · {left ? `${left} of ${items.length} still to do` : 'All done'}</span>
        )}
      </p>
      {items === null ? (
        <p className={styles.empty}>{UNAVAILABLE}</p>
      ) : items.length ? (
        <DueList items={items} large />
      ) : (
        <p className={styles.empty}>Nothing due tomorrow.</p>
      )}
    </>
  );
}

/** Anonymous visitor while the timetable comes from the restricted sheet (relay or upload). */
function MembersOnly() {
  return (
    <>
      <div className={styles.head}>
        <div>
          <p className="eyebrow">From the official timetable</p>
          <h2 id="today-title" className={styles.title}>
            Today <em>in</em> E
          </h2>
        </div>
      </div>
      <p className={styles.empty}>
        The timetable is shared with Section E only.{' '}
        <Link href="/register?next=/" className="link">
          Register
        </Link>{' '}
        with your roll number to see today’s classes, your seat for each, and what’s due tomorrow.
      </p>
    </>
  );
}

/**
 * The landing page's "Today in E" band: the live schedule (when the timetable is on) and, for a
 * registered student only, their own homework due tomorrow. Renders nothing for an anonymous
 * visitor while the timetable is off.
 */
export async function TodayInE({ timetable, student }: Props) {
  if (!timetable) {
    if (!student) return null;
    return <HomeworkOnly items={await dueTomorrow(student.rollNo)} />;
  }
  if (!student && membersOnly((await getTimetableConfig()).mode)) return <MembersOnly />;

  const [{ state, days }, seats, homework] = await Promise.all([
    upcomingSchedule(7),
    student ? seatsForStudent(student.rollNo) : Promise.resolve([]),
    student ? dueTomorrow(student.rollNo) : Promise.resolve(null),
  ]);
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

  let schedule: React.ReactNode;
  if (state.status !== 'ok' && state.status !== 'stale') {
    const message =
      state.status === 'error'
        ? `We couldn’t reach the official timetable just now. ${state.error.message}`
        : state.status === 'pending'
          ? 'The timetable source is set up — the first copy will appear here shortly.'
          : 'The live timetable has not been connected yet — the admin can link it from the dashboard.';
    schedule = <p className={styles.empty}>{message}</p>;
  } else if (!first) {
    const message = state.data.detection.ok
      ? 'No classes on the timetable for the next seven days.'
      : 'The official timetable is live — open it to see this week’s schedule.';
    schedule = <p className={styles.empty}>{message}</p>;
  } else {
    const now = minutesNow();
    const sessions: SessionView[] = first.sessions.map((s) => ({
      ...s,
      seat: s.planId ? (seatByPlan.get(s.planId) ?? null) : null,
      isNow: first.date === today && (toMinutes(s.start) ?? Infinity) <= now && now < (toMinutes(s.end) ?? -1),
    }));
    schedule = (
      <>
        <p className={styles.date}>
          {formatDay(first.date, true)}
          {next && next.date === first.date && next.session.start && (
            <span className={styles.next}>
              {' '}
              · Next up: {next.session.planTitle ?? next.session.subject ?? next.session.text}
            </span>
          )}
          {state.status === 'stale' && (
            <span className="pill pill--warn" style={{ marginLeft: 12 }}>
              Showing last saved copy
            </span>
          )}
        </p>
        <SessionList sessions={sessions} showSeats={Boolean(student)} />
        {!student && (
          <p className={styles.hint}>
            <Link href="/register" className="link">
              Register
            </Link>{' '}
            to see your seat next to every class — and what’s due tomorrow.
          </p>
        )}
      </>
    );
  }

  return (
    <>
      {header}
      {student ? (
        <div className={styles.split}>
          <div className={styles.schedule}>{schedule}</div>
          <HomeworkAside items={homework} />
        </div>
      ) : (
        schedule
      )}
    </>
  );
}

export function TodaySkeleton({ timetable = true }: { timetable?: boolean }) {
  return (
    <div aria-busy="true" aria-label={timetable ? 'Loading today’s classes' : 'Loading tomorrow’s homework'}>
      <div className={styles.head}>
        <div>
          <p className="eyebrow">{timetable ? 'From the live timetable' : 'Your homework'}</p>
          <h2 id="today-title" className={styles.title}>
            {timetable ? 'Today' : 'Tomorrow'} <em>in</em> E
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
