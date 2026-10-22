import Link from 'next/link';
import type { Metadata } from 'next';
import { formatPercent } from '@/lib/attendance/calc';
import { attendanceSummary } from '@/lib/attendance/repo';
import { query } from '@/lib/db';
import { env } from '@/lib/env';
import { openHomeworkCount } from '@/lib/homework/repo';
import { pushConfigured, subscriptionStats } from '@/lib/push';
import { listQuizzes } from '@/lib/quizzes/repo';
import { getTimetableDiagnostics, type TimetableDiagnostics } from '@/lib/timetable/service';
import { formatDateTime, relativeTime } from '@/lib/time';
import styles from '../admin.module.css';
import { requireAdminPage } from '@/lib/admin-guard';

export const metadata: Metadata = { title: 'Admin' };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One line for the Timetable card, by switch and source mode. */
function timetableSummary(tt: TimetableDiagnostics, now: number): { value: string; note: string } {
  const { config } = tt;
  // A copy from a previous source doesn't describe the current one.
  const copy = tt.cache?.sourceMatches ? tt.cache : null;
  if (!config.enabled) return { value: 'Off', note: 'Hidden from students · homework uses fixed due dates' };

  if (config.mode === 'relay') {
    if (!copy) {
      return { value: 'Relay', note: config.hasRelayKey ? 'Waiting for the Apps Script’s first check-in' : 'Create a relay key and install the Apps Script' };
    }
    const quiet = now - Date.parse(copy.checkedAt) > tt.relayQuietHours * 3600_000;
    const when = `${relativeTime(copy.checkedAt, now)} (${formatDateTime(copy.checkedAt)})`;
    const note = quiet ? `Quiet — last check-in ${when}` : `Last check-in ${when}`;
    return { value: 'Relay', note: copy.lastError ? `The last file couldn’t be read · ${note}` : note };
  }

  if (config.mode === 'upload') {
    if (!copy) return { value: 'Not uploaded', note: 'Upload the timetable workbook to publish it' };
    const note = `${copy.fileName ?? 'Workbook'} · ${formatDateTime(copy.checkedAt)}`;
    return { value: 'Uploaded', note: copy.lastError ? `The last upload couldn’t be read · still showing ${note}` : note };
  }

  if (!config.url) return { value: 'Not linked', note: 'Add the share link to start syncing' };
  return {
    value: copy?.lastError ? 'Error' : copy ? 'Synced' : 'Pending',
    note: copy ? `Last sync ${relativeTime(copy.checkedAt, now)} (${formatDateTime(copy.checkedAt)})` : 'The first copy is fetched on the next visit',
  };
}

