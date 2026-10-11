'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { api } from '@/lib/client-api';
import type { DueMode } from '@/lib/homework/due';
import { subjectKey } from '@/lib/names';
import { addDays, formatClock, formatDay } from '@/lib/time';
import { LIMITS, type BoardSubject, type PostResult } from './shared';
import styles from '../../admin.module.css';
import css from './homework.module.css';

interface Draft {
  title: string;
  details: string;
  showDetails: boolean;
  /** null until the admin picks: next class when the timetable knows it, otherwise a date. */
  mode: DueMode | null;
  dueDate: string;
  /** "Other subject" row only. */
  code: string;
  subjectTitle: string;
}

type Field = 'title' | 'code' | 'subj' | 'date';
type Problem = { field: Field; message: string };
type Next = BoardSubject['next'];

const BLANK: Draft = { title: '', details: '', showDetails: false, mode: null, dueDate: '', code: '', subjectTitle: '' };
const OTHER = '+other';
const NO_TIMETABLE = 'Timetable not available — pick a date';

function omit<T>(obj: Record<string, T>, keys: string[]): Record<string, T> {
  const next = { ...obj };
  for (const k of keys) delete next[k];
  return next;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const whenLabel = (next: NonNullable<Next>) => `${formatDay(next.date)}${next.time ? `, ${formatClock(next.time)}` : ''}`;

function postedMessage(data: PostResult, notified: boolean): string {
  const parts = [`Posted ${data.created.length}`];
  if (notified) {
    if (data.notifyError) parts.push('notification failed');
    else if (!data.notified) parts.push('no notification sent');
    else if (!data.notified.sent) parts.push('no devices have notifications on yet');
    else parts.push(`notified ${plural(data.notified.sent, 'device')}`);
  }
  const tba = data.created.filter((c) => c.due.source === 'unknown').length;
  if (tba) parts.push(`${tba} without a due date yet`);
  return parts.join(' · ');
}

interface Props {
  givenOn: string;
  today: string;
  subjects: BoardSubject[];
  /** Whether the timetable could be read (otherwise "next class" can't be worked out). */
  timetable: boolean;
  pushReady: boolean;
}

export function HomeworkBoard({ givenOn: serverGivenOn, today, subjects, timetable, pushReady }: Props) {
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [givenOn, setGivenOn] = useState(serverGivenOn);
  const [shownFor, setShownFor] = useState(serverGivenOn);
  if (serverGivenOn !== shownFor) {
    setShownFor(serverGivenOn);
    setGivenOn(serverGivenOn);
  }
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [errors, setErrors] = useState<Record<string, Problem>>({});
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Next-class labels are only valid once the server has recomputed them for this date.
  const syncing = pending || givenOn !== serverGivenOn;
  const isToday = givenOn === today;
  const byKey = new Map(subjects.map((s) => [subjectKey(s.code), s]));
  const rows = [...subjects.map((s) => s.code), OTHER];
  const draftOf = (key: string) => drafts[key] ?? BLANK;

  function edit(key: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [key]: { ...(d[key] ?? BLANK), ...patch } }));
    if (errors[key]) setErrors((e) => omit(e, [key]));
  }

  function rowInfo(key: string): { code: string; title: string; next: Next; hint: string | null } {
    if (key !== OTHER) {
      const s = subjects.find((x) => x.code === key)!;
      return { code: s.code, title: s.title, next: s.next, hint: !timetable ? NO_TIMETABLE : s.next ? null : 'No upcoming class on the timetable' };
    }
    const d = draftOf(OTHER);
    const code = d.code.trim();
    const match = code ? byKey.get(subjectKey(code)) : undefined;
    return {
      code,
      title: d.subjectTitle.trim() || match?.title || '',
      next: match?.next ?? null,
      hint: !timetable ? NO_TIMETABLE : !match ? 'Not on the timetable — pick a date' : match.next ? null : 'No upcoming class on the timetable',
    };
  }

  const modeOf = (d: Draft, next: Next): DueMode => (next && d.mode !== 'date' ? 'next_class' : 'date');

  function problem(key: string): Problem | null {
    const d = draftOf(key);
    const info = rowInfo(key);
    if (!d.title.trim()) return { field: 'title', message: 'Write the homework first.' };
    if (key === OTHER && !info.code) return { field: 'code', message: 'Add the subject code.' };
    if (key === OTHER && !info.title) return { field: 'subj', message: 'Add the subject name.' };
    if (modeOf(d, info.next) === 'date') {
      if (!d.dueDate) return { field: 'date', message: 'Pick a due date.' };
      if (d.dueDate < givenOn) return { field: 'date', message: 'The due date is before the day it was given.' };
    }
    return null;
  }

  function changeDate(value: string) {
    setGivenOn(value);
    setStatus(null);
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) return;
    startTransition(() => router.replace(value === today ? '/admin/homework' : `/admin/homework?date=${value}`, { scroll: false }));
  }

  async function post(keys: string[]) {
    if (!keys.length || syncing) return;
    const found: Record<string, Problem> = {};
    for (const key of keys) {
      const p = problem(key);
      if (p) found[key] = p;
    }
    const bad = Object.keys(found);
    if (bad.length) {
      setErrors((e) => ({ ...e, ...found }));
      setStatus({
        kind: 'error',
        text: keys.length === 1 ? found[bad[0]!]!.message : `${plural(bad.length, 'row')} ${bad.length === 1 ? 'needs' : 'need'} attention before posting.`,
      });
      document.getElementById(`${uid}-${rows.indexOf(bad[0]!)}-${found[bad[0]!]!.field}`)?.focus();
      return;
    }

    const items = keys.map((key) => {
      const d = draftOf(key);
      const info = rowInfo(key);
      const mode = modeOf(d, info.next);
      return {
        subjectCode: info.code,
        subjectTitle: info.title,
        title: d.title.trim(),
        details: d.details.trim(),
        givenOn,
        dueMode: mode,
        dueDate: mode === 'date' ? d.dueDate : null,
        dueTime: null,
      };
    });
    const wantNotify = pushReady && notify;
    setBusy(keys.length === 1 ? keys[0]! : 'all');
    setStatus(null);
    const res = await api<PostResult>('/api/admin/homework', { items, notify: wantNotify });
    setBusy(null);
    if (!res.ok) return setStatus({ kind: 'error', text: res.error });
    setDrafts((d) => omit(d, keys));
    setErrors((e) => omit(e, keys));
    setStatus({ kind: 'ok', text: postedMessage(res.data, wantNotify) });
    router.refresh();
  }

  const filled = rows.filter((key) => draftOf(key).title.trim());
  const met = subjects.filter((s) => s.classToday).length;
  const dayName = isToday ? 'today' : `on ${formatDay(givenOn)}`;
  const summary = syncing
    ? /^20\d{2}-\d{2}-\d{2}$/.test(givenOn)
      ? `Checking the timetable for ${formatDay(givenOn)}…`
      : 'Pick the day the homework was given.'
    : !timetable
      ? ''
      : met
        ? `${plural(met, 'subject')} ${givenOn > today ? 'have' : 'had'} class ${dayName} — listed first.`
        : `No classes on the timetable ${dayName}.`;

  function renderRow(key: string, idx: number) {
    const d = draftOf(key);
    const info = rowInfo(key);
    const mode = modeOf(d, info.next);
    const id = `${uid}-${idx}`;
    const err = errors[key];
    const subject = key === OTHER ? null : subjects[idx]!;
    const name = info.code || 'the other subject';
    const describedBy = err ? `${id}-err` : undefined;
    const invalid = (field: Field) => (err?.field === field ? true : undefined);

    return (
      <form
        className={css.row}
        data-filled={d.title.trim() ? '' : undefined}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void post([key]);
        }}
      >
        <div className={css.subject}>
          {subject ? (
            <>
              <span className={css.code}>
                {subject.code}
              </span>
              <span className={css.subjectTitle}>{subject.title}</span>
              {subject.classToday && (
                <span className={`pill ${css.met}`}>
                  <span className="dot" aria-hidden="true" />
                  {isToday ? 'Class today' : givenOn < today ? 'Had class' : 'Has class'}
                </span>
              )}
            </>
          ) : (
            <>
              <span className={css.code}>
                Other <em>subject</em>
              </span>
              <div className={css.otherFields}>
                <label className="field">
                  <span>Code</span>
                  <input
                    id={`${id}-code`}
                    className="input"
                    value={d.code}
                    maxLength={LIMITS.code}
                    placeholder="e.g. GL"
                    autoComplete="off"
                    aria-invalid={invalid('code')}
                    aria-describedby={describedBy}
                    onChange={(e) => edit(key, { code: e.target.value.toUpperCase() })}
                  />
                </label>
                <label className="field">
                  <span>Subject</span>
                  <input
                    id={`${id}-subj`}
                    className="input"
                    value={d.subjectTitle}
                    maxLength={LIMITS.subjectTitle}
                    placeholder={info.title || 'e.g. Guest lecture'}
                    autoComplete="off"
                    aria-invalid={invalid('subj')}
                    aria-describedby={describedBy}
                    onChange={(e) => edit(key, { subjectTitle: e.target.value })}
                  />
                </label>
              </div>
            </>
          )}
        </div>

        <div className={css.task}>
          <label className="sr-only" htmlFor={`${id}-title`}>
            Homework for {name}
          </label>
          <input
            id={`${id}-title`}
            className="input"
            value={d.title}
            maxLength={LIMITS.title}
            placeholder="What was set? e.g. Read case 4, answer Q1–3"
            autoComplete="off"
            aria-invalid={invalid('title')}
            aria-describedby={describedBy}
            onChange={(e) => edit(key, { title: e.target.value })}
          />
          <button
            type="button"
            className={css.more}
            aria-expanded={d.showDetails}
            aria-controls={`${id}-details`}
            onClick={() => edit(key, { showDetails: !d.showDetails })}
          >
            {d.showDetails ? '− Hide details' : d.details.trim() ? '+ Details added' : '+ Add details'}
          </button>
          <textarea
            id={`${id}-details`}
            className="textarea"
            hidden={!d.showDetails}
            rows={3}
            value={d.details}
            maxLength={LIMITS.details}
            aria-label={`Details for ${name} (optional)`}
            placeholder="Pages, links, submission format… (optional)"
            onChange={(e) => edit(key, { details: e.target.value })}
          />
        </div>

        <fieldset className={css.due}>
          <legend className={css.legend}>
            Due<span className="sr-only"> for {name}</span>
          </legend>
          <label className={css.radio} data-disabled={info.next ? undefined : ''}>
            <input type="radio" name={`${id}-mode`} value="next_class" checked={mode === 'next_class'} disabled={!info.next} onChange={() => edit(key, { mode: 'next_class' })} />
            <span>
              Next class
              {info.next && <span className={css.when}> — {whenLabel(info.next)}</span>}
            </span>
          </label>
          <div className={css.dateLine}>
            <label className={css.radio}>
              <input type="radio" name={`${id}-mode`} value="date" checked={mode === 'date'} onChange={() => edit(key, { mode: 'date' })} />
              <span>On date</span>
            </label>
            <input
              id={`${id}-date`}
              type="date"
              className={`input ${css.date}`}
              min={givenOn || undefined}
              value={d.dueDate}
              data-off={mode === 'date' ? undefined : ''}
              aria-label={`Due date for ${name}`}
              aria-invalid={invalid('date')}
              aria-describedby={describedBy}
              onChange={(e) => edit(key, { dueDate: e.target.value, mode: 'date' })}
            />
          </div>
          {info.hint && <p className="hint">{info.hint}</p>}
        </fieldset>

        <div className={css.post}>
          <button type="submit" className={`btn btn--sm ${css.tap}`} disabled={!d.title.trim() || busy !== null || syncing} aria-label={`Post homework for ${name}`}>
            {busy === key ? 'Posting…' : 'Post'}
          </button>
        </div>

        {err && (
          <p id={`${id}-err`} className={css.rowError}>
            {err.message}
          </p>
        )}
      </form>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby={`${uid}-heading`}>
      <div className={css.boardHead}>
        <div>
          <h2 id={`${uid}-heading`} className={styles.panelTitle}>
            Post homework
          </h2>
          <p className="hint">Write against each subject that set something; leave the rest blank. Each line is one task.</p>
          <p id={`${uid}-summary`} className={css.summary} aria-live="polite">
            {summary}
          </p>
        </div>
        <div className={css.given}>
          <label className="field">
            <span>Given on</span>
            <input type="date" className="input" value={givenOn} required aria-describedby={`${uid}-summary`} onChange={(e) => changeDate(e.target.value)} />
          </label>
          <div className={css.quick} role="group" aria-label="Quick dates">
            <button type="button" className={`btn btn--ghost btn--sm ${css.tap}`} aria-pressed={isToday} onClick={() => changeDate(today)}>
              Today
            </button>
            <button type="button" className={`btn btn--ghost btn--sm ${css.tap}`} aria-pressed={givenOn === addDays(today, -1)} onClick={() => changeDate(addDays(today, -1))}>
              Yesterday
            </button>
          </div>
        </div>
      </div>

      {!timetable && (
        <p className="notice notice--warn">
          The timetable isn’t available right now, so “next class” can’t be worked out. Pick a due date for each task — or post later, once the
          timetable is back.
        </p>
      )}
      {subjects.length === 0 && (
        <p className="notice">No subjects yet — they come from the class seating plans. Until one is uploaded, use “Other subject”.</p>
      )}

      <ol className={css.rows}>
        {rows.map((key, idx) => (
          <li key={key}>{renderRow(key, idx)}</li>
        ))}
      </ol>

      <div className={css.foot}>
        <div className={css.footBar}>
          <div className={css.notify}>
            <label className={`check ${css.tapCheck}`}>
              <input type="checkbox" checked={pushReady && notify} disabled={!pushReady} aria-describedby={`${uid}-notify`} onChange={(e) => setNotify(e.target.checked)} />
              Notify students now
            </label>
            <p id={`${uid}-notify`} className="hint">
              {pushReady ? 'Sends a “new homework” alert to everyone with reminders on.' : 'Push notifications aren’t set up yet — see Evening reminder below.'}
            </p>
          </div>
          <button type="button" className="btn btn--accent" disabled={!filled.length || busy !== null || syncing} onClick={() => post(filled)}>
            {busy === 'all' ? 'Posting…' : `Post all filled rows${filled.length ? ` (${filled.length})` : ''}`}
          </button>
        </div>
        <div className={css.status} aria-live="polite" aria-atomic="true">
          {status && <p className={`notice ${status.kind === 'ok' ? 'notice--ok' : ''}`}>{status.text}</p>}
        </div>
      </div>
    </section>
  );
}
