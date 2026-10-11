import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getStudent } from '@/lib/session';
import { attemptsFor, getAttempt, getQuestions, getQuiz } from '@/lib/quizzes/repo';
import { formatDateTime } from '@/lib/time';
import styles from './result.module.css';

export const metadata: Metadata = { title: 'Your result' };
export const dynamic = 'force-dynamic';

const LETTERS = 'ABCDEFGH';

function duration(fromIso: string, toIso: string) {
  const s = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min ${s % 60} s`;
}

function verdict(pct: number) {
  if (pct >= 90) return 'Outstanding. Very Section E of you.';
  if (pct >= 75) return 'Strong work — the real OLT should worry.';
  if (pct >= 50) return 'Solid base. Review the misses below.';
  return 'Good practice run — the review below is where the marks are.';
}

export default async function ResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const student = await getStudent();
  if (!student) redirect('/register?next=/tests');
  const attempt = await getAttempt(attemptId);
  if (!attempt || attempt.rollNo !== student.rollNo) notFound();
  if (!attempt.submittedAt || !attempt.result) redirect(`/tests/attempt/${attempt.id}`);

  const [quiz, questions, all] = await Promise.all([getQuiz(attempt.quizId), getQuestions(attempt.quizId), attemptsFor(attempt.quizId, student.rollNo)]);
  if (!quiz) notFound();
  const r = attempt.result;
  const pct = r.maxScore > 0 ? Math.round((Math.max(0, r.score) / r.maxScore) * 100) : 0;
  const reviewOpen = quiz.showAnswers === 'after_submit' || (quiz.showAnswers === 'after_close' && quiz.phase === 'closed');
  const byId = new Map(questions.map((q) => [q.id, q]));
  const canRetake = quiz.phase === 'live' && (quiz.maxAttempts === 0 || all.length < quiz.maxAttempts);

  return (
    <div className="container page">
      <Link href="/tests" className={styles.back}>
        ← All mock tests
      </Link>
      <header className={styles.hero}>
        <p className="eyebrow">{quiz.title} · result</p>
        <p className={styles.score}>
          <span className="tabular">{r.score}</span>
          <span className={styles.of}>/ {r.maxScore}</span>
        </p>
        <p className={styles.verdict}>{verdict(pct)}</p>
        <div className={styles.meter} aria-label={`${pct} percent`}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <dl className={styles.stats}>
          <div>
            <dt>Score</dt>
            <dd className="tabular">{pct}%</dd>
          </div>
          <div>
            <dt>Correct</dt>
            <dd className="tabular">{r.correct}</dd>
          </div>
          <div>
            <dt>Wrong</dt>
            <dd className="tabular">{r.wrong}</dd>
          </div>
          <div>
            <dt>Skipped</dt>
            <dd className="tabular">{r.skipped}</dd>
          </div>
          <div>
            <dt>Time taken</dt>
            <dd className="tabular">{duration(attempt.startedAt, attempt.submittedAt)}</dd>
          </div>
        </dl>
        <p className="hint">
          Submitted {formatDateTime(attempt.submittedAt)}
          {attempt.autoSubmitted ? ' · submitted automatically when time ran out' : ''}
        </p>
        <div className={styles.actions}>
          {canRetake && (
            <Link href={`/tests/${quiz.id}`} className="btn btn--accent">
              Try again
            </Link>
          )}
          <Link href="/tests" className="btn btn--ghost">
            Back to tests
          </Link>
        </div>
      </header>

      <section className={styles.review} aria-labelledby="review-title">
        <h2 id="review-title" className={styles.reviewTitle}>
          Review
        </h2>
        {!reviewOpen ? (
          <p className="notice">
            {quiz.showAnswers === 'never'
              ? 'Answers for this test are not published.'
              : `Correct answers will be shown here once the test closes${quiz.closesAt ? ` (${formatDateTime(quiz.closesAt)})` : ''}.`}
          </p>
        ) : (
          <ol className={styles.list}>
            {r.questions.map((qr, i) => {
              const q = byId.get(qr.questionId);
              if (!q) return null;
              return (
                <li key={qr.questionId} className={`${styles.item} ${styles[qr.outcome]}`}>
                  <div className={styles.itemHead}>
                    <span className={styles.qNum}>{String(i + 1).padStart(2, '0')}</span>
                    <span className={styles.outcome}>
                      {qr.outcome === 'correct' ? `Correct · +${qr.awarded}` : qr.outcome === 'wrong' ? `Wrong · ${qr.awarded}` : 'Skipped · 0'}
                    </span>
                  </div>
                  <p className={styles.prompt}>{q.prompt}</p>
                  <ul className={styles.opts}>
                    {q.options.map((o, oi) => {
                      const correct = qr.correct.includes(o.id);
                      const picked = qr.chosen.includes(o.id);
                      return (
                        <li key={o.id} className={`${correct ? styles.optCorrect : ''} ${picked && !correct ? styles.optWrong : ''}`}>
                          <span className={styles.optLetter}>{LETTERS[oi]}</span>
                          <span>{o.text}</span>
                          {picked && <span className={styles.tag}>Your answer</span>}
                          {correct && <span className={styles.tag}>Correct</span>}
                        </li>
                      );
                    })}
                  </ul>
                  {q.explanation && <p className={styles.explain}>{q.explanation}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
