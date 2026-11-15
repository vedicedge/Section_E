'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/client-api';
import { whatsappUrl } from '@/lib/announcement-text';
import { formatDateTime, formatDay, todayISO } from '@/lib/time';
import type { AdminAnnouncement } from '@/lib/announcements';
import styles from '../../admin.module.css';

export function AnnouncementForms({ items, students, push }: { items: AdminAnnouncement[]; students: number; push: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function post(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const notify = data.get('notify') === 'on';
    if (notify && push && !confirm('Post this and send a notification to every student with reminders on?')) return;
    setBusy(true);
    setMsg(null);
    const res = await api<{ pushed: number | null; failed: number }>('/api/admin/announcements', {
      title: data.get('title'),
      body: data.get('body'),
      link: data.get('link'),
      expiresOn: data.get('expiresOn'),
      notify,
    });
    setBusy(false);
    if (!res.ok) return setMsg(res.error);
    form.reset();
    const { pushed, failed } = res.data;
    setMsg(
      pushed === null
        ? 'Posted. No notification was sent.'
        : `Posted and sent to ${pushed} ${pushed === 1 ? 'device' : 'devices'}${failed ? ` (${failed} could not be reached)` : ''}.`,
    );
    router.refresh();
  }

  async function remove(a: AdminAnnouncement) {
    if (!confirm(`Delete “${a.title}”? Students will no longer see it.`)) return;
    const res = await api(`/api/admin/announcements/${a.id}`, undefined, 'DELETE');
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
      <form className={styles.panel} onSubmit={post}>
        <h2 className={styles.panelTitle}>New announcement</h2>
        <label className="field">
          <span className="label">Title</span>
          <input className="input" name="title" required maxLength={120} placeholder="e.g. No class on Friday — CF moved to Saturday 10 am" />
        </label>
        <label className="field">
          <span className="label">Details (optional)</span>
          <textarea className="input" name="body" rows={4} maxLength={2000} placeholder="Anything students need to know." />
        </label>
        <div className={styles.row2}>
          <label className="field">
            <span className="label">Link (optional)</span>
            <input className="input" name="link" type="url" placeholder="https://… form, document or page" />
          </label>
          <label className="field">
            <span className="label">Show until (optional)</span>
            <input className="input" name="expiresOn" type="date" min={today} />
          </label>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="notify" defaultChecked={push} disabled={!push} />
          <span>{push ? 'Send a notification to every phone with reminders on' : 'Notifications are not set up (VAPID keys missing)'}</span>
        </label>
        <div className={styles.actions}>
          <button className="btn btn--accent" disabled={busy}>
            {busy ? 'Posting…' : 'Post announcement'}
          </button>
        </div>
      </form>

      {items.length > 0 && (
        <section className={styles.panel} aria-labelledby="ann-list">
          <h2 id="ann-list" className={styles.panelTitle}>
            Posted
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 16 }}>
            {items.map((a) => {
              const ended = a.expiresOn !== null && a.expiresOn < today;
              return (
                <li key={a.id} style={{ display: 'grid', gap: 6 }} data-testid="admin-announcement">
                  <strong>{a.title}</strong>
                  {a.body && <span style={{ whiteSpace: 'pre-line' }}>{a.body}</span>}
                  <span className={styles.dim}>
                    {formatDateTime(a.createdAt)}
                    {a.pushed !== null ? ` · sent to ${a.pushed} ${a.pushed === 1 ? 'device' : 'devices'}` : ' · no notification'}
                    {' · '}
                    <span className="tabular" data-testid="seen-count">
                      seen by {a.seen}/{students}
                    </span>
                    {a.expiresOn ? (ended ? ` · ended ${formatDay(a.expiresOn)}` : ` · showing until ${formatDay(a.expiresOn)}`) : ''}
                  </span>
                  <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => window.open(whatsappUrl(a, window.location.origin), '_blank', 'noopener,noreferrer')}
                    >
                      Share to WhatsApp
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => remove(a)}>
                      Delete
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
