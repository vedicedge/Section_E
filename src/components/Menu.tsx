'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client-api';
import { forgetThisDevice } from '@/lib/push-client';
import styles from './Menu.module.css';

interface MenuLink {
  href: string;
  label: string;
}

function menuLinks(timetable: boolean): MenuLink[] {
  return [
    { href: '/', label: 'Home' },
    { href: '/seat', label: 'My Seating Plan' },
    { href: '/homework', label: 'Homework' },
    ...(timetable ? [{ href: '/timetable', label: 'Live Timetable' }] : []),
    { href: '/tests', label: 'OLT Mock Tests' },
  ];
}

const pad2 = (n: number) => String(n).padStart(2, '0');

interface Props {
  student: { rollNo: string; name: string } | null;
  /** Whether the live timetable is switched on (its link is hidden otherwise). */
  timetable: boolean;
  /** The signed-in student's unticked homework due tomorrow. */
  dueTomorrow: number;
  tone?: 'paper' | 'red';
}

export function MenuButton({ student, timetable, dueTomorrow, tone = 'paper' }: Props) {
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const links = menuLinks(timetable);
  const dueText = dueTomorrow > 0 ? `${dueTomorrow} due tomorrow` : null;
  const openLabel = dueTomorrow > 0 ? `Open menu — ${dueTomorrow} homework ${dueTomorrow === 1 ? 'item' : 'items'} due tomorrow` : 'Open menu';

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
    setSignOutError(null);
    await forgetThisDevice();
    const res = await api('/api/auth/logout', {});
    if (!res.ok) {
      setSignOutError(`Couldn’t sign out. ${res.error}`);
      return;
    }
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
        aria-label={open ? 'Close menu' : openLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.plus} aria-hidden />
        {dueTomorrow > 0 && (
          <span className={`${styles.flag} ${tone === 'red' ? styles.flagOnRed : ''} tabular`} aria-hidden>
            {dueTomorrow > 9 ? '9+' : dueTomorrow}
          </span>
        )}
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
              {links.map((link, i) => (
                <li key={link.href} style={{ animationDelay: `${80 + i * 60}ms` }}>
                  <Link href={link.href} className={styles.item} aria-current={pathname === link.href ? 'page' : undefined}>
                    <span className={styles.num}>{pad2(i + 1)}</span>
                    <span className={styles.label}>{link.label}</span>
                    {link.href === '/homework' && dueText && <span className={styles.due}>({dueText})</span>}
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
            <p className={styles.footError} role="status">
              {signOutError}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
