'use client';

import { useEffect, useState } from 'react';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * A number whose digits roll into place like a stopwatch: each digit is a 0–9 column that springs
 * to its value. Always two columns wide so the width doesn't jump between 4 and 12; a leading zero
 * folds away unless `pad` asks to keep it. Screen readers get the plain number.
 */
export function RollingNumber({ value, pad = false, className }: { value: number; pad?: boolean; className?: string }) {
  // Start at zero and roll up after the first paint, so the number visibly arrives.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);

  const text = String(Math.max(0, Math.floor(shown))).padStart(2, '0');
  const label = pad ? String(value).padStart(2, '0') : String(value);
  return (
    <span className={className}>
      <span className="sr-only">{label}</span>
      <span className="roller" aria-hidden>
        {text.split('').map((d, i) => {
          const hidden = !pad && i === 0 && text.length === 2 && d === '0' && value < 10;
          return (
            <span key={text.length - i} className="roller-digit" style={hidden ? { width: 0, opacity: 0 } : undefined}>
              <span className="roller-strip" style={{ transform: `translateY(-${Number(d)}em)` }}>
                {DIGITS.map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