export default async function AdminHome() {
  await requireAdminPage();
  const [[counts], quizzes, tt, openHomework, subscribers, attendance] = await Promise.all([
    query<{ students: number; registered: number; plans: number; attempts: number }>(
      `SELECT (SELECT count(*)::int FROM students WHERE active) AS students,
              (SELECT count(*)::int FROM students WHERE active AND pin_hash IS NOT NULL) AS registered,
              (SELECT count(*)::int FROM seating_plans WHERE active) AS plans,
              (SELECT count(*)::int FROM quiz_attempts WHERE submitted_at IS NOT NULL) AS attempts`,
    ),
    listQuizzes(),
    getTimetableDiagnostics(),
    openHomeworkCount(),
    pushConfigured() ? subscriptionStats() : Promise.resolve(null),
    attendanceSummary(),
  ]);
  const live = quizzes.filter((q) => q.phase === 'live').length;
  const drafts = quizzes.filter((q) => q.phase === 'draft').length;
  const upcoming = quizzes.filter((q) => q.phase === 'upcoming').length;
  const timetable = timetableSummary(tt, Date.now());

  return (
    <div className={styles.stack}>
      <header className={styles.pageHead}>
        <div>
          <p className="eyebrow">Section E · control room</p>
          <h1 className={styles.title}>Overview</h1>
        </div>
        <div className={styles.actions}>
          <Link href="/admin/homework" className="btn btn--ghost">
            Post homework
          </Link>
          <Link href="/admin/tests/new" className="btn btn--accent">
            New mock test
          </Link>
        </div>
      </header>

      <div className={styles.cards}>
        <Link href="/admin/students" className={styles.card}>
          <span className={styles.cardLabel}>Students registered</span>
          <span className={`${styles.cardValue} tabular`}>
            {counts?.registered ?? 0}
            <span className={styles.dim} style={{ fontSize: 24 }}>
              {' '}
              / {counts?.students ?? 0}
            </span>
          </span>
          <span className={styles.cardNote}>{counts?.students ? 'On the roster from the seating plans' : 'Upload a seating plan to create the roster'}</span>
        </Link>
        <Link href="/admin/seating" className={styles.card}>
          <span className={styles.cardLabel}>Seating plans</span>
          <span className={`${styles.cardValue} tabular`}>{counts?.plans ?? 0}</span>
          <span className={styles.cardNote}>Active subject / exam arrangements</span>
        </Link>
        <Link href="/admin/tests" className={styles.card}>
          <span className={styles.cardLabel}>Mock tests</span>
          <span className={`${styles.cardValue} tabular`}>{live}</span>
          <span className={styles.cardNote}>
            live · {upcoming} scheduled · {drafts} draft · {counts?.attempts ?? 0} submissions
          </span>
        </Link>
        <Link href="/admin/homework" className={styles.card}>
          <span className={styles.cardLabel}>Homework</span>
          <span className={`${styles.cardValue} tabular`}>{openHomework}</span>
          <span className={styles.cardNote}>{openHomework === 1 ? 'item' : 'items'} due today or later, or still awaiting a date</span>
        </Link>
        <Link href="/admin/homework" className={styles.card}>
          <span className={styles.cardLabel}>Reminders</span>
          <span className={styles.cardValue} style={{ fontSize: 30 }}>
            {subscribers ? `${plural(subscribers.students, 'student')} on` : 'Not set up'}
          </span>
          <span className={styles.cardNote}>
            {!subscribers
              ? 'Add the VAPID keys to offer push reminders'
              : env.cronSecret
                ? `${plural(subscribers.devices, 'device')} · a push the evening before homework is due`
                : `${plural(subscribers.devices, 'device')} · set CRON_SECRET so the evening reminder runs`}
          </span>
        </Link>
        <Link href="/admin/attendance" className={styles.card}>
          <span className={styles.cardLabel}>Attendance</span>
          <span className={`${styles.cardValue} tabular`}>{attendance.tracking}</span>
          <span className={styles.cardNote}>
            {attendance.enabled
              ? `${attendance.tracking === 1 ? 'student' : 'students'} counting · ${plural(attendance.subjects.length, 'subject')} · ${plural(attendance.hearts, 'heart')} at ${formatPercent(attendance.minPercent)}%`
              : 'Hidden from students'}
          </span>
        </Link>
        <Link href="/admin/timetable" className={styles.card}>
          <span className={styles.cardLabel}>Timetable</span>
          <span className={styles.cardValue} style={{ fontSize: 30 }}>
            {timetable.value}
          </span>
          <span className={styles.cardNote}>{timetable.note}</span>
        </Link>
      </div>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Getting set up</h2>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
          <li>
            <Link className="link" href="/admin/seating">
              Upload the seating-plan workbook
            </Link>{' '}
            — it also creates the roster students register against.
          </li>
          <li>
            <Link className="link" href="/admin/timetable">
              Connect the timetable
            </Link>{' '}
            — paste a public share link (Google Drive / Sheets, OneDrive or any direct .xlsx link). If the sheet is restricted to
            specific email IDs, use the Google Apps Script relay instead, or upload the .xlsx by hand. You can also switch the
            timetable off entirely.
          </li>
          <li>
            <Link className="link" href="/admin/tests/new">
              Create a mock test
            </Link>{' '}
            — draft it, schedule it, publish it. It appears for students automatically.
          </li>
          <li>
            <Link className="link" href="/admin/homework">
              Post homework
            </Link>{' '}
            — due next class (it follows the timetable) or on a fixed date. Registered students see it on their homework page.
          </li>
          <li>
            Turn on reminders — set <code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> and <code>VAPID_PRIVATE_KEY</code> (generate them with{' '}
            <code>npx web-push generate-vapid-keys</code>) plus <code>CRON_SECRET</code>, then redeploy. Students can then opt in to a
            push the evening before something is due.
          </li>
        </ol>
      </section>
    </div>
  );
}
