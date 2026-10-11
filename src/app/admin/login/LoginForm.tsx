'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client-api';

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      style={{ display: 'grid', gap: 14, width: '100%' }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await api('/api/admin/login', { password });
        setBusy(false);
        if (!res.ok) return setError(res.error);
        router.replace('/admin');
        router.refresh();
      }}
    >
      <label className="field">
        <span>Password</span>
        <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
      </label>
      <button className="btn btn--accent btn--block" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
