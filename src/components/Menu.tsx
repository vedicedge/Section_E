'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import styles from './Menu.module.css';

const LINKS = [
  { href: '/', label: 'Home', script: 'Home' },
  { href: '/seat', label: 'My Seating Plan', script: 'Seating' },
  { href: '/timetable', label: 'Live Timetable', script: 'Timetable' },
  { href: '/tests', label: 'OLT Mock Tests', script: 'Mock Tests' },
];

export function MenuButton({ student }: { student: { rollNo: string; name: string } | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on navigation.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>('a, button');
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLElement>('a')?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      buttonRef.current?.focus();
    };
  }, [open]);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setOpen(false);
    router.push('/');
    router.refresh();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.plus} aria-hidden />
      </button>

      <div
        id="site-menu"
        ref={panelRef}
        className={`${styles.panel} ${open ? styles.panelOpen : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        hidden={!open}
      >
        <div className={`container ${styles.panelInner}`}>
          <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close menu">
            <span className={styles.plus} aria-hidden />
          </button>
          <nav aria-label="Main">
            <ol className={styles.list}>
              {LINKS.map((link, i) => (
                <li key={link.href} style={{ animationDelay: `${80 + i * 60}ms` }}>
                  <Link href={link.href} className={styles.item} aria-current={pathname === link.href ? 'page' : undefined}>
                    <span className={styles.num}>0{i + 1}</span>
                    <span className={styles.label}>{link.label}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
          <div className={styles.foot}>
            <p className="caps">
              {student ? (
                <>
                  Signed in as {student.name} · {student.rollNo}
                </>
              ) : (
                <>Not registered on this device</>
              )}
            </p>
            <div className={styles.footActions}>
              {student ? (
                <button type="button" className={styles.footLink} onClick={signOut}>
                  Sign out
                </button>
              ) : (
                <Link className={styles.footLink} href="/register">
                  Register
                </Link>
              )}
              <Link className={styles.footLink} href="/admin">
                Admin
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
