'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { api } from '@/lib/client-api';

export function RefreshButton({ label = 'Refresh' }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setMessage(null);
    const res = await api<{ status: string; error: { message: string } | null }>('/api/timetable/refresh', {});
    setBusy(false);
    if (!res.ok) setMessage(res.error);
    else if (res.data.error) setMessage(res.data.error.message);
    startTransition(() => router.refresh());
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <button type="button" className="btn btn--ghost btn--sm" onClick={refresh} disabled={busy || pending} aria-live="polite">
        <span aria-hidden style={{ display: 'inline-block', animation: busy || pending ? 'spin 1s linear infinite' : undefined }}>
          ↻
        </span>
        {busy || pending ? 'Checking…' : label}
      </button>
      {message && (
        <span role="status" style={{ fontSize: 13, color: 'var(--muted)' }}>
          {message}
        </span>
      )}
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    </span>
  );
}
