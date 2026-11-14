'use client';

import type { Ref } from 'react';
import styles from './register.module.css';

/** The 4-digit PIN box: a numeric keypad on phones, digits only, hidden as it's typed. */
export function PinInput({
  value,
  onChange,
  autoComplete,
  ref,
}: {
  value: string;
  onChange: (digits: string) => void;
  autoComplete: 'new-password' | 'current-password';
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <input
      ref={ref}
      className={`input ${styles.pin}`}
      type="password"
      inputMode="numeric"
      autoComplete={autoComplete}
      pattern="\d{4}"
      maxLength={4}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      required
    />
  );
}
