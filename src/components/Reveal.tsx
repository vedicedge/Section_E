'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Eases its content up into view the first time it scrolls onto the screen. Content is visible by
 * default (server render, no JavaScript, reduced motion); the hidden starting state is only applied
 * once we know the element is still below the fold.
 */
export function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'static' | 'waiting' | 'shown'>('static');

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Already on screen when the page opened: leave it alone (the page entrance covers it).
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    setState('waiting');
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState('shown');
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${className ?? ''} reveal-on-scroll`.trim()}
      data-reveal={state}
      style={delay && state !== 'static' ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
