'use client';

import { useState } from 'react';
import { api } from '@/lib/client-api';
import { relativeTime } from '@/lib/time';
import styles from '../../admin.module.css';

interface Status {
  hasKey: boolean;
  lastPull: string | null;
}

/** Echo's knowledge feed: make (or replace) the key the nightly sync uses to read class-wide facts. */
export function EchoPanel({ status: initial, echoUrl }: { status: Status; echoUrl: string }) {
  const [status, setStatus] = useState(initial);
  const [key, setKey] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function makeKey() {
    if (status.hasKey && !confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await api<{ key: string; endpoint: string; status: Status }>('/api/admin/echo-key', {});
    setBusy(false);
    setConfirming(false);
    if (!res.ok) return setMsg(res.error);
    setKey(res.data.key);
    setEndpoint(res.data.endpoint);
    setStatus(res.data.status);
  }

  async function copy() {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setMsg('Key copied.');
    } catch {
      setMsg('Select the key and copy it.');
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="echo-title">
      <h2 id="echo-title" className={styles.panelTitle}>
        Echo&rsquo;s knowledge feed
      </h2>
      <p className={styles.dim}>
        Each night the sync on your laptop reads quizzes, study material, announcements, key dates, homework and group topics from here and
        teaches them to <a href={echoUrl} target="_blank" rel="noopener noreferrer">Echo</a>. Nothing about individual students is included.
      </p>
      <p>
        {status.hasKey
          ? status.lastPull
            ? `Last read by the sync ${relativeTime(status.lastPull)}.`
            : 'A key exists. The sync hasn’t read the feed yet.'
          : 'No key yet. Make one to switch the feed on.'}
      </p>
      {key && (
        <div style={{ display: 'grid', gap: 8 }}>
          <p className="notice">This key is shown only once. Give it to the sync now; making a new key later stops this one working.</p>
          <code style={{ overflowWrap: 'anywhere', userSelect: 'all' }}>{key}</code>
          {endpoint && <span className={styles.dim}>Feed address: {endpoint}</span>}
        </div>
      )}
      <div className={styles.actions}>
        <button type="button" className="btn btn--accent" onClick={makeKey} disabled={busy}>
          {busy ? 'Making key…' : confirming ? 'Replace the key (the old one stops working)' : status.hasKey ? 'Make a new key' : 'Make the key'}
        </button>
        {key && (
          <button type="button" className="btn btn--ghost" onClick={copy}>
            Copy key
          </button>
        )}
        {confirming && (
          <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        )}
      </div>
      {msg && (
        <p className={styles.dim} role="status">
          {msg}
        </p>
      )}
    </section>
  );
}
