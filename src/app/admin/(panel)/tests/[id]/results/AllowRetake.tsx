'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client-api';

export function AllowRetake({ attemptId, who }: { attemptId: string; who: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn--ghost btn--sm"
      disabled={busy}
      title="Delete this attempt so the student can take the test again"
      onClick={async () => {
        if (!confirm(`Delete ${who}’s attempt? They will be able to retake the test.`)) return;
        setBusy(true);
        const res = await api(`/api/admin/attempts/${attemptId}`, undefined, 'DELETE');
        setBusy(false);
        if (!res.ok) alert(res.error);
        router.refresh();
      }}
    >
      Allow retake
    </button>
  );
}
