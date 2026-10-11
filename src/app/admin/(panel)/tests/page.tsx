import Link from 'next/link';
import type { Metadata } from 'next';
import { query } from '@/lib/db';
import { listQuizzes } from '@/lib/quizzes/repo';
import { formatDateTime } from '@/lib/time';
import { QuizRowActions } from './QuizRowActions';
import styles from '../../admin.module.css';
import { requireAdminPage } from '@/lib/admin-guard';

export const metadata: Metadata = { title: 'Mock tests · Admin' };

const PHASE: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'pill pill--muted' },
  upcoming: { label: 'Scheduled', cls: 'pill pill--warn' },
  live: { label: 'Live', cls: 'pill pill--live' },
  closed: { label: 'Closed', cls: 'pill' },
};

export default async function AdminTests() {
  await requireAdminPage();
  const [quizzes, counts] = await Promise.all([
    listQuizzes(),
    query<{ quiz_id: string; n: number }>(`SELECT quiz_id, count(*)::int AS n FROM quiz_attempts WHERE submitted_at IS NOT NULL GROUP BY quiz_id`),
  ]);
  const attempts = new Map(counts.map((c) => [c.quiz_id, Number(c.n)]));

  return (
    <div className={styles.stack}>
      <header className={styles.pageHead}>
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className={styles.title}>Mock tests</h1>
          <p className={styles.lede}>Drafts are invisible to students. Published tests appear on the site at their opening time and lock at their closing time.</p>
        </div>
        <Link href="/admin/tests/new" className="btn btn--accent">
          New mock test
        </Link>
      </header>

      {quizzes.length === 0 ? (
        <div className={styles.emptyBox}>
          <strong>No tests yet.</strong>
          Create your first mock — paste questions in bulk or build them one by one.
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Test</th>
                <th scope="col">Status</th>
                <th scope="col">Questions</th>
                <th scope="col">Window</th>
                <th scope="col">Submissions</th>
                <th scope="col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {quizzes.map((q) => (
                <tr key={q.id}>
                  <th scope="row">
                    <Link href={`/admin/tests/${q.id}`} className="link">
                      {q.title}
                    </Link>
                    {q.subject && <div className="dim" style={{ fontSize: 12 }}>{q.subject}</div>}
                  </th>
                  <td>
                    <span className={PHASE[q.phase]!.cls}>{PHASE[q.phase]!.label}</span>
                  </td>
                  <td className={styles.mono}>
                    {q.questionCount} · {q.totalPoints} marks{q.durationMinutes ? ` · ${q.durationMinutes} min` : ''}
                  </td>
                  <td className="dim" style={{ fontSize: 13 }}>
                    {q.opensAt ? formatDateTime(q.opensAt) : 'Immediately'} → {q.closesAt ? formatDateTime(q.closesAt) : 'no close'}
                  </td>
                  <td className={styles.mono}>
                    <Link href={`/admin/tests/${q.id}/results`} className="link">
                      {attempts.get(q.id) ?? 0}
                    </Link>
                  </td>
                  <td>
                    <QuizRowActions id={q.id} status={q.status} title={q.title} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
