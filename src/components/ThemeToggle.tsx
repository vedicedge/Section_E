'use client';

import { useEffect, useState } from 'react';
import styles from './ThemeToggle.module.css';

type Theme = 'dark' | 'light';
const KEY = 'sectionE.theme';
const CHANNEL = 'sectionE.theme';

function apply(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f3ece2' : '#110c0a');
}

function current(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/**
 * Dark / light switch. The new theme spreads out from the button in a circle where the browser
 * supports View Transitions, and colours glide everywhere else. The choice is remembered on this
 * device and follows along in any other open Section E tab.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    setTheme(current());
    const follow = (t: unknown) => {
      if (t !== 'dark' && t !== 'light') return;
      apply(t);
      setTheme(t);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) follow(e.newValue ?? 'dark');
    };
    window.addEventListener('storage', onStorage);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (e) => follow(e.data);
    } catch {
      bc = null;
    }
    return () => {
      window.removeEventListener('storage', onStorage);
      bc?.close();
    };
  }, []);

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode: the switch still works for this page */
    }
    try {
      const bc = new BroadcastChannel(CHANNEL);
      bc.postMessage(next);
      bc.close();
    } catch {
      /* older browsers: the storage event covers other tabs */
    }
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    if (doc.startViewTransition && !reduce) {
      const r = e.currentTarget.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const vt = doc.startViewTransition(() => {
        apply(next);
        setTheme(next);
      });
      vt.ready
        .then(() => {
          root.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
            { duration: 650, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' },
          );
        })
        .catch(() => {});
      return;
    }
    root.setAttribute('data-theme-switching', '');
    apply(next);
    setTheme(next);
    window.setTimeout(() => root.removeAttribute('data-theme-switching'), 700);
  }

  return (
    <button
      type="button"
      className={styles.toggle}
      aria-pressed={theme === 'dark'}
      aria-label="Dark mode"
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      onClick={toggle}
      data-theme-now={theme}
    >
      <span className={styles.knob} aria-hidden>
        <svg className={styles.sun} width="16" height="16" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 2v2.5M12 19.5V22M4.2 4.2 6 6M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <svg className={styles.moon} width="16" height="16" viewBox="0 0 24 24">
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}
