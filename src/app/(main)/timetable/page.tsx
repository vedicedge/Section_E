import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTimetable } from '@/lib/timetable/service';
import { matchSubject } from '@/lib/timetable/match';
import { activePlanSummaries, planStatus, seatsForStudent } from '@/lib/seating/repo';
import { getStudent } from '@/lib/session';
import { formatDateTime, relativeTime, todayISO } from '@/lib/time';
import { Hourglass } from '@/components/Engravings';
import { RefreshButton } from './RefreshButton';
import { TimetableView, type TimetableSession } from './TimetableView';
import styles from './timetable.module.css';

export const metadata: Metadata = { title: 'Live Timetable' };
export const dynamic = 'force-dynamic';

export default function TimetablePage() {
  return (
    <div className="container page">
      <header className={styles.head}>
        <p className="eyebrow">Straight from the official sheet</p>
        <h1 className="page-title">
          Live <em>Timetable</em>
        </h1>
      </header>
      <Suspense fallback={<TimetableSkeleton />}>
        <TimetableBody />
      </Suspense>
    </div>
  );
}

function TimetableSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the timetable">
      <p className={styles.status}>
        <span className="pill pill--muted">
          <span className="dot dot--pulse" /> Fetching the latest copy…
        </span>
      </p>
      <div className={styles.skeletonDays}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 64 }} />
        ))}
      </div>
      <div style={{ display: 'grid', gap: 12, marginTop: 28 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 72 }} />
        ))}
      </div>
    </div>
  );
}

async function TimetableBody() {
  const [state, plans, student] = await Promise.all([getTimetable(), activePlanSummaries(), getStudent()]);

  if (state.status === 'unconfigured') {
    return (
      <div className={styles.empty}>
        <Hourglass className={styles.emptyArt} />
        <h2 className={styles.emptyTitle}>
          Not connected <em>yet.</em>
        </h2>
        <p className="muted">
          The official timetable hasn’t been linked to this site. Once the admin pastes the sheet’s share link in the dashboard, the
          schedule appears here and stays in sync automatically.
        </p>
      </div>
    );
  }

  if (state.status === 'disabled' || state.status === 'pending') {
    return (
      <div className={styles.empty}>
        <Hourglass className={styles.emptyArt} />
        <h2 className={styles.emptyTitle}>
          {state.status === 'disabled' ? (
            <>
              Timetable is <em>off.</em>
            </>
          ) : (
            <>
              Waiting for the <em>first copy.</em>
            </>
          )}
        </h2>
        <p className="muted">
          {state.status === 'disabled'
            ? 'The admin has switched the timetable off for now.'
            : 'The timetable source is set up but hasn’t sent a copy yet. It will appear here automatically.'}
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={styles.empty}>
        <Hourglass className={styles.emptyArt} />
        <h2 className={styles.emptyTitle}>
          Can’t reach the <em>timetable.</em>
        </h2>
        <p className="muted">{state.error.message}</p>
        <RefreshButton label="Try again" />
      </div>
    );
  }

  const seats = student ? await seatsForStudent(student.rollNo) : [];
  const seatByPlan = new Map(seats.filter((s) => s.seat).map((s) => [s.plan.id, s.seat!]));
  const changeByKey = new Map(state.changes.filter((c) => c.after).map((c) => [c.key, c]));
  const today = todayISO();

  const sessions: TimetableSession[] = state.data.sessions.map((s) => {
    const date = s.date ?? today;
    const valid = plans.filter((p) => planStatus(p, date) === 'current');
    const plan =
      (s.status === 'exam' ? matchSubject(s.text, valid.filter((p) => p.kind === 'exam')) : null) ??
      matchSubject(s.text, valid.filter((p) => p.kind === 'class')) ??
      matchSubject(s.text, valid);
    const change = changeByKey.get(s.key);
    const seat = plan ? seatByPlan.get(plan.id) : undefined;
    return {
      id: s.id,
      key: s.key,
      date: s.date,
      day: s.day,
      start: s.start,
      end: s.end,
      slotLabel: s.slotLabel,
      text: s.text,
      subject: s.subject,
      faculty: s.faculty,
      room: s.room,
      status: s.status,
      sheet: s.sheet,
      cell: s.cell,
      planCode: plan?.code ?? null,
      planTitle: plan?.title ?? null,
      seat: seat ? { rowLabel: seat.rowLabel, seatNumber: seat.seatNumber } : null,
      changed: change ? { before: change.before } : null,
    };
  });

  const updated = state.sourceModifiedAt ?? state.contentChangedAt;
  return (
    <>
      <div className={styles.statusBar}>
        <p className={styles.status}>
          {state.status === 'ok' ? (
            <span className="pill pill--live">
              <span className="dot dot--pulse" /> Live
            </span>
          ) : (
            <span className="pill pill--warn">Showing last saved copy</span>
          )}
          <span>
            Synced <time dateTime={state.checkedAt}>{relativeTime(state.checkedAt)}</time>
          </span>
          <span className={styles.sep}>·</span>
          <span>
            {state.sourceModifiedAt ? 'Sheet last edited' : 'Last change detected'}{' '}
            <time dateTime={updated} title={formatDateTime(updated)}>
              {formatDateTime(updated)}
            </time>
          </span>
        </p>
        <RefreshButton />
      </div>
      {state.status === 'stale' && state.error && (
        <p className="notice notice--warn" role="status" style={{ marginBottom: 24 }}>
          We couldn’t reach the official sheet just now ({state.error.message}). This is the last copy we saved — it may be out of date.
        </p>
      )}
      <TimetableView
        sessions={sessions}
        sheets={state.data.sheets}
        detected={state.data.detection.ok}
        summary={state.data.detection.summary}
        changes={state.changes}
        today={today}
        showSeats={Boolean(student)}
        fileName={state.fileName}
      />
    </>
  );
}
