'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client-api';
import { formatDateTime } from '@/lib/time';
import styles from '../../admin.module.css';

interface Diagnostics {
  config: { url: string | null; section: string };
  cache: {
    fileName: string | null;
    via: string;
    checkedAt: string;
    contentChangedAt: string;
    sourceModifiedAt: string | null;
    detection: { ok: boolean; summary: string } | null;
    warnings: string[];
    sessions: number;
    lastError: { code: string; message: string; at: string } | null;
    sourceMatches: boolean;
  } | null;
  hasApiKey: boolean;
  ttlSeconds: number;
}

export function TimetableSettings({ initial }: { initial: Diagnostics }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [url, setUrl] = useState(initial.config.url ?? '');
  const [section, setSection] = useState(initial.config.section);
  const [busy, setBusy] = useState<'save' | 'refresh' | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function run(kind: 'save' | 'refresh') {
    setBusy(kind);
    setMessage(null);
    const res =
      kind === 'save'
        ? await api<{ diagnostics: Diagnostics; status: string }>('/api/admin/timetable', { url, section }, 'PUT')
        : await api<{ diagnostics: Diagnostics; status: string }>('/api/admin/timetable', {});
    setBusy(null);
    if (!res.ok) return setMessage({ kind: 'error', text: res.error });
    setD(res.data.diagnostics);
    const err = res.data.diagnostics.cache?.lastError;
    setMessage(
      res.data.status === 'ok'
        ? { kind: 'ok', text: kind === 'save' ? 'Saved — the timetable downloaded successfully.' : 'Refreshed.' }
        : res.data.status === 'unconfigured'
          ? { kind: 'ok', text: 'Saved. No link configured.' }
          : { kind: 'error', text: err?.message ?? 'The source could not be downloaded — see details below.' },
    );
    router.refresh();
  }

  const c = d.cache;
  return (
    <>
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Source</h2>
        <div className={styles.row2} style={{ gridTemplateColumns: 'minmax(0, 1fr) 140px' }}>
          <label className="field">
            <span>Share link</span>
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…/edit?usp=sharing" />
          </label>
          <label className="field">
            <span>Our section</span>
            <input className="input" value={section} maxLength={1} onChange={(e) => setSection(e.target.value.toUpperCase())} />
          </label>
        </div>
        <ul className="hint" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          <li>Google Drive / Sheets: the file must be shared as “Anyone with the link — Viewer”.</li>
          <li>OneDrive / SharePoint: use an “Anyone with the link” share link.</li>
          <li>Leave empty to fall back to the TIMETABLE_URL environment variable.</li>
          <li>
            Exact “last edited” times for Drive files need a Google API key ({d.hasApiKey ? 'configured ✓' : 'not configured — changes are still detected by content'}).
          </li>
        </ul>
        <div className={styles.actions}>
          <button className="btn btn--accent" disabled={busy !== null} onClick={() => run('save')}>
            {busy === 'save' ? 'Saving & testing…' : 'Save & test'}
          </button>
          <button className="btn btn--ghost" disabled={busy !== null || !d.config.url} onClick={() => run('refresh')}>
            {busy === 'refresh' ? 'Refreshing…' : 'Refresh now'}
          </button>
          <Link href="/timetable" className="btn btn--ghost">
            View public page
          </Link>
        </div>
        {message && (
          <p className={`notice ${message.kind === 'ok' ? 'notice--ok' : ''}`} role={message.kind === 'error' ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Last sync</h2>
        {!c ? (
          <p className="dim">Nothing downloaded yet.</p>
        ) : (
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '180px minmax(0,1fr)', gap: '8px 16px', fontSize: 14 }}>
            <dt className="dim">File</dt>
            <dd style={{ margin: 0 }}>{c.fileName ?? '—'} <span className="dim">via {c.via}</span></dd>
            <dt className="dim">Last successful download</dt>
            <dd style={{ margin: 0 }}>{formatDateTime(c.checkedAt)}</dd>
            <dt className="dim">Content last changed</dt>
            <dd style={{ margin: 0 }}>{formatDateTime(c.sourceModifiedAt ?? c.contentChangedAt)}</dd>
            <dt className="dim">Layout detection</dt>
            <dd style={{ margin: 0 }}>
              {c.detection?.ok ? <span className="pill pill--ok">Recognised</span> : <span className="pill pill--warn">Showing sheet as-is</span>} {c.detection?.summary}
            </dd>
            <dt className="dim">Section {d.config.section} sessions</dt>
            <dd style={{ margin: 0 }}>{c.sessions}</dd>
            {c.lastError && (
              <>
                <dt className="dim">Last error</dt>
                <dd style={{ margin: 0, color: 'var(--accent)' }}>
                  {c.lastError.message} ({formatDateTime(c.lastError.at)})
                </dd>
              </>
            )}
          </dl>
        )}
        {c && c.warnings.length > 0 && (
          <ul className={styles.warnList}>
            {c.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
