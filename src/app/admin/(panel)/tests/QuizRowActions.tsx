'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client-api';

export function QuizRowActions({ id, status, title }: { id: string; status: 'draft' | 'published'; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) alert(res.error);
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <Link href={`/admin/tests/${id}`} className="btn btn--ghost btn--sm">
        Edit
      </Link>
      <button
        className="btn btn--ghost btn--sm"
        disabled={busy}
        onClick={() => run(() => api(`/api/admin/quizzes/${id}/status`, { status: status === 'published' ? 'draft' : 'published' }))}
      >
        {status === 'published' ? 'Unpublish' : 'Publish'}
      </button>
      <button
        className="btn btn--danger btn--sm"
        disabled={busy}
        onClick={() => {
          if (confirm(`Delete “${title}” and all its submissions? This cannot be undone.`)) run(() => api(`/api/admin/quizzes/${id}`, undefined, 'DELETE'));
        }}
      >
        Delete
      </button>
    </div>
  );
}
