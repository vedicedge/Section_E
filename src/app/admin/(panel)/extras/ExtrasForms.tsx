'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/client-api';
import { todayISO } from '@/lib/time';
import type { MockLink, Promotion } from '@/lib/extras';
import styles from '../../admin.module.css';

export function ExtrasForms({ promotions, links }: { promotions: Promotion[]; links: MockLink[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function addPoster(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy('poster');
    setMsg(null);
    const res = await fetch('/api/admin/promotions', { method: 'POST', body: new FormData(form) });
    const json = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) return setMsg(json?.error?.message ?? 'Could not save the poster.');
    form.reset();
    setMsg('Poster added.');
    router.refresh();
  }

  async function addLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy('link');
    setMsg(null);
    const res = await api('/api/admin/mock-links', { title: data.get('title'), url: data.get('url') });
    setBusy(null);
    if (!res.ok) return setMsg(res.error);
    form.reset();
    setMsg('Mock test added.');
    router.refresh();
  }

  async function remove(kind: 'promotions' | 'mock-links', id: string, name: string) {
    if (!confirm(`Delete “${name}”?`)) return;
    const res = await api(`/api/admin/${kind}/${id}`, undefined, 'DELETE');
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
      <form className={styles.panel} onSubmit={addPoster}>
        <h2 className={styles.panelTitle}>Add an event poster</h2>
        <div className={styles.row2}>
          <label className="field">
            <span className="label">Title</span>
            <input className="input" name="title" required maxLength={120} placeholder="e.g. Annual fest — Saturday" />
          </label>
          <label className="field">
            <span className="label">Link (optional)</span>
            <input className="input" name="link" type="url" placeholder="https://… registration page" />
          </label>
          <label className="field">
            <span className="label">Show from</span>
            <input className="input" name="startsOn" type="date" required defaultValue={today} />
          </label>
          <label className="field">
            <span className="label">Show until</span>
            <input className="input" name="endsOn" type="date" required defaultValue={today} />
          </label>
        </div>
        <label className="field">
          <span className="label">Poster image (JPG, PNG or WebP, up to 3 MB)</span>
          <input className="input" name="file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required />
        </label>
        <div className={styles.actions}>
          <button className="btn btn--accent" disabled={busy !== null}>
            {busy === 'poster' ? 'Uploading…' : 'Add poster'}
          </button>
        </div>
        {promotions.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'grid', gap: 10 }}>
            {promotions.map((p) => (
              <li key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/promotions/${p.id}`} alt="" width={56} height={56} style={{ objectFit: 'cover', borderRadius: 8 }} />
                <span style={{ flex: 1 }}>
                  <strong>{p.title}</strong>
                  <br />
                  <span className={styles.dim}>
                    {p.startsOn} → {p.endsOn}
                    {p.endsOn < today ? ' (ended)' : p.startsOn <= today ? ' (showing now)' : ' (scheduled)'}
                  </span>
                </span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => remove('promotions', p.id, p.title)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <form className={styles.panel} onSubmit={addLink}>
        <h2 className={styles.panelTitle}>Add a mock test made in Claude</h2>
        <p className={styles.dim}>In Claude, publish the artifact, copy its link (Share → copy link) and paste it here.</p>
        <div className={styles.row2}>
          <label className="field">
            <span className="label">Title</span>
            <input className="input" name="title" required maxLength={120} placeholder="e.g. OLT Mock 4 — Corporate Finance" />
          </label>
          <label className="field">
            <span className="label">Artifact link</span>
            <input className="input" name="url" type="url" required placeholder="https://claude.ai/public/artifacts/…" />
          </label>
        </div>
        <div className={styles.actions}>
          <button className="btn btn--accent" disabled={busy !== null}>
            {busy === 'link' ? 'Saving…' : 'Add mock test'}
          </button>
        </div>
        {links.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'grid', gap: 10 }}>
            {links.map((l) => (
              <li key={l.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1 }}>
                  {l.title}
                </a>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => remove('mock-links', l.id, l.title)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>
    </>
  );
}
