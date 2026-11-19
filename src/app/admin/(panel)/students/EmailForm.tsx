'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client-api';
import styles from '../../admin.module.css';

export function EmailForm() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className={styles.panel}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await api<{ saved: number; unmatched: string[] }>('/api/admin/students/emails', { text });
        setBusy(false);
        if (!res.ok) return setStatus(res.error);
        const { saved, unmatched } = res.data;
        setStatus(`Saved ${saved}${unmatched.length ? ` · Not matched: ${unmatched.join('; ')}` : ''}`);
        if (!unmatched.length) setText('');
        router.refresh();
      }}
    >
      <h2 className={styles.panelTitle}>Student emails</h2>
      <label className="field">
        <span>Paste names (or roll numbers) with email addresses</span>
        <textarea
          className="input"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Aarushi Nayyar,aarushi.p26@imi.edu"
          required
        />
      </label>
      <div className={styles.actions}>
        <button className="btn" disabled={busy}>
          Save emails
        </button>
      </div>
      {status && (
        <p className="notice" role="status">
          {status}
        </p>
      )}
    </form>
  );
}
