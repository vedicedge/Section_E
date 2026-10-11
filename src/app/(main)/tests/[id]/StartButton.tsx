'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client-api';

export function StartButton({ quizId, timed }: { quizId: string; timed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await api<{ attemptId: string }>(`/api/tests/${quizId}/start`, {});
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    router.push(`/tests/attempt/${res.data.attemptId}`);
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {timed && confirming ? (
        <>
          <p className="hint">The timer starts the moment you continue and can’t be paused.</p>
          <button className="btn btn--accent btn--block" onClick={start} disabled={busy}>
            {busy ? 'Starting…' : 'Start the timer'}
          </button>
          <button className="btn btn--ghost btn--block" onClick={() => setConfirming(false)} disabled={busy}>
            Not yet
          </button>
        </>
      ) : (
        <button className="btn btn--accent btn--block" onClick={() => (timed ? setConfirming(true) : start())} disabled={busy}>
          {busy ? 'Starting…' : 'Start test →'}
        </button>
      )}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
    </div>
  );
}
