'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/lib/client-api';
import { parseBulkQuestions } from '@/lib/quizzes/bulk';
import { fromLocalInput, toLocalInput, APP_TZ } from '@/lib/time';
import styles from '../../admin.module.css';
import ed from './editor.module.css';

interface Option {
  id: string;
  text: string;
}
export interface EditorQuestion {
  key: string;
  id?: string;
  prompt: string;
  options: Option[];
  correct: string[];
  multiple: boolean;
  points: number;
  explanation: string;
}
export interface EditorInitial {
  id: string | null;
  status: 'draft' | 'published';
  phase: string;
  title: string;
  subject: string | null;
  description: string;
  instructions: string;
  durationMinutes: number | null;
  opensAt: string | null;
  closesAt: string | null;
  maxAttempts: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showAnswers: 'after_submit' | 'after_close' | 'never';
  negativeMarking: number;
  questions: Omit<EditorQuestion, 'key'>[];
  attempts: number;
}

const LETTERS = 'ABCDEFGH';
const OPTION_IDS = 'abcdefgh'.split('');
let keySeq = 0;
const newKey = () => `q${Date.now().toString(36)}${(keySeq++).toString(36)}`;

function blankQuestion(key = newKey()): EditorQuestion {
  return {
    key,
    prompt: '',
    options: OPTION_IDS.slice(0, 4).map((id) => ({ id, text: '' })),
    correct: [],
    multiple: false,
    points: 1,
    explanation: '',
  };
}

