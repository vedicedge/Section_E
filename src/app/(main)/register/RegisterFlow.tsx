'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { api } from '@/lib/client-api';
import { forgetReminderOwner } from '@/lib/push-client';
import styles from './register.module.css';

type Step =
  | { kind: 'roll' }
  | { kind: 'create'; rollNo: string; name: string }
  | { kind: 'enter'; rollNo: string }
  | { kind: 'welcome'; firstName: string };

export function RegisterFlow({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'roll' });
  const [roll, setRoll] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await api<{ rollNo: string; status: 'claimed' | 'unclaimed'; name: string | null }>('/api/auth/lookup', { rollNo: roll });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setPin('');
    setConfirm('');
    setStep(res.data.status === 'unclaimed' ? { kind: 'create', rollNo: res.data.rollNo, name: res.data.name ?? '' } : { kind: 'enter', rollNo: res.data.rollNo });
    setTimeout(() => pinRef.current?.focus(), 30);
  }

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== 'create' && step.kind !== 'enter') return;
    setError(null);
    if (!/^\d{4}$/.test(pin)) return setError('Use exactly 4 digits.');
    if (step.kind === 'create' && pin !== confirm) return setError('The two PINs don’t match.');
    setBusy(true);
    const res = await api<{ firstName: string }>('/api/auth/pin', { rollNo: step.rollNo, pin, mode: step.kind });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    forgetReminderOwner();
    setStep({ kind: 'welcome', firstName: res.data.firstName });
    router.refresh();
    setTimeout(() => router.push(next), 900);
  }

  const back = () => {
    setStep({ kind: 'roll' });
    setError(null);
  };

  return (
    <div className={styles.flow} aria-live="polite">
      <ol className={styles.steps} aria-label="Progress">
        <li data-on={step.kind === 'roll' || undefined}>Roll number</li>
        <li data-on={step.kind === 'create' || step.kind === 'enter' || undefined}>PIN</li>
        <li data-on={step.kind === 'welcome' || undefined}>Done</li>
      </ol>

      {step.kind === 'roll' && (
        <form onSubmit={lookup} className={styles.form}>
          <label className={styles.bigField}>
            <span className="label">College roll number</span>
            <input
              className={styles.bigInput}
              value={roll}
              onChange={(e) => setRoll(e.target.value.toUpperCase())}
              placeholder="26PGDM000"
              autoComplete="username"
              autoCapitalize="characters"
              spellCheck={false}
              required
              maxLength={20}
              autoFocus
            />
          </label>
          <button className="btn btn--accent btn--block" disabled={busy || roll.trim().length < 5}>
            {busy ? 'Checking…' : 'Continue'}
          </button>
        </form>
      )}

      {step.kind === 'create' && (
        <form onSubmit={submitPin} className={styles.form}>
          <div>
            <p className="label">Is this you?</p>
            <p className={styles.who}>{step.name}</p>
            <p className="hint tabular">{step.rollNo}</p>
          </div>
          <label className="field">
            <span>Choose a 4-digit PIN</span>
            <input
              ref={pinRef}
              className={`input ${styles.pin}`}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="\d{4}"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              required
            />
          </label>
          <label className="field">
            <span>Repeat the PIN</span>
            <input
              className={`input ${styles.pin}`}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="\d{4}"
              maxLength={4}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
              required
            />
          </label>
          <button className="btn btn--accent btn--block" disabled={busy}>
            {busy ? 'Saving…' : 'Yes, that’s me — register'}
          </button>
          <button type="button" className={styles.textBtn} onClick={back}>
            Not you? Use a different roll number
          </button>
        </form>
      )}

      {step.kind === 'enter' && (
        <form onSubmit={submitPin} className={styles.form}>
          <div>
            <p className="label">Welcome back</p>
            <p className={styles.who}>{step.rollNo}</p>
            <p className="hint">This roll number is already registered. Enter its PIN to sign in on this device.</p>
          </div>
          <label className="field">
            <span>Your 4-digit PIN</span>
            <input
              ref={pinRef}
              className={`input ${styles.pin}`}
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              pattern="\d{4}"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              required
            />
          </label>
          <button className="btn btn--accent btn--block" disabled={busy}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <button type="button" className={styles.textBtn} onClick={back}>
            Use a different roll number
          </button>
        </form>
      )}

      {step.kind === 'welcome' && (
        <div className={styles.form}>
          <p className={styles.who}>Welcome to E, {step.firstName}.</p>
          <p className="hint">Taking you to your seat…</p>
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
