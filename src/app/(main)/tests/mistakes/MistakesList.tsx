'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client-api';
import type { Mistake } from '@/lib/quizzes/mistakes';
import type { NotebookQuiz } from '@/lib/quizzes/mistakes-repo';
import styles from '@/components/Board.module.css';

export function MistakesList({ quizzes, mistakes, cleared }: { quizzes: NotebookQuiz[]; mistakes: Mistake[]; cleared: number }) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>('all');
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const quizById = new Map(quizzes.map((q) => [q.id, q]));
  const subjects = [...new Set(quizzes.map((q) => q.subject ?? q.title))].sort();
  const label = (m: Mistake) => {
    const q = quizById.get(m.quizId);
    return q?.subject ?? q?.title ?? '';
  };
  const shown = mistakes.filter((m) => !gone.has(m.questionId) && (filter === 'all' || label(m) === filter));

  async function gotIt(m: Mistake) {
    setGone((s) => new Set(s).add(m.questionId));
    // keepalive: the tick is saved even if the student leaves the page straight away.
    const res = await fetch('/api/mistakes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: m.questionId, cleared: true }),
      keepalive: true,
    }).catch(() => null);
    if (!res?.ok) {
      setError(res ? 'Could not save that. Please try again.' : 'You seem to be offline. Check your connection and try again.');
      setGone((s) => {
        const next = new Set(s);
        next.delete(m.questionId);
        return next;
      });
    }
  }

  async function bringBack() {
    const res = await api('/api/mistakes', { resetAll: true });
    if (!res.ok) return setError(res.error);
    setGone(new Set());
    router.refresh();
  }

  const clearedNow = cleared + gone.size;
  return (
    <>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {subjects.length > 1 && (
        <div className={styles.filters} role="group" aria-label="Filter by subject">
          {['all', ...subjects].map((s) => (
            <button key={s} type="button" className={`btn btn--sm ${filter === s ? 'btn--accent' : 'btn--ghost'}`} aria-pressed={filter === s} onClick={() => setFilter(s)}>
              {s === 'all' ? `All (${mistakes.filter((m) => !gone.has(m.questionId)).length})` : s}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className={styles.empty}>
          {mistakes.length === 0 && cleared === 0 ? 'No mistakes to revise. Take a mock test and any question you miss will show up here.' : 'Nothing left to revise here. Well done.'}
        </p>
      ) : (
        <ol className={styles.list}>
          {shown.map((m) => {
            const quiz = quizById.get(m.quizId);
            return (
              <li key={m.questionId} className={styles.card} data-testid="mistake">
                <span className={styles.meta}>
                  {quiz?.subject ? `${quiz.subject} · ` : ''}
                  {quiz?.title} · Q{m.position + 1} · {m.outcome === 'skipped' ? 'skipped' : 'wrong'}
                </span>
                <p className={styles.cardTitle} style={{ whiteSpace: 'pre-line' }}>
                  {m.prompt}
                </p>
                <ul className={styles.options}>
                  {m.options.map((o) => {
                    const right = m.correct.includes(o.id);
                    const mine = m.chosen.includes(o.id);
                    return (
                      <li key={o.id} className={`${styles.option} ${right ? styles.optionRight : mine ? styles.optionWrong : ''}`}>
                        {o.text}
                        {right && <span className={styles.optionNote}>{mine ? '✓ correct · you picked it' : '✓ correct'}</span>}
                        {mine && !right && <span className={styles.optionNote}>your answer</span>}
                      </li>
                    );
                  })}
                </ul>
                {m.explanation && <p className={styles.explain}>{m.explanation}</p>}
                <div>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => gotIt(m)}>
                    Got it
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {clearedNow > 0 && (
        <p className={styles.meta} style={{ marginTop: 20 }}>
          {clearedNow} marked “Got it”.{' '}
          <button type="button" className={styles.linkButton} onClick={bringBack}>
            Bring them all back
          </button>
        </p>
      )}
    </>
  );
}
