import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTimetable, membersOnly, type TimetableMode } from '@/lib/timetable/service';
import { matchSubject } from '@/lib/timetable/match';
import { activePlanSummaries, planStatus, seatsForStudent } from '@/lib/seating/repo';
import { getStudent } from '@/lib/session';
import { formatDateTime, relativeTime, todayISO } from '@/lib/time';
import { Hourglass, Pavilion } from '@/components/Engravings';
import { RefreshButton } from './RefreshButton';
import { TimetableView, type TimetableSession } from './TimetableView';
import styles from './timetable.module.css';

export const metadata: Metadata = { title: 'Live Timetable' };
export const dynamic = 'force-dynamic';

const PENDING: Record<TimetableMode, string> = {
  relay: 'Waiting for the first update from the Google relay.',
  upload: 'Waiting for the admin to upload the timetable.',
  link: 'The timetable source is set up but hasn’t sent a copy yet.',
};

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
          <span className="dot dot--pulse" aria-hidden="true" /> Fetching the latest copy…
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

  if ('mode' in state && membersOnly(state.mode) && !student) {
    return (
      <div className={styles.empty}>
        <Pavilion className={styles.emptyArt} />
        <h2 className={styles.emptyTitle}>
          For Section E <em>only.</em>
        </h2>
        <p className="muted">
          The official sheet is shared only with the section, so this copy is too. Register with your roll number to see the timetable —
          with your seat next to every class.
        </p>
        <Link href="/register?next=/timetable" className="btn btn--accent">
          Register to view
        </Link>
      </div>
    );
  }

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

  if (state.status === 'disabled') {
    return (
      <div className={styles.empty}>
        <Pavilion className={styles.emptyArt} />
        <h2 className={styles.emptyTitle}>
          The timetable is <em>switched off.</em>
        </h2>
        <p className="muted">The admin has turned it off for now — check back later.</p>
        <Link href="/" className="btn btn--ghost">
          Back to home
        </Link>
      </div>
    );
  }

  if (state.status === 'pending') {
    return (
      <div className={styles.empty}>
        <Hourglass className={styles.emptyArt} />
        <h2 className={styles.emptyTitle}>
          Waiting for the <em>first copy.</em>
        </h2>
        <p className="muted">{PENDING[state.mode]} It appears here automatically as soon as it arrives.</p>
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
        {state.mode === 'link' && <RefreshButton label="Try again" />}
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

  const { mode, checkedAt, sourceModifiedAt, contentChangedAt, error } = state;
  const quiet = state.status === 'stale' && error?.code === 'relay_quiet';
  return (
    <>
      <div className={styles.statusBar}>
        <p className={styles.status}>
          {state.status === 'stale' ? (
            <span className="pill pill--warn">Showing last saved copy</span>
          ) : mode === 'upload' ? (
            <span className="pill pill--muted">Admin upload</span>
          ) : (
            <span className="pill pill--live">
              <span className="dot dot--pulse" aria-hidden="true" /> Live
            </span>
          )}
          {mode === 'upload' ? (
            <span>
              Uploaded <time dateTime={checkedAt}>{formatDateTime(checkedAt)}</time>
            </span>
          ) : (
            <span>
              {mode === 'relay' ? 'Synced via Google relay' : 'Synced'}{' '}
              <time dateTime={checkedAt} title={formatDateTime(checkedAt)}>
                {relativeTime(checkedAt)}
              </time>
            </span>
          )}
          {sourceModifiedAt ? (
            <>
              <span className={styles.sep} aria-hidden="true">
                ·
              </span>
              <span>
                Sheet last edited <time dateTime={sourceModifiedAt}>{formatDateTime(sourceModifiedAt)}</time>
              </span>
            </>
          ) : (
            mode !== 'upload' && (
              <>
                <span className={styles.sep} aria-hidden="true">
                  ·
                </span>
                <span>
                  Last change detected <time dateTime={contentChangedAt}>{formatDateTime(contentChangedAt)}</time>
                </span>
              </>
            )
          )}
        </p>
        {mode === 'link' && <RefreshButton />}
      </div>
      {quiet ? (
        <p className={`notice notice--warn ${styles.notice}`} role="status">
          The timetable normally updates itself every 10 minutes, but the Google relay last checked in {relativeTime(checkedAt)}. This copy may be out of
          date — confirm anything important with your class representative.
        </p>
      ) : state.status === 'stale' && error ? (
        <p className={`notice notice--warn ${styles.notice}`} role="status">
          We couldn’t reach the official sheet just now ({error.message}). This is the last copy we saved — it may be out of date.
        </p>
      ) : (
        error &&
        mode !== 'link' && (
          <p className={`notice notice--warn ${styles.notice}`} role="status">
            The newest version of the sheet couldn’t be read, so this is the last copy that could.
          </p>
        )
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
