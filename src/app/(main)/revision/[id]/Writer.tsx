'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { wordCount } from '@/lib/revision/model';
import board from '@/components/Board.module.css';
import styles from '../revision.module.css';

type Answer = { modelAnswer: string; keyPoints: string[] };
type Change = { draft?: string; covered?: number[]; revealed?: true; nailed?: boolean };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const BACKUP = (id: string) => `sectionE.revision.${id}`;

function clock(totalSeconds: number): string {
  const s = Math.abs(totalSeconds);
  return `${totalSeconds < 0 ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Writer({
  questionId,
  minutes,
  keyPointCount,
  initial,
  next,
}: {
  questionId: string;
  minutes: number;
  keyPointCount: number;
  initial: { draft: string; covered: number[]; nailed: boolean; answer: Answer | null };
  next: { id: string; title: string } | null;
}) {
  const [draft, setDraft] = useState(initial.draft);
  const [covered, setCovered] = useState<number[]>(initial.covered);
  const [nailed, setNailed] = useState(initial.nailed);
  const [answer, setAnswer] = useState<Answer | null>(initial.answer);
  const [save, setSave] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const savedDraft = useRef(initial.draft);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clock: counts down from the exam time, then on into overtime ("+1:20").
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(minutes * 60);
  useEffect(() => {
    if (!running) return;
    const endAt = Date.now() + left * 1000;
    const t = setInterval(() => setLeft(Math.round((endAt - Date.now()) / 1000)), 250);
    return () => clearInterval(t);
    // Restarts only when started or paused; `left` is read once as the starting point.
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  // An unsaved draft from an earlier visit (offline, tab closed mid-save) wins over the server copy.
  useEffect(() => {
    try {
      const backup = localStorage.getItem(BACKUP(questionId));
      if (backup !== null && backup !== initial.draft) setDraft(backup);
    } catch {
      /* storage blocked: nothing to restore */
    }
  }, [questionId, initial.draft]);

  const send = useCallback(
    async (change: Change, keepalive = false) => {
      const res = await fetch(`/api/revision/${encodeURIComponent(questionId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change),
        keepalive,
      }).catch(() => null);
      const json = await res?.json().catch(() => null);
      if (!res?.ok) {
        throw new Error(res ? (json?.error?.message ?? 'Could not save. Please try again.') : 'You seem to be offline. Your answer is kept on this device.');
      }
      return json as { answer: Answer | null };
    },
    [questionId],
  );

  const saveDraft = useCallback(
    async (text: string, keepalive = false) => {
      if (text === savedDraft.current) return;
      setSave('saving');
      try {
        await send({ draft: text }, keepalive);
        savedDraft.current = text;
        setSave('saved');
        try {
          localStorage.removeItem(BACKUP(questionId));
        } catch {}
      } catch (err) {
        setSave('error');
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [send, questionId],
  );

  function onType(text: string) {
    setDraft(text);
    setError(null);
    try {
      localStorage.setItem(BACKUP(questionId), text);
    } catch {}
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveDraft(text), 1200);
  }

  // Leaving the page: save what's there, even mid-debounce.
  const latest = useRef(draft);
  latest.current = draft;
  useEffect(() => {
    const flush = () => {
      if (timer.current) clearTimeout(timer.current);
      void saveDraft(latest.current, true);
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [saveDraft]);

  async function reveal() {
    if (timer.current) clearTimeout(timer.current);
    setRunning(false);
    setError(null);
    try {
      const res = await send({ draft, revealed: true });
      savedDraft.current = draft;
      setSave('saved');
      setAnswer(res.answer);
      try {
        localStorage.removeItem(BACKUP(questionId));
      } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function tick(i: number) {
    const nextCovered = covered.includes(i) ? covered.filter((n) => n !== i) : [...covered, i].sort((a, b) => a - b);
    const before = covered;
    setCovered(nextCovered);
    try {
      await send({ covered: nextCovered });
    } catch (err) {
      setCovered(before);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function toggleNailed() {
    const value = !nailed;
    setNailed(value);
    try {
      await send({ nailed: value });
    } catch (err) {
      setNailed(!value);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const words = wordCount(draft);
  const overtime = left < 0;
  const started = running || left !== minutes * 60;

  return (
    <>
      <div className={styles.clockBar}>
        <span className={`${styles.clock} tabular ${overtime ? styles.clockOver : ''}`} role="timer" aria-live="off" data-testid="revision-clock">
          {clock(left)}
        </span>
        <span className={board.meta}>{overtime ? 'Time’s up: finish your point and check it.' : started ? 'left' : `${minutes} minutes, as in the exam`}</span>
        <span className={styles.clockButtons}>
          <button type="button" className={`btn btn--sm ${running ? 'btn--ghost' : 'btn--accent'}`} onClick={() => setRunning((r) => !r)}>
            {running ? 'Pause' : started ? 'Resume' : 'Start the clock'}
          </button>
          {started && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setRunning(false);
                setLeft(minutes * 60);
              }}
            >
              Reset
            </button>
          )}
        </span>
      </div>

      <label className="field">
        <span className="label">Your answer</span>
        <textarea
          className={`textarea ${styles.answer}`}
          value={draft}
          onChange={(e) => onType(e.target.value)}
          onBlur={() => saveDraft(draft)}
          rows={14}
          maxLength={20000}
          placeholder="Write as you would in the exam: frame the problem, apply the concept, conclude with a recommendation."
          data-testid="revision-answer"
        />
      </label>
      <p className={`${board.meta} ${styles.saveLine}`} aria-live="polite">
        <span className="tabular">{words} {words === 1 ? 'word' : 'words'}</span>
        {' · '}
        {save === 'saving' ? 'Saving…' : save === 'saved' ? 'Saved, only you can see it' : save === 'error' ? 'Not saved yet' : 'Saves as you type'}
      </p>
      {error && (
        <p className="notice notice--warn" role="alert">
          {error}
        </p>
      )}

      {!answer ? (
        <div className={styles.revealBox}>
          <p className={board.meta}>When you’re done, compare with the model answer. You can keep editing your answer afterwards.</p>
          <button type="button" className="btn btn--accent" onClick={reveal}>
            Check against the model answer
          </button>
        </div>
      ) : (
        <section className={styles.answerSection} aria-labelledby="model-answer">
          {answer.keyPoints.length > 0 && (
            <div className={`${board.card} ${styles.points}`}>
              <h2 className={styles.sectionTitle}>
                Key points{' '}
                <span className={`${styles.covered} tabular`} data-testid="revision-covered">
                  ({covered.length} of {keyPointCount} covered)
                </span>
              </h2>
              <ul className={styles.pointList}>
                {answer.keyPoints.map((p, i) => (
                  <li key={i}>
                    <label className="check">
                      <input type="checkbox" checked={covered.includes(i)} onChange={() => tick(i)} />
                      <span>{p}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className={`${board.card} ${styles.model}`}>
            <h2 id="model-answer" className={styles.sectionTitle}>
              Model answer
            </h2>
            <div className={styles.modelText}>{answer.modelAnswer}</div>
          </div>
          <div className={styles.endBar}>
            <button type="button" className={`btn ${nailed ? 'btn--ghost' : 'btn--accent'}`} aria-pressed={nailed} onClick={toggleNailed}>
              {nailed ? '✓ Nailed it (undo)' : 'Nailed it'}
            </button>
            {next ? (
              <Link href={`/revision/${next.id}`} className="arrow-link">
                Next: {next.title}
              </Link>
            ) : (
              <Link href="/revision" className="arrow-link">
                All questions
              </Link>
            )}
          </div>
          <p className={board.meta}>“Nailed it” moves this question out of your To revise list. Practise it again any time from the Nailed list.</p>
        </section>
      )}
    </>
  );
}
