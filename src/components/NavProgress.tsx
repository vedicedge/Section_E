'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * A thin vermilion bar across the top while a page is loading. It starts when someone follows a
 * link to another page on this site, creeps forward while the server works, and finishes the moment
 * the new page arrives. A 120 ms grace period keeps it from flashing on instant navigations.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done'>('idle');
  const startTimer = useRef<number | null>(null);
  const doneTimer = useRef<number | null>(null);

  // A new URL means the navigation finished.
  useEffect(() => {
    if (startTimer.current) window.clearTimeout(startTimer.current);
    startTimer.current = null;
    setPhase((p) => (p === 'loading' ? 'done' : 'idle'));
  }, [pathname, search]);

  useEffect(() => {
    if (phase !== 'done') return;
    doneTimer.current = window.setTimeout(() => setPhase('idle'), 450);
    return () => {
      if (doneTimer.current) window.clearTimeout(doneTimer.current);
    };
  }, [phase]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (startTimer.current) window.clearTimeout(startTimer.current);
      startTimer.current = window.setTimeout(() => setPhase('loading'), 120);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  if (phase === 'idle') return null;
  return <div className={`nav-progress nav-progress--${phase}`} aria-hidden />;
}
