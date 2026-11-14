'use client';

import { useState } from 'react';
import { api } from '@/lib/client-api';
import { RecoveryCode } from './RecoveryCode';
import { PinInput } from './PinInput';
import styles from './register.module.css';

/** For a signed-in student: change the PIN (no old PIN needed) and get a recovery code. */
export function AccountTools({ hasRecovery }: { hasRecovery: boolean }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pinMsg, setPinMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [saved, setSaved] = useState(hasRecovery);

  async function changePin(e: React.FormEvent) {
    e.preventDefault();
    setPinMsg(null);
    if (!/^\d{4}$/.test(pin)) return setPinMsg({ ok: false, text: 'Use exactly 4 digits.' });
    if (pin !== confirm) return setPinMsg({ ok: false, text: 'The two PINs don’t match.' });
    setBusy(true);
    const res = await api('/api/auth/change-pin', { pin });
    setBusy(false);
    if (!res.ok) return setPinMsg({ ok: false, text: res.error });
    setPin('');
    setConfirm('');
    setPinMsg({ ok: true, text: 'PIN changed. Use the new one from now on; any other device you were signed in on has been signed out.' });
  }

  async function newCode() {
    setCodeErr(null);
    setCodeBusy(true);
    const res = await api<{ code: string }>('/api/auth/recovery-code', {});
    setCodeBusy(false);
    if (!res.ok) return setCodeErr(res.error);
    setCode(res.data.code);
    setSaved(true);
  }

  return (
    <div className={styles.account}>
      <form onSubmit={changePin} className={styles.form}>
        <div>
          <p className="label">Change your PIN</p>
          <p className="hint">You’re signed in, so you don’t need the old one.</p>
        </div>
        <label className="field">
          <span>New 4-digit PIN</span>
          <PinInput autoComplete="new-password" value={pin} onChange={setPin} />
        </label>
        <label className="field">
          <span>Repeat the new PIN</span>
          <PinInput autoComplete="new-password" value={confirm} onChange={setConfirm} />
        </label>
        <button className="btn btn--accent btn--block" disabled={busy}>
          {busy ? 'Saving…' : 'Change PIN'}
        </button>
        {pinMsg && (
          <p className={pinMsg.ok ? styles.note : styles.error} role={pinMsg.ok ? 'status' : 'alert'}>
            {pinMsg.text}
          </p>
        )}
      </form>

      <div className={styles.form}>
        <div>
          <p className="label">Recovery code</p>
          <p className="hint">
            {saved
              ? 'You have one. Lost it? Get a new one; the old one stops working.'
              : 'You don’t have one yet. Get one now so you can reset a forgotten PIN yourself, even when you’re signed out.'}
          </p>
        </div>
        {code ? (
          <RecoveryCode code={code} />
        ) : (
          <button type="button" className={saved ? 'btn btn--ghost btn--block' : 'btn btn--accent btn--block'} onClick={newCode} disabled={codeBusy}>
            {codeBusy ? 'Making one…' : saved ? 'Get a new recovery code' : 'Get my recovery code'}
          </button>
        )}
        {codeErr && (
          <p className={styles.error} role="alert">
            {codeErr}
          </p>
        )}
      </div>
    </div>
  );
}
