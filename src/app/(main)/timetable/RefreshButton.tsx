'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { api } from '@/lib/client-api';
import styles from './timetable.module.css';

/** Asks the server to re-download the sheet now (link mode only — pushed copies have nothing to pull). */
export function RefreshButton({ label = 'Refresh' }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const working = busy || pending;

  async function refresh() {
    if (working) return;
    setBusy(true);
    setMessage(null);
    const res = await api<{ status: string; error: { message: string } | null }>('/api/timetable/refresh', {});
    setBusy(false);
    if (!res.ok) setMessage(res.error);
    else if (res.data.error) setMessage(res.data.error.message);
    startTransition(() => router.refresh());
  }

  return (
    <span className={styles.refresh}>
      <button type="button" className="btn btn--ghost btn--sm" onClick={refresh} aria-disabled={working}>
        <span aria-hidden="true" className={`${styles.spin} ${working ? styles.spinning : ''}`}>
          ↻
        </span>
        {working ? 'Checking…' : label}
      </button>
      <span className={styles.refreshMessage} role="status">
        {message}
      </span>
    </span>
  );
}
