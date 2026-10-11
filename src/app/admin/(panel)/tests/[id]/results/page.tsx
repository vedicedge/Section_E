import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getQuiz, resultsForQuiz } from '@/lib/quizzes/repo';
import { formatDateTime } from '@/lib/time';
import { AllowRetake } from './AllowRetake';
import styles from '../../../../admin.module.css';
import { requireAdminPage } from '@/lib/admin-guard';

export const metadata: Metadata = { title: 'Results · Admin' };

export default async function Results({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const [quiz, rows] = await Promise.all([getQuiz(id), resultsForQuiz(id)]);
  if (!quiz) notFound();
  const done = rows.filter((r) => r.submittedAt && r.score !== null);
  const avg = done.length ? done.reduce((n, r) => n + r.score!, 0) / done.length : 0;
  const best = done.length ? Math.max(...done.map((r) => r.score!)) : 0;

  return (
    <div className={styles.stack}>
      <header className={styles.pageHead}>
        <div>
          <Link href={`/admin/tests/${id}`} className="dim" style={{ fontSize: 13 }}>
            ← {quiz.title}
          </Link>
          <h1 className={styles.title} style={{ marginTop: 8 }}>
            Results
          </h1>
        </div>
        {rows.length > 0 && (
          <a href={`/api/admin/quizzes/${id}/export`} className="btn btn--ghost">
            Download CSV
          </a>
        )}
      </header>
      <div className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Submissions</span>
          <span className={`${styles.cardValue} tabular`}>{done.length}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Average</span>
          <span className={`${styles.cardValue} tabular`}>
            {avg.toFixed(1)}
            <span className="dim" style={{ fontSize: 22 }}> / {quiz.totalPoints}</span>
          </span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Highest</span>
          <span className={`${styles.cardValue} tabular`}>{best}</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className={styles.emptyBox}>
          <strong>No attempts yet.</strong>
          Submissions appear here as students finish.
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Student</th>
                <th scope="col">Score</th>
                <th scope="col">✓ / ✗ / –</th>
                <th scope="col">Submitted</th>
                <th scope="col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className={styles.mono}>{i + 1}</td>
                  <th scope="row">
                    {r.name ?? '—'} <span className="dim mono">{r.rollNo}</span>
                  </th>
                  <td className={styles.mono}>{r.submittedAt ? `${r.score} / ${r.maxScore}` : 'In progress'}</td>
                  <td className={styles.mono}>{r.submittedAt ? `${r.correct} / ${r.wrong} / ${r.skipped}` : ''}</td>
                  <td className="dim" style={{ fontSize: 13 }}>
                    {r.submittedAt ? formatDateTime(r.submittedAt) : `Started ${formatDateTime(r.startedAt)}`}
                    {r.autoSubmitted ? ' · auto' : ''}
                  </td>
                  <td>
                    <AllowRetake attemptId={r.id} who={r.name ?? r.rollNo} />
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
