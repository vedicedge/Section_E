'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './runner.module.css';

export interface RunnerQuestion {
  id: string;
  prompt: string;
  options: { id: string; text: string }[];
  multiple: boolean;
  points: number;
}

type Answers = Record<string, string[]>;
type SaveState = 'saved' | 'saving' | 'unsaved' | 'offline';

const LETTERS = 'ABCDEFGH';

function fmt(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function QuizRunner(props: {
  attemptId: string;
  quizId: string;
  title: string;
  deadlineAt: string | null;
  serverNow: number;
  questions: RunnerQuestion[];
  initialAnswers: Answers;
  initialFlagged: string[];
  negativeMarking: number;
}) {
  const { attemptId, questions, deadlineAt } = props;
  const router = useRouter();
  const storageKey = `se-attempt-${attemptId}`;

  const [answers, setAnswers] = useState<Answers>(props.initialAnswers);
  const [flagged, setFlagged] = useState<string[]>(props.initialFlagged);
  const [index, setIndex] = useState(0);
  const [save, setSave] = useState<SaveState>('saved');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  const offset = useRef(0);
  const dirty = useRef(false);
  const submitted = useRef(false);
  const latest = useRef({ answers, flagged });
  useEffect(() => {
    latest.current = { answers, flagged };
  }, [answers, flagged]);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Clock: trust the server's time, not the device's.
  useEffect(() => {
    offset.current = props.serverNow - Date.now();
  }, [props.serverNow]);

  // Restore an unsynced local backup (e.g. the tab closed while offline).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const local = JSON.parse(raw) as { answers: Answers; flagged: string[] };
      const valid = new Set(questions.map((q) => q.id));
      const merged = { ...props.initialAnswers };
      let changed = false;
      for (const [k, v] of Object.entries(local.answers ?? {})) {
        if (valid.has(k) && !merged[k]?.length && v.length) {
          merged[k] = v;
          changed = true;
        }
      }
      if (changed) {
        setAnswers(merged);
        dirty.current = true;
        setSave('unsaved');
      }
    } catch {
      /* storage unavailable — fine */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(async () => {
    if (submitted.current) return;
    const payload = latest.current;
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
    if (!dirty.current) return;
    dirty.current = false;
    setSave('saving');
    try {
      const res = await fetch(`/api/attempts/${attemptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 409) {
        // Time ran out on the server.
        submitted.current = true;
        router.replace(`/tests/result/${attemptId}`);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { serverNow: number };
      offset.current = data.serverNow - Date.now();
      setSave(dirty.current ? 'unsaved' : 'saved');
    } catch {
      dirty.current = true;
      setSave('offline');
    }
  }, [attemptId, router, storageKey]);

  // Debounced autosave + periodic retry.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(persist, 900);
    return () => clearTimeout(t);
  }, [answers, flagged, persist]);
  useEffect(() => {
    const t = setInterval(() => dirty.current && persist(), 10_000);
    const onHide = () => document.visibilityState === 'hidden' && persist();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [persist]);

  const submit = useCallback(
    async (auto = false) => {
      if (submitted.current) return;
      submitted.current = true;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch(`/api/attempts/${attemptId}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...latest.current, auto }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error?.message ?? 'Submission failed.');
        try {
          localStorage.removeItem(storageKey);
        } catch {
          /* ignore */
        }
        router.replace(data.resultUrl);
      } catch (e) {
        submitted.current = false;
        setSubmitting(false);
        setError(`${(e as Error).message} Your answers are saved — try again.`);
      }
    },
    [attemptId, router, storageKey],
  );

  // Countdown.
  useEffect(() => {
    if (!deadlineAt) return;
    const deadline = Date.parse(deadlineAt);
    const tick = () => {
      const left = deadline - (Date.now() + offset.current);
      setRemaining(left);
      if (left <= 0) submit(true);
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [deadlineAt, submit]);

  const q = questions[index]!;
  const chosen = answers[q.id] ?? [];
  const isFlagged = flagged.includes(q.id);
  const answeredCount = questions.filter((x) => answers[x.id]?.length).length;
  const unanswered = questions.length - answeredCount;

  const choose = useCallback(
    (optionId: string) => {
      dirty.current = true;
      setSave('unsaved');
      setAnswers((prev) => {
        const current = prev[q.id] ?? [];
        let next: string[];
        if (q.multiple) next = current.includes(optionId) ? current.filter((o) => o !== optionId) : [...current, optionId];
        else next = current[0] === optionId ? [] : [optionId];
        return { ...prev, [q.id]: next };
      });
    },
    [q],
  );

  const toggleFlag = useCallback(() => {
    dirty.current = true;
    setSave('unsaved');
    setFlagged((prev) => (prev.includes(q.id) ? prev.filter((f) => f !== q.id) : [...prev, q.id]));
  }, [q.id]);

  const go = useCallback((i: number) => {
    setIndex(Math.max(0, Math.min(questions.length - 1, i)));
    setNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [questions.length]);

  // Keyboard: A–H / 1–8 choose, ←/→ navigate, F flags.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirming || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      const key = e.key.toUpperCase();
      const letter = LETTERS.indexOf(key);
      const digit = Number(e.key) - 1;
      const pick = letter >= 0 && key.length === 1 ? letter : digit >= 0 && digit < 8 ? digit : -1;
      if (pick >= 0 && pick < q.options.length) {
        e.preventDefault();
        choose(q.options[pick]!.id);
      } else if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
      else if (key === 'F') toggleFlag();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, index, choose, go, toggleFlag, confirming]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (confirming && !d.open) d.showModal();
    if (!confirming && d.open) d.close();
  }, [confirming]);

  // Warn before leaving with unsaved work.
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (!submitted.current && dirty.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, []);

  const urgency = remaining === null ? '' : remaining < 60_000 ? styles.timerCritical : remaining < 5 * 60_000 ? styles.timerLow : '';
  const saveLabel = useMemo(
    () => ({ saved: 'All answers saved', saving: 'Saving…', unsaved: 'Saving soon…', offline: 'Offline — will retry' })[save],
    [save],
  );

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <div className={styles.barLeft}>
          <Link href={`/tests/${props.quizId}`} className={styles.exit} aria-label="Leave (your answers are saved)">
            ×
          </Link>
          <div>
            <p className={styles.barTitle}>{props.title}</p>
            <p className={`${styles.save} ${save === 'offline' ? styles.saveBad : ''}`} aria-live="polite">
              {saveLabel}
            </p>
          </div>
        </div>
        {remaining !== null && (
          <div className={`${styles.timer} ${urgency}`} role="timer" aria-label={`Time left ${fmt(remaining)}`}>
            <span className={styles.timerLabel}>Time left</span>
            <span className="tabular">{fmt(remaining)}</span>
          </div>
        )}
        <button className="btn btn--accent btn--sm" onClick={() => setConfirming(true)} disabled={submitting}>
          Submit
        </button>
      </header>

      <div className={styles.progress} aria-hidden>
        <span style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
      </div>

      <div className={styles.body}>
        <section className={styles.question} aria-labelledby="q-prompt">
          <p className={styles.qMeta}>
            <span>
              Question <strong className="tabular">{index + 1}</strong> of {questions.length}
            </span>
            <span>
              {q.points} mark{q.points === 1 ? '' : 's'}
              {props.negativeMarking > 0 ? ` · −${Number((props.negativeMarking * q.points).toFixed(2))} if wrong` : ''}
            </span>
            {q.multiple && <span className="pill pill--warn">Select all that apply</span>}
          </p>
          <h1 id="q-prompt" className={styles.prompt}>
            {q.prompt}
          </h1>

          <div className={styles.options} role={q.multiple ? 'group' : 'radiogroup'} aria-labelledby="q-prompt">
            {q.options.map((o, i) => {
              const on = chosen.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  role={q.multiple ? 'checkbox' : 'radio'}
                  aria-checked={on}
                  className={`${styles.option} ${on ? styles.optionOn : ''}`}
                  onClick={() => choose(o.id)}
                >
                  <span className={styles.letter}>{LETTERS[i]}</span>
                  <span className={styles.optionText}>{o.text}</span>
                </button>
              );
            })}
          </div>

          <div className={styles.controls}>
            <button className="btn btn--ghost" onClick={() => go(index - 1)} disabled={index === 0}>
              ← Previous
            </button>
            <button className={`btn btn--ghost ${isFlagged ? styles.flagOn : ''}`} onClick={toggleFlag} aria-pressed={isFlagged}>
              {isFlagged ? '★ Flagged' : '☆ Flag for review'}
            </button>
            {index < questions.length - 1 ? (
              <button className="btn" onClick={() => go(index + 1)}>
                Next →
              </button>
            ) : (
              <button className="btn btn--accent" onClick={() => setConfirming(true)}>
                Finish & submit
              </button>
            )}
          </div>
          <p className={styles.keys}>Keyboard: A–{LETTERS[q.options.length - 1]} to answer · ← → to move · F to flag</p>
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
        </section>

        <aside className={`${styles.nav} ${navOpen ? styles.navOpen : ''}`} aria-label="Question navigator">
          <button type="button" className={styles.navToggle} onClick={() => setNavOpen((v) => !v)} aria-expanded={navOpen}>
            <span>
              {answeredCount}/{questions.length} answered{flagged.length ? ` · ${flagged.length} flagged` : ''}
            </span>
            <span aria-hidden>{navOpen ? '▾' : '▴'}</span>
          </button>
          <div className={styles.navInner}>
            <p className="eyebrow">Questions</p>
            <ol className={styles.navGrid}>
              {questions.map((x, i) => {
                const done = Boolean(answers[x.id]?.length);
                const flag = flagged.includes(x.id);
                return (
                  <li key={x.id}>
                    <button
                      type="button"
                      onClick={() => go(i)}
                      className={`${styles.navItem} ${done ? styles.navDone : ''} ${flag ? styles.navFlag : ''} ${i === index ? styles.navCurrent : ''}`}
                      aria-label={`Question ${i + 1}${done ? ', answered' : ', not answered'}${flag ? ', flagged' : ''}`}
                      aria-current={i === index ? 'step' : undefined}
                    >
                      {i + 1}
                    </button>
                  </li>
                );
              })}
            </ol>
            <ul className={styles.legend}>
              <li>
                <span className={`${styles.swatch} ${styles.navDone}`} /> Answered
              </li>
              <li>
                <span className={`${styles.swatch} ${styles.navFlag}`} /> Flagged
              </li>
              <li>
                <span className={styles.swatch} /> Not answered
              </li>
            </ul>
          </div>
        </aside>
      </div>

      <dialog ref={dialogRef} className={styles.dialog} onClose={() => setConfirming(false)} aria-labelledby="confirm-title">
        <h2 id="confirm-title" className={styles.dialogTitle}>
          Submit your test?
        </h2>
        <dl className={styles.dialogStats}>
          <div>
            <dt>Answered</dt>
            <dd className="tabular">{answeredCount}</dd>
          </div>
          <div>
            <dt>Unanswered</dt>
            <dd className="tabular">{unanswered}</dd>
          </div>
          <div>
            <dt>Flagged</dt>
            <dd className="tabular">{flagged.length}</dd>
          </div>
        </dl>
        {unanswered > 0 && <p className="hint">You still have {unanswered} unanswered question{unanswered === 1 ? '' : 's'}.</p>}
        <p className="hint">Once submitted, answers can’t be changed.</p>
        <div className={styles.dialogActions}>
          <button className="btn btn--ghost" onClick={() => setConfirming(false)} disabled={submitting}>
            Keep working
          </button>
          <button className="btn btn--accent" onClick={() => submit(false)} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit now'}
          </button>
        </div>
      </dialog>

      {submitting && !confirming && (
        <div className={styles.overlay} role="status">
          Submitting your answers…
        </div>
      )}
    </div>
  );
}
