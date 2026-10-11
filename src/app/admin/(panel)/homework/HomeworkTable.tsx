'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { api } from '@/lib/client-api';
import type { DueMode } from '@/lib/homework/due';
import { dueSentence } from '@/lib/homework/messages';
import type { SubjectOption } from '@/lib/homework/repo';
import { subjectKey } from '@/lib/names';
import { formatDay } from '@/lib/time';
import { LIMITS, type AdminHomeworkItem } from './shared';
import styles from '../../admin.module.css';
import css from './homework.module.css';

type Tab = 'upcoming' | 'past';
type Status = { kind: 'ok' | 'error'; text: string } | null;

function preview(text: string, max = 110): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

interface Props {
  items: AdminHomeworkItem[];
  /** Active students on the roster, for the "done" column. */
  roster: number;
  today: string;
  subjects: SubjectOption[];
}

export function HomeworkTable({ items, roster, today, subjects }: Props) {
  const router = useRouter();
  const uid = useId();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);

  const upcoming = items.filter((i) => i.bucket !== 'past');
  const past = items.filter((i) => i.bucket === 'past').reverse();
  const shown = tab === 'upcoming' ? upcoming : past;
  const editId = (id: string) => `${uid}-edit-${id}`;

  function close(id: string) {
    setEditing(null);
    requestAnimationFrame(() => document.getElementById(editId(id))?.focus());
  }

  async function remove(item: AdminHomeworkItem) {
    if (!confirm(`Delete “${preview(item.title, 80)}” (${item.subjectCode})? Students’ ticks for it are removed too.`)) return;
    setBusy(item.id);
    const res = await api(`/api/admin/homework/${encodeURIComponent(item.id)}`, undefined, 'DELETE');
    setBusy(null);
    setStatus(res.ok ? { kind: 'ok', text: `Deleted “${preview(item.title, 60)}”.` } : { kind: 'error', text: res.error });
    if (res.ok) router.refresh();
  }

  return (
    <section aria-labelledby={`${uid}-heading`}>
      <div className={styles.toolbar}>
        <h2 id={`${uid}-heading`} className={styles.panelTitle}>
          All homework
        </h2>
        <div className={css.tabs} role="group" aria-label="Show homework">
          <button type="button" className={css.tab} aria-pressed={tab === 'upcoming'} onClick={() => setTab('upcoming')}>
            Upcoming <span className={css.tabCount}>{upcoming.length}</span>
          </button>
          <button type="button" className={css.tab} aria-pressed={tab === 'past'} onClick={() => setTab('past')}>
            Past <span className={css.tabCount}>{past.length}</span>
          </button>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {status && <p className={`notice ${status.kind === 'ok' ? 'notice--ok' : ''} ${css.tableStatus}`}>{status.text}</p>}
      </div>

      {shown.length === 0 ? (
        <div className={styles.emptyBox}>
          {items.length === 0 ? (
            <>
              <strong>No homework yet.</strong>
              Post the first task above — it appears on students’ Homework page straight away.
            </>
          ) : tab === 'upcoming' ? (
            <>
              <strong>Nothing open.</strong>
              Everything set so far is past its due date.
            </>
          ) : (
            <>
              <strong>Nothing past due yet.</strong>
              Homework moves here the day after it is due.
            </>
          )}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${css.table}`}>
            <caption className="sr-only">{tab === 'upcoming' ? 'Upcoming homework' : 'Past homework, most recent first'}</caption>
            <thead>
              <tr>
                <th scope="col">Subject</th>
                <th scope="col">Task</th>
                <th scope="col">Given</th>
                <th scope="col">Due</th>
                <th scope="col">Done</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((item) =>
                editing === item.id ? (
                  <tr key={item.id} className={css.editRow}>
                    <td colSpan={6}>
                      <EditForm
                        item={item}
                        subjects={subjects}
                        onCancel={() => close(item.id)}
                        onSaved={(title) => {
                          close(item.id);
                          setStatus({ kind: 'ok', text: `Saved “${preview(title, 60)}”.` });
                          router.refresh();
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={item.id}>
                    <th scope="row" data-label="Subject">
                      <span className={css.cellCode}>{item.subjectCode}</span>
                      <span className={css.cellSub}>{item.subjectTitle}</span>
                    </th>
                    <td data-label="Task">
                      <span className={css.taskTitle}>{item.title}</span>
                      {item.details && <span className={css.cellSub}>{preview(item.details)}</span>}
                    </td>
                    <td data-label="Given" className={`${styles.mono} ${css.nowrap}`}>
                      {formatDay(item.givenOn)}
                    </td>
                    <td data-label="Due">
                      <span className={item.bucket === 'today' || item.bucket === 'tomorrow' ? css.soon : undefined}>{dueSentence(item, today)}</span>
                      {item.due.source === 'snapshot' && <span className={css.tag}>from last known timetable</span>}
                      {item.due.source === 'unknown' && <span className={css.tag}>date TBA</span>}
                    </td>
                    <td data-label="Done">
                      <span className={`${styles.mono} ${css.nowrap}`}>
                        {item.doneCount} / {roster}
                      </span>
                      <span className={css.meter} aria-hidden="true">
                        <span style={{ width: `${roster ? Math.min(100, Math.round((item.doneCount / roster) * 100)) : 0}%` }} />
                      </span>
                    </td>
                    <td className={css.rowActions}>
                      <div className={styles.actions}>
                        <button
                          id={editId(item.id)}
                          type="button"
                          className={`btn btn--ghost btn--sm ${css.tap}`}
                          disabled={busy === item.id}
                          aria-label={`Edit ${item.subjectCode}: ${preview(item.title, 60)}`}
                          onClick={() => {
                            setStatus(null);
                            setEditing(item.id);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={`btn btn--danger btn--sm ${css.tap}`}
                          disabled={busy === item.id}
                          aria-label={`Delete ${item.subjectCode}: ${preview(item.title, 60)}`}
                          onClick={() => remove(item)}
                        >
                          {busy === item.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface EditProps {
  item: AdminHomeworkItem;
  subjects: SubjectOption[];
  onCancel: () => void;
  onSaved: (title: string) => void;
}

function EditForm({ item, subjects, onCancel, onSaved }: EditProps) {
  const uid = useId();
  const [f, setF] = useState({
    subjectCode: item.subjectCode,
    subjectTitle: item.subjectTitle,
    title: item.title,
    details: item.details,
    givenOn: item.givenOn,
    dueMode: item.dueMode as DueMode,
    // Switching a next-class task to a fixed date starts from the date it currently resolves to.
    dueDate: (item.dueMode === 'date' ? item.dueDate : item.due.date) ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((prev) => ({ ...prev, ...patch }));

  function changeCode(value: string) {
    const code = value.toUpperCase();
    const known = subjects.find((s) => subjectKey(s.code) === subjectKey(code));
    set(known ? { subjectCode: code, subjectTitle: known.title } : { subjectCode: code });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const problem = !f.subjectCode.trim()
      ? 'Add the subject code.'
      : !f.subjectTitle.trim()
        ? 'Add the subject name.'
        : !f.title.trim()
          ? 'Write the homework.'
          : !f.givenOn
            ? 'Pick the day it was given.'
            : f.dueMode === 'date' && !f.dueDate
              ? 'Pick a due date.'
              : f.dueMode === 'date' && f.dueDate < f.givenOn
                ? 'The due date is before the day it was given.'
                : null;
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    const keepTime = f.dueMode === 'date' && item.dueMode === 'date' && f.dueDate === item.dueDate;
    const res = await api(
      `/api/admin/homework/${encodeURIComponent(item.id)}`,
      {
        subjectCode: f.subjectCode.trim(),
        subjectTitle: f.subjectTitle.trim(),
        title: f.title.trim(),
        details: f.details.trim(),
        givenOn: f.givenOn,
        dueMode: f.dueMode,
        dueDate: f.dueMode === 'date' ? f.dueDate : null,
        dueTime: keepTime ? item.dueTime : null,
      },
      'PATCH',
    );
    setSaving(false);
    if (!res.ok) return setError(res.error);
    onSaved(f.title.trim());
  }

  return (
    <form
      className={css.editForm}
      aria-label={`Edit homework for ${item.subjectCode}`}
      noValidate
      onSubmit={save}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <datalist id={`${uid}-codes`}>
        {subjects.map((s) => (
          <option key={s.code} value={s.code}>
            {s.title}
          </option>
        ))}
      </datalist>
      <div className={css.editGrid}>
        <label className="field">
          <span>Subject code</span>
          <input className="input" list={`${uid}-codes`} value={f.subjectCode} maxLength={LIMITS.code} autoComplete="off" onChange={(e) => changeCode(e.target.value)} />
        </label>
        <label className="field">
          <span>Subject</span>
          <input className="input" value={f.subjectTitle} maxLength={LIMITS.subjectTitle} onChange={(e) => set({ subjectTitle: e.target.value })} />
        </label>
        <label className={`field ${css.span2}`}>
          <span>Task</span>
          <input className="input" value={f.title} maxLength={LIMITS.title} autoFocus onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className={`field ${css.span2}`}>
          <span>Details (optional)</span>
          <textarea className="textarea" rows={3} value={f.details} maxLength={LIMITS.details} onChange={(e) => set({ details: e.target.value })} />
        </label>
        <label className="field">
          <span>Given on</span>
          <input type="date" className="input" value={f.givenOn} onChange={(e) => set({ givenOn: e.target.value })} />
        </label>
        <fieldset className={css.due}>
          <legend className={css.legend}>Due</legend>
          <label className={css.radio}>
            <input type="radio" name={`${uid}-mode`} checked={f.dueMode === 'next_class'} onChange={() => set({ dueMode: 'next_class' })} />
            <span>
              Next class <span className={css.when}>— after the day it was given, from the timetable</span>
            </span>
          </label>
          <div className={css.dateLine}>
            <label className={css.radio}>
              <input type="radio" name={`${uid}-mode`} checked={f.dueMode === 'date'} onChange={() => set({ dueMode: 'date' })} />
              <span>On date</span>
            </label>
            <input
              type="date"
              className={`input ${css.date}`}
              min={f.givenOn || undefined}
              value={f.dueDate}
              data-off={f.dueMode === 'date' ? undefined : ''}
              aria-label="Due date"
              onChange={(e) => set({ dueDate: e.target.value, dueMode: 'date' })}
            />
          </div>
        </fieldset>
      </div>
      <div aria-live="polite">
        {error && <p className="notice">{error}</p>}
      </div>
      <div className={styles.actions}>
        <button type="submit" className={`btn btn--sm ${css.tap}`} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" className={`btn btn--ghost btn--sm ${css.tap}`} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
