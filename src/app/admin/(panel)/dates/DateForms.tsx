'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/client-api';
import { KIND_LABEL, type KeyDate, type KeyDateKind } from '@/lib/coming-up';
import { formatClock, formatDay, todayISO } from '@/lib/time';
import styles from '../../admin.module.css';

const KINDS = Object.entries(KIND_LABEL) as [KeyDateKind, string][];

export function DateForms({ dates }: { dates: KeyDate[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>, mode: 'one' | 'paste') {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setBusy(mode);
    setMsg(null);
    const res = await api<{ added: number }>('/api/admin/key-dates', { ...data, mode });
    setBusy(null);
    if (!res.ok) return setMsg(res.error);
    form.reset();
    setMsg(res.data.added === 1 ? 'Date added.' : `${res.data.added} dates added.`);
    router.refresh();
  }

  async function remove(d: KeyDate) {
    if (!confirm(`Delete “${d.title}” on ${formatDay(d.onDate)}?`)) return;
    const res = await api(`/api/admin/key-dates/${d.id}`, undefined, 'DELETE');
    if (!res.ok) return setMsg(res.error);
    router.refresh();
  }

  const today = todayISO();
  return (
    <>
      {msg && (
        <p className="notice" role="status">
          {msg}
        </p>
      )}
      <form className={styles.panel} onSubmit={(e) => submit(e, 'one')}>
        <h2 className={styles.panelTitle}>Add a date</h2>
        <div className={styles.row2}>
          <label className="field">
            <span className="label">Kind</span>
            <select className="select" name="kind" defaultValue="exam">
              {KINDS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Subject (optional)</span>
            <input className="input" name="subject" maxLength={40} placeholder="e.g. CF" />
          </label>
          <label className="field">
            <span className="label">Title</span>
            <input className="input" name="title" required maxLength={160} placeholder="e.g. End-term exam" />
          </label>
          <label className="field">
            <span className="label">Date</span>
            <input className="input" name="onDate" type="date" required defaultValue={today} />
          </label>
          <label className="field">
            <span className="label">Time (optional)</span>
            <input className="input" name="atTime" type="time" />
          </label>
          <label className="field">
            <span className="label">Details (optional)</span>
            <input className="input" name="details" maxLength={1000} placeholder="Room, syllabus, what to bring" />
          </label>
        </div>
        <div className={styles.actions}>
          <button className="btn btn--accent" disabled={busy !== null}>
            {busy === 'one' ? 'Adding…' : 'Add date'}
          </button>
        </div>
      </form>

      <form className={styles.panel} onSubmit={(e) => submit(e, 'paste')}>
        <h2 className={styles.panelTitle}>Paste a schedule</h2>
        <p className={styles.dim}>
          One per line: <code>date, subject, title, time</code>. Title and time are optional. Rows copied from a spreadsheet work too. Example:
          <br />
          <code>8 Dec, CF, End-term exam, 10:00</code>
          <br />
          <code>2026-12-10, MM II, End-term exam, 2 pm</code>
        </p>
        <label className="field">
          <span className="label">Kind for every line</span>
          <select className="select" name="kind" defaultValue="exam">
            {KINDS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Schedule</span>
          <textarea className="input" name="text" rows={6} required />
        </label>
        <div className={styles.actions}>
          <button className="btn btn--accent" disabled={busy !== null}>
            {busy === 'paste' ? 'Adding…' : 'Add all'}
          </button>
        </div>
      </form>

      {dates.length > 0 && (
        <section className={styles.panel} aria-labelledby="dates-list">
          <h2 id="dates-list" className={styles.panelTitle}>
            Saved dates
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
            {dates.map((d) => (
              <li key={d.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }} data-testid="admin-date">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>
                    {KIND_LABEL[d.kind]}
                    {d.subject ? ` · ${d.subject}` : ''} · {d.title}
                  </strong>
                  <br />
                  <span className={styles.dim}>
                    {formatDay(d.onDate, true)}
                    {d.atTime ? `, ${formatClock(d.atTime)}` : ''}
                    {d.onDate < today ? ' (past)' : ''}
                    {d.details ? ` · ${d.details}` : ''}
                  </span>
                </span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => remove(d)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
