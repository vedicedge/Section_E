'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { forgetThisDevice } from '@/lib/push-client';

export function SignOutButton({ className = 'btn btn--ghost' }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await forgetThisDevice();
        await fetch('/api/auth/logout', { method: 'POST' });
        router.refresh();
        setBusy(false);
      }}
    >
      Not you? Sign out
    </button>
  );
}
