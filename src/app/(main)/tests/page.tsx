import Link from 'next/link';
import type { Metadata } from 'next';
import { getStudent } from '@/lib/session';
import { listPublishedQuizzes, myAttemptSummaries, type QuizRecord } from '@/lib/quizzes/repo';
import { formatDateTime, relativeTime } from '@/lib/time';
import { Hourglass } from '@/components/Engravings';
import styles from './tests.module.css';

export const metadata: Metadata = { title: 'OLT Mock Tests' };
export const dynamic = 'force-dynamic';

function TestCard({ quiz, attempt }: { quiz: QuizRecord; attempt?: { id: string; submittedAt: string | null; score: number | null; maxScore: number | null } }) {
  return (
    <li className={styles.card}>
      <Link href={`/tests/${quiz.id}`} className={styles.cardLink}>
        <div className={styles.cardTop}>
          {quiz.phase === 'live' && (
            <span className="pill pill--live">
              <span className="dot dot--pulse" /> Live
            </span>
          )}
          {quiz.phase === 'upcoming' && <span className="pill">Opens {relativeTime(quiz.opensAt!)}</span>}
          {quiz.phase === 'closed' && <span className="pill pill--muted">Closed</span>}
          {quiz.subject && <span className={styles.subject}>{quiz.subject}</span>}
        </div>
        <h3 className={styles.cardTitle}>{quiz.title}</h3>
        {quiz.description && <p className={styles.cardDesc}>{quiz.description}</p>}
        <dl className={styles.cardMeta}>
          <div>
            <dt>Questions</dt>
            <dd className="tabular">{quiz.questionCount}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd className="tabular">{quiz.durationMinutes ? `${quiz.durationMinutes} min` : 'Untimed'}</dd>
          </div>
          <div>
            <dt>{quiz.phase === 'upcoming' ? 'Opens' : quiz.closesAt ? (quiz.phase === 'closed' ? 'Closed' : 'Closes') : 'Marks'}</dt>
            <dd className="tabular">
              {quiz.phase === 'upcoming' ? formatDateTime(quiz.opensAt!) : quiz.closesAt ? formatDateTime(quiz.closesAt) : quiz.totalPoints}
            </dd>
          </div>
        </dl>
        {attempt && (
          <p className={styles.mine}>
            {attempt.submittedAt ? (
              <>
                Your score{' '}
                <strong className="tabular">
                  {attempt.score} / {attempt.maxScore}
                </strong>
              </>
            ) : (
              <>In progress — resume</>
            )}
          </p>
        )}
        <span className={styles.go} aria-hidden>
          →
        </span>
      </Link>
    </li>
  );
}

export default async function TestsPage() {
  const [quizzes, student] = await Promise.all([listPublishedQuizzes(), getStudent()]);
  const attempts = student ? await myAttemptSummaries(student.rollNo) : [];
  const latest = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) if (!latest.has(a.quizId)) latest.set(a.quizId, a);

  const live = quizzes.filter((q) => q.phase === 'live');
  const upcoming = quizzes.filter((q) => q.phase === 'upcoming').reverse();
  const closed = quizzes.filter((q) => q.phase === 'closed');

  return (
    <div className="container page">
      <header className={styles.head}>
        <p className="eyebrow">Practice for the online tests</p>
        <h1 className="page-title">
          OLT <em>Mock</em> Tests<span className="count">({String(live.length).padStart(2, '0')})</span>
        </h1>
      </header>

      {quizzes.length === 0 ? (
        <section className={styles.empty}>
          <Hourglass className={styles.emptyArt} />
          <div>
            <h2 className={styles.emptyTitle}>
              The sand hasn’t <em>started</em> falling.
            </h2>
            <p className={styles.emptyText}>
              No mock tests have been published yet. The moment one goes live it appears right here — timed, scored, and only for Section E.
            </p>
            {!student && (
              <p className={styles.emptyText}>
                <Link href="/register?next=/tests" className="link">
                  Register now
                </Link>{' '}
                so you’re ready when the first one drops.
              </p>
            )}
          </div>
        </section>
      ) : (
        <div className={styles.sections}>
          {[
            { title: 'Live now', items: live },
            { title: 'Coming up', items: upcoming },
            { title: 'Past tests', items: closed },
          ]
            .filter((g) => g.items.length)
            .map((g) => (
              <section key={g.title} aria-label={g.title}>
                <h2 className={styles.groupTitle}>
                  {g.title}
                  <span className="count">({g.items.length})</span>
                </h2>
                <ul className={styles.grid}>
                  {g.items.map((q) => (
                    <TestCard key={q.id} quiz={q} attempt={latest.get(q.id)} />
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
