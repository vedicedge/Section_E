import Link from 'next/link';
import type { Metadata } from 'next';
import { query } from '@/lib/db';
import { listQuizzes } from '@/lib/quizzes/repo';
import { getTimetableDiagnostics } from '@/lib/timetable/service';
import { formatDateTime, relativeTime } from '@/lib/time';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Admin' };

export default async function AdminHome() {
  const [[counts], quizzes, tt] = await Promise.all([
    query<{ students: number; registered: number; plans: number; attempts: number }>(
      `SELECT (SELECT count(*)::int FROM students WHERE active) AS students,
              (SELECT count(*)::int FROM students WHERE active AND pin_hash IS NOT NULL) AS registered,
              (SELECT count(*)::int FROM seating_plans WHERE active) AS plans,
              (SELECT count(*)::int FROM quiz_attempts WHERE submitted_at IS NOT NULL) AS attempts`,
    ),
    listQuizzes(),
    getTimetableDiagnostics(),
  ]);
  const live = quizzes.filter((q) => q.phase === 'live').length;
  const drafts = quizzes.filter((q) => q.phase === 'draft').length;
  const upcoming = quizzes.filter((q) => q.phase === 'upcoming').length;

  return (
    <div className={styles.stack}>
      <header className={styles.pageHead}>
        <div>
          <p className="eyebrow">Section E · control room</p>
          <h1 className={styles.title}>Overview</h1>
        </div>
        <Link href="/admin/tests/new" className="btn btn--accent">
          New mock test
        </Link>
      </header>

      <div className={styles.cards}>
        <Link href="/admin/students" className={styles.card}>
          <span className={styles.cardLabel}>Students registered</span>
          <span className={`${styles.cardValue} tabular`}>
            {counts?.registered ?? 0}
            <span className="dim" style={{ fontSize: 24 }}>
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
        <Link href="/admin/timetable" className={styles.card}>
          <span className={styles.cardLabel}>Timetable</span>
          <span className={styles.cardValue} style={{ fontSize: 30 }}>
            {!tt.config.url ? 'Not linked' : tt.cache?.lastError ? 'Error' : tt.cache ? 'Synced' : 'Pending'}
          </span>
          <span className={styles.cardNote}>
            {tt.cache?.checkedAt ? `Last sync ${relativeTime(tt.cache.checkedAt)} (${formatDateTime(tt.cache.checkedAt)})` : 'Add the share link to start syncing'}
          </span>
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
              Paste the timetable’s share link
            </Link>{' '}
            (Google Drive / Sheets, OneDrive or any direct .xlsx link).
          </li>
          <li>
            <Link className="link" href="/admin/tests/new">
              Create a mock test
            </Link>{' '}
            — draft it, schedule it, publish it. It appears for students automatically.
          </li>
        </ol>
      </section>
    </div>
  );
}
