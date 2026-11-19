'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/client-api';
import { pptClock, pptDay } from '@/lib/placements/format';
import type { PlacementView } from '@/lib/placements/repo';
import styles from '../../admin.module.css';

export function PlacementCard({ p }: { p: PlacementView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pending = p.status === 'pending';
  const noEmail = p.attendees.filter((a) => !a.hasEmail).length;
  const n = p.attendees.length;

  async function act(action: 'approve' | 'dismiss', form?: HTMLFormElement) {
    setBusy(true);
    setMsg(null);
    let edits: Record<string, string> | undefined;
    if (action === 'approve' && form) {
      const d = new FormData(form);
      const field = (k: string) => String(d.get(k) ?? '');
      edits = { title: field('title'), date: field('date'), time: field('time'), endTime: field('endTime'), venue: field('venue'), notes: field('notes') };
    }
    const res = await api<{ status: string; pushed: number }>(`/api/admin/placements/${p.id}`, action === 'approve' ? { action, edits } : { action });
    setBusy(false);
    if (!res.ok) return setMsg(res.error);
    router.refresh();
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void act('approve', e.currentTarget);
  }

  const when = p.date ? [pptDay(p.date), p.time ? pptClock(p.time) : null].filter(Boolean).join(', ') : null;
  const summary = [when, p.venue].filter(Boolean).join(' · ');

  const people = (
    <>
      <p style={{ margin: 0 }}>
        <span className="tabular">
          {n} {n === 1 ? 'student' : 'students'}
        </span>
        {noEmail > 0 && <span className={styles.dim}> · {noEmail} without an email address</span>}
      </p>
      {n > 0 && (
        <p className={styles.dim} style={{ margin: 0 }}>
          {p.attendees.map((a) => a.name).join(', ')}
        </p>
      )}
    </>
  );

  return (
    <article className={styles.panel} data-testid="placement-card" data-status={p.status}>
      {pending ? (
        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <h3 style={{ margin: 0 }}>{p.title}</h3>
          {summary && <p style={{ margin: 0 }}>{summary}</p>}
          {p.replacesId && <p className="notice">Updates an earlier PPT. Approving this one replaces it.</p>}
          <div className={styles.row3}>
            <label className="field">
              <span className="label">Title</span>
              <input className="input" name="title" defaultValue={p.title} required maxLength={120} />
            </label>
            <label className="field">
              <span className="label">Date</span>
              <input className="input" name="date" type="date" defaultValue={p.date ?? ''} />
            </label>
            <label className="field">
              <span className="label">Venue</span>
              <input className="input" name="venue" defaultValue={p.venue ?? ''} maxLength={200} />
            </label>
          </div>
          <div className={styles.row3}>
            <label className="field">
              <span className="label">Starts</span>
              <input className="input" name="time" type="time" defaultValue={p.time ?? ''} />
            </label>
            <label className="field">
              <span className="label">Ends (optional)</span>
              <input className="input" name="endTime" type="time" defaultValue={p.endTime ?? ''} />
            </label>
          </div>
          <label className="field">
            <span className="label">Notes</span>
            <textarea className="input" name="notes" rows={2} defaultValue={p.notes} maxLength={2000} />
          </label>
          {people}
          {msg && (
            <p className="notice" role="alert">
              {msg}
            </p>
          )}
          <div className={styles.actions}>
            <button className="btn btn--accent" disabled={busy}>
              {busy ? 'Working…' : 'Approve'}
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => act('dismiss')}>
              Dismiss
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          <h3 style={{ margin: 0 }}>{p.title}</h3>
          {summary && <p style={{ margin: 0 }}>{summary}</p>}
          {p.notes && (
            <p className={styles.dim} style={{ margin: 0, whiteSpace: 'pre-line' }}>
              {p.notes}
            </p>
          )}
          {people}
          <p className={styles.dim} style={{ margin: 0 }}>
            {p.status === 'approved' ? 'Approved' : 'Dismissed'}
            {p.status === 'approved' && ` · ${p.inviteSentAt ? 'Invite sent' : 'Invite: waiting for the inbox script'}`}
          </p>
        </div>
      )}
    </article>
  );
}
