import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStudent } from '@/lib/session';
import { attemptsFor, getQuiz, GRACE_SECONDS } from '@/lib/quizzes/repo';
import { formatDateTime } from '@/lib/time';
import { StartButton } from './StartButton';
import styles from './detail.module.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const quiz = await getQuiz((await params).id);
  return { title: quiz && quiz.status === 'published' ? quiz.title : 'Mock test' };
}

export default async function TestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [quiz, student] = await Promise.all([getQuiz(id), getStudent()]);
  if (!quiz || quiz.status !== 'published') notFound();

  const attempts = student ? await attemptsFor(quiz.id, student.rollNo) : [];
  const inProgress = attempts.find(
    (a) => !a.submittedAt && (!a.deadlineAt || Date.parse(a.deadlineAt) + GRACE_SECONDS * 1000 > Date.now()),
  );
  const submitted = attempts.filter((a) => a.submittedAt);
  const left = quiz.maxAttempts === 0 ? Infinity : quiz.maxAttempts - attempts.filter((a) => a !== inProgress).length;

  const defaultRules = [
    quiz.durationMinutes
      ? `You have ${quiz.durationMinutes} minutes once you start. The timer keeps running if you close the tab, and the test submits itself when time is up.`
      : 'There is no time limit — take your time.',
    'Answers are saved as you go, so a dropped connection won’t lose your work.',
    'Use the question grid to jump around, and flag questions to come back to.',
    quiz.negativeMarking > 0
      ? `Wrong answers cost ${quiz.negativeMarking * 100}% of the question’s marks. Unanswered questions score zero.`
      : 'There is no negative marking.',
  ];

  return (
    <div className="container page">
      <Link href="/tests" className={styles.back}>
        ← All mock tests
      </Link>
      <header className={styles.head}>
        <p className="eyebrow">
          {quiz.subject ? `${quiz.subject} · ` : ''}
          {quiz.phase === 'live' ? 'Open now' : quiz.phase === 'upcoming' ? 'Opens soon' : 'Closed'}
        </p>
        <h1 className={styles.title}>{quiz.title}</h1>
        {quiz.description && <p className={styles.desc}>{quiz.description}</p>}
      </header>

      <div className={styles.layout}>
        <section className={styles.rules} aria-labelledby="rules">
          <h2 id="rules" className="eyebrow">
            Before you begin
          </h2>
          {quiz.instructions ? (
            <div className={styles.instructions}>{quiz.instructions}</div>
          ) : null}
          <ol className={styles.ruleList}>
            {defaultRules.map((r, i) => (
              <li key={i}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                {r}
              </li>
            ))}
          </ol>
        </section>

        <aside className={styles.side}>
          <dl className={styles.facts}>
            <div>
              <dt>Questions</dt>
              <dd className="tabular">{quiz.questionCount}</dd>
            </div>
            <div>
              <dt>Total marks</dt>
              <dd className="tabular">{quiz.totalPoints}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd className="tabular">{quiz.durationMinutes ? `${quiz.durationMinutes} min` : 'Untimed'}</dd>
            </div>
            <div>
              <dt>Attempts</dt>
              <dd className="tabular">{quiz.maxAttempts === 0 ? 'Unlimited' : quiz.maxAttempts}</dd>
            </div>
            {quiz.opensAt && (
              <div>
                <dt>Opens</dt>
                <dd>{formatDateTime(quiz.opensAt)}</dd>
              </div>
            )}
            {quiz.closesAt && (
              <div>
                <dt>Closes</dt>
                <dd>{formatDateTime(quiz.closesAt)}</dd>
              </div>
            )}
          </dl>

          <div className={styles.action}>
            {!student ? (
              <>
                <p className="hint">Register with your roll number to take this test.</p>
                <Link href={`/register?next=/tests/${quiz.id}`} className="btn btn--accent btn--block">
                  Register to start
                </Link>
              </>
            ) : inProgress ? (
              <Link href={`/tests/attempt/${inProgress.id}`} className="btn btn--accent btn--block">
                Resume your attempt →
              </Link>
            ) : quiz.phase === 'upcoming' ? (
              <p className="hint">This test opens {formatDateTime(quiz.opensAt!)}. Come back then.</p>
            ) : quiz.phase === 'closed' ? (
              <p className="hint">This test has closed.</p>
            ) : left <= 0 ? (
              <p className="hint">You’ve used all your attempts.</p>
            ) : (
              <StartButton quizId={quiz.id} timed={Boolean(quiz.durationMinutes)} />
            )}
          </div>

          {submitted.length > 0 && (
            <div className={styles.history}>
              <p className="eyebrow">Your attempts</p>
              <ul>
                {submitted.map((a) => (
                  <li key={a.id}>
                    <Link href={`/tests/result/${a.id}`}>
                      <span className="tabular">
                        {a.score} / {a.maxScore}
                      </span>
                      <span className="muted">{formatDateTime(a.submittedAt!)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