export function QuizEditor({ initial, subjects, flash }: { initial: EditorInitial; subjects: string[]; flash?: string | null }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [subject, setSubject] = useState(initial.subject ?? '');
  const [description, setDescription] = useState(initial.description);
  const [instructions, setInstructions] = useState(initial.instructions);
  const [duration, setDuration] = useState(initial.durationMinutes ? String(initial.durationMinutes) : '');
  const [opensAt, setOpensAt] = useState(toLocalInput(initial.opensAt));
  const [closesAt, setClosesAt] = useState(toLocalInput(initial.closesAt));
  const [maxAttempts, setMaxAttempts] = useState(String(initial.maxAttempts));
  const [shuffleQuestions, setShuffleQuestions] = useState(initial.shuffleQuestions);
  const [shuffleOptions, setShuffleOptions] = useState(initial.shuffleOptions);
  const [showAnswers, setShowAnswers] = useState(initial.showAnswers);
  const [negative, setNegative] = useState(String(initial.negativeMarking));
  const [questions, setQuestions] = useState<EditorQuestion[]>(
    // Deterministic keys for the first render so server and client markup match.
    initial.questions.length ? initial.questions.map((q, i) => ({ ...q, key: `init-${i}` })) : [blankQuestion('init-0')],
  );
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(flash ? { kind: 'ok', text: flash } : null);
  const [dirty, setDirty] = useState(false);

  const bulk = useMemo(() => (bulkText.trim() ? parseBulkQuestions(bulkText) : null), [bulkText]);
  const totalPoints = questions.reduce((n, q) => n + (Number(q.points) || 0), 0);

  const touch = () => setDirty(true);
  const updateQ = (key: string, patch: Partial<EditorQuestion>) => {
    touch();
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  };
  const move = (i: number, dir: -1 | 1) => {
    touch();
    setQuestions((qs) => {
      const next = [...qs];
      const j = i + dir;
      if (j < 0 || j >= next.length) return qs;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  };

  function payload() {
    return {
      title,
      subject: subject.trim() || null,
      description,
      instructions,
      durationMinutes: duration ? Number(duration) : null,
      opensAt: fromLocalInput(opensAt),
      closesAt: fromLocalInput(closesAt),
      maxAttempts: Number(maxAttempts) || 0,
      shuffleQuestions,
      shuffleOptions,
      showAnswers,
      negativeMarking: Number(negative) || 0,
      questions: questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        options: q.options.filter((o) => o.text.trim()),
        correct: q.correct.filter((c) => q.options.some((o) => o.id === c && o.text.trim())),
        multiple: q.multiple,
        points: Number(q.points) || 0,
        explanation: q.explanation,
      })),
    };
  }

  function describeError(error: string, issues?: { path: (string | number)[] }[]) {
    const path = issues?.[0]?.path;
    if (path && path[0] === 'questions' && typeof path[1] === 'number') return `Question ${path[1] + 1}: ${error.replace(/^questions\.\d+(\.\w+)*: /, '')}`;
    return error;
  }

  async function save(publish?: boolean) {
    setBusy(true);
    setMessage(null);
    const body = payload();
    const res = initial.id ? await api<{ id: string }>(`/api/admin/quizzes/${initial.id}`, body, 'PUT') : await api<{ id: string }>('/api/admin/quizzes', body);
    if (!res.ok) {
      setBusy(false);
      setMessage({ kind: 'error', text: describeError(res.error) });
      return;
    }
    const id = res.data.id;
    if (publish !== undefined) {
      const st = await api(`/api/admin/quizzes/${id}/status`, { status: publish ? 'published' : 'draft' });
      if (!st.ok) {
        setBusy(false);
        setMessage({ kind: 'error', text: st.error });
        if (!initial.id) router.replace(`/admin/tests/${id}?saved=draft`);
        return;
      }
    }
    setBusy(false);
    setDirty(false);
    setMessage({ kind: 'ok', text: publish === true ? 'Saved and published.' : publish === false ? 'Saved and unpublished.' : 'Saved.' });
    if (!initial.id) router.replace(`/admin/tests/${id}?saved=${publish === true ? 'published' : 'draft'}`);
    else router.refresh();
  }

  async function remove() {
    if (!initial.id) return;
    if (!confirm(`Delete “${title}”${initial.attempts ? ` and its ${initial.attempts} submissions` : ''}? This cannot be undone.`)) return;
    setBusy(true);
    const res = await api(`/api/admin/quizzes/${initial.id}`, undefined, 'DELETE');
    setBusy(false);
    if (!res.ok) return setMessage({ kind: 'error', text: res.error });
    router.replace('/admin/tests');
    router.refresh();
  }

  function appendBulk() {
    if (!bulk || bulk.errors.length) return;
    touch();
    setQuestions((qs) => [...qs.filter((q) => q.prompt.trim() || q.options.some((o) => o.text.trim())), ...bulk.questions.map((q) => ({ ...q, key: newKey() }))]);
    setBulkText('');
    setBulkOpen(false);
  }

  const published = initial.status === 'published';

  return (
    <div className={styles.stack}>
      <header className={styles.pageHead}>
        <div>
          <Link href="/admin/tests" className="dim" style={{ fontSize: 13 }}>
            ← Mock tests
          </Link>
          <h1 className={styles.title} style={{ marginTop: 8 }}>
            {initial.id ? title || 'Untitled test' : 'New mock test'}
          </h1>
          <p className={styles.lede}>
            {initial.id ? (
              <>
                Status: <strong>{initial.phase === 'draft' ? 'Draft (hidden)' : initial.phase === 'upcoming' ? 'Scheduled' : initial.phase === 'live' ? 'Live' : 'Closed'}</strong>
                {initial.attempts > 0 && ` · ${initial.attempts} submissions — editing questions won’t change scores already given.`}
              </>
            ) : (
              'Save as a draft first; publish when it’s ready. Times are in ' + APP_TZ + '.'
            )}
          </p>
        </div>
        <div className={styles.actions}>
          {initial.id && (
            <Link href={`/admin/tests/${initial.id}/results`} className="btn btn--ghost btn--sm">
              Results
            </Link>
          )}
          <button className="btn btn--ghost" disabled={busy} onClick={() => save()}>
            {busy ? 'Saving…' : published ? 'Save changes' : 'Save draft'}
          </button>
          {published ? (
            <button className="btn btn--danger" disabled={busy} onClick={() => save(false)}>
              Unpublish
            </button>
          ) : (
            <button className="btn btn--accent" disabled={busy} onClick={() => save(true)}>
              Save & publish
            </button>
          )}
        </div>
      </header>

      {message && (
        <p className={`notice ${message.kind === 'ok' ? 'notice--ok' : ''}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      {dirty && !message && <p className="hint">Unsaved changes.</p>}

      <section className={styles.panel} aria-labelledby="settings">
        <h2 id="settings" className={styles.panelTitle}>
          Settings
        </h2>
        <div className={styles.row2}>
          <label className="field">
            <span>Title</span>
            <input className="input" value={title} onChange={(e) => (touch(), setTitle(e.target.value))} placeholder="OLT Mock 1 — Corporate Finance" />
          </label>
          <label className="field">
            <span>Subject (optional)</span>
            <input className="input" list="subject-codes" value={subject} onChange={(e) => (touch(), setSubject(e.target.value))} placeholder="CF" />
            <datalist id="subject-codes">
              {subjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
        </div>
        <label className="field">
          <span>Short description</span>
          <input className="input" value={description} onChange={(e) => (touch(), setDescription(e.target.value))} placeholder="Chapters 4–6: capital budgeting and WACC" />
        </label>
        <label className="field">
          <span>Instructions shown before starting (optional)</span>
          <textarea className="textarea" value={instructions} onChange={(e) => (touch(), setInstructions(e.target.value))} />
        </label>
        <div className={styles.row3}>
          <label className="field">
            <span>Duration (minutes)</span>
            <input className="input" type="number" min={1} max={600} value={duration} onChange={(e) => (touch(), setDuration(e.target.value))} placeholder="Untimed" />
          </label>
          <label className="field">
            <span>Opens at</span>
            <input className="input" type="datetime-local" value={opensAt} onChange={(e) => (touch(), setOpensAt(e.target.value))} />
            <span className="hint">Empty = as soon as it’s published</span>
          </label>
          <label className="field">
            <span>Closes at</span>
            <input className="input" type="datetime-local" value={closesAt} onChange={(e) => (touch(), setClosesAt(e.target.value))} />
            <span className="hint">Empty = stays open</span>
          </label>
        </div>
        <div className={styles.row3}>
          <label className="field">
            <span>Attempts per student</span>
            <select className="select" value={maxAttempts} onChange={(e) => (touch(), setMaxAttempts(e.target.value))}>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="5">5</option>
              <option value="0">Unlimited</option>
            </select>
          </label>
          <label className="field">
            <span>Negative marking</span>
            <select className="select" value={negative} onChange={(e) => (touch(), setNegative(e.target.value))}>
              <option value="0">None</option>
              <option value="0.25">−¼ of the question’s marks</option>
              <option value="0.3333">−⅓ of the question’s marks</option>
              <option value="0.5">−½ of the question’s marks</option>
              <option value="1">−full marks</option>
            </select>
          </label>
          <label className="field">
            <span>Show correct answers</span>
            <select className="select" value={showAnswers} onChange={(e) => (touch(), setShowAnswers(e.target.value as typeof showAnswers))}>
              <option value="after_submit">Right after submitting</option>
              <option value="after_close">After the test closes</option>
              <option value="never">Never (score only)</option>
            </select>
          </label>
        </div>
        <div className={styles.actions} style={{ gap: 22 }}>
          <label className="check">
            <input type="checkbox" checked={shuffleQuestions} onChange={(e) => (touch(), setShuffleQuestions(e.target.checked))} /> Shuffle question order
          </label>
          <label className="check">
            <input type="checkbox" checked={shuffleOptions} onChange={(e) => (touch(), setShuffleOptions(e.target.checked))} /> Shuffle options
          </label>
        </div>
      </section>

      <section className={styles.stack} aria-labelledby="questions">
        <div className={styles.toolbar}>
          <h2 id="questions" className={styles.panelTitle}>
            Questions <span className="dim">({questions.length} · {totalPoints} marks)</span>
          </h2>
          <div className={styles.actions}>
            <button className="btn btn--ghost btn--sm" onClick={() => setBulkOpen((v) => !v)}>
              {bulkOpen ? 'Close bulk import' : 'Paste questions in bulk'}
            </button>
            <button className="btn btn--sm" onClick={() => (touch(), setQuestions((qs) => [...qs, blankQuestion()]))}>
              + Add question
            </button>
          </div>
        </div>

        {bulkOpen && (
          <div className={styles.panel}>
            <p className="hint">
              One question per block: a numbered line, then lettered options. End the correct option with <code>*</code> (several stars = multi-answer), or add a line{' '}
              <code>Answer: b</code>. Optional <code>Explanation:</code> and <code>Points:</code> lines.
            </p>
            <textarea
              className="textarea"
              style={{ minHeight: 220, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              aria-label="Questions to import" 
              placeholder={'1. Which ratio measures liquidity?\na) Debt-equity\nb) Current ratio *\nc) ROE\nd) EPS\nExplanation: Current assets ÷ current liabilities.\n\n2. ...'}
            />
            {bulk && (
              <div className={styles.actions} style={{ justifyContent: 'space-between' }}>
                {bulk.errors.length ? (
                  <ul className={styles.warnList}>
                    {bulk.errors.slice(0, 8).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="hint">{bulk.questions.length} questions ready.</span>
                )}
                <button className="btn btn--accent btn--sm" disabled={!bulk.questions.length || bulk.errors.length > 0} onClick={appendBulk}>
                  Add {bulk.questions.length} questions
                </button>
              </div>
            )}
          </div>
        )}

        <ol className={ed.list}>
          {questions.map((q, i) => (
            <li key={q.key} className={ed.q}>
              <div className={ed.qHead}>
                <span className={ed.qNum}>{String(i + 1).padStart(2, '0')}</span>
                <div className={styles.actions}>
                  <label className="check" style={{ fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={q.multiple}
                      onChange={(e) => updateQ(q.key, { multiple: e.target.checked, correct: e.target.checked ? q.correct : q.correct.slice(0, 1) })}
                    />
                    Multiple answers
                  </label>
                  <label className={ed.points}>
                    Marks
                    <input className="input" type="number" min={0} max={100} step={0.5} value={q.points} onChange={(e) => updateQ(q.key, { points: Number(e.target.value) })} />
                  </label>
                  <button className={ed.icon} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move question ${i + 1} up`}>
                    ↑
                  </button>
                  <button className={ed.icon} onClick={() => move(i, 1)} disabled={i === questions.length - 1} aria-label={`Move question ${i + 1} down`}>
                    ↓
                  </button>
                  <button
                    className={ed.icon}
                    onClick={() => (touch(), setQuestions((qs) => [...qs.slice(0, i + 1), { ...q, id: undefined, key: newKey() }, ...qs.slice(i + 1)]))}
                    aria-label={`Duplicate question ${i + 1}`}
                    title="Duplicate"
                  >
                    ⧉
                  </button>
                  <button
                    className={`${ed.icon} ${ed.danger}`}
                    onClick={() => (touch(), setQuestions((qs) => qs.filter((x) => x.key !== q.key)))}
                    aria-label={`Delete question ${i + 1}`}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              </div>
              <textarea
                className="textarea"
                style={{ minHeight: 70 }}
                value={q.prompt}
                onChange={(e) => updateQ(q.key, { prompt: e.target.value })}
                placeholder="Question text"
                aria-label={`Question ${i + 1} text`}
              />
              <div className={ed.options}>
                {q.options.map((o, oi) => {
                  const correct = q.correct.includes(o.id);
                  return (
                    <div key={o.id} className={`${ed.option} ${correct ? ed.optionCorrect : ''}`}>
                      <label className={ed.mark} title="Mark as correct">
                        <input
                          type={q.multiple ? 'checkbox' : 'radio'}
                          name={`correct-${q.key}`}
                          checked={correct}
                          onChange={() =>
                            updateQ(q.key, {
                              correct: q.multiple ? (correct ? q.correct.filter((c) => c !== o.id) : [...q.correct, o.id]) : [o.id],
                            })
                          }
                          aria-label={`Option ${LETTERS[oi]} is correct`}
                        />
                        <span>{LETTERS[oi]}</span>
                      </label>
                      <input
                        className="input"
                        value={o.text}
                        onChange={(e) => updateQ(q.key, { options: q.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })}
                        placeholder={`Option ${LETTERS[oi]}`}
                        aria-label={`Option ${LETTERS[oi]}`}
                      />
                      <button
                        className={ed.icon}
                        disabled={q.options.length <= 2}
                        onClick={() => updateQ(q.key, { options: q.options.filter((x) => x.id !== o.id), correct: q.correct.filter((c) => c !== o.id) })}
                        aria-label={`Remove option ${LETTERS[oi]}`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                {q.options.length < 8 && (
                  <button
                    className={ed.addOption}
                    onClick={() => {
                      const id = OPTION_IDS.find((x) => !q.options.some((o) => o.id === x))!;
                      updateQ(q.key, { options: [...q.options, { id, text: '' }] });
                    }}
                  >
                    + Add option
                  </button>
                )}
              </div>
              <input
                className="input"
                value={q.explanation}
                onChange={(e) => updateQ(q.key, { explanation: e.target.value })}
                placeholder="Explanation shown in the review (optional)"
                aria-label={`Question ${i + 1} explanation`}
              />
              {!q.correct.length && <p className={ed.warn}>Mark the correct option.</p>}
            </li>
          ))}
        </ol>
        <button className="btn btn--ghost" onClick={() => (touch(), setQuestions((qs) => [...qs, blankQuestion()]))}>
          + Add question
        </button>
      </section>

      <div className={styles.actions} style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 20 }}>
        {initial.id ? (
          <button className="btn btn--danger" onClick={remove} disabled={busy}>
            Delete test
          </button>
        ) : (
          <span />
        )}
        <div className={styles.actions}>
          <button className="btn btn--ghost" disabled={busy} onClick={() => save()}>
            {published ? 'Save changes' : 'Save draft'}
          </button>
          {!published && (
            <button className="btn btn--accent" disabled={busy} onClick={() => save(true)}>
              Save & publish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
