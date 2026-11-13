'use client';

import { useState } from 'react';
import styles from './register.module.css';

/** Shows a freshly issued recovery code once, with a copy button and what it's for. */
export function RecoveryCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.codeBox}>
      <p className="label">Your recovery code</p>
      <p className={`${styles.code} tabular`} aria-label={code.split('').join(' ')}>
        {code}
      </p>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? 'Copied' : 'Copy code'}
      </button>
      <p className="hint">
        Save it in your notes or take a screenshot. If you forget your PIN and you’re signed out, your roll number and this code
        let you set a new PIN yourself. It works once, and you get a new one each time you use it. This is the only time it’s shown.
      </p>
    </div>
  );
}
