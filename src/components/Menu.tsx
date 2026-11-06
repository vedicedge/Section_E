'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client-api';
import { forgetThisDevice } from '@/lib/push-client';
import type { NavLink } from './nav';
import styles from './Menu.module.css';

interface Props {
  student: { rollNo: string; name: string } | null;
  /** The page links shown in the bar on wider screens. */
  links: NavLink[];
  /** The signed-in student's unticked homework due tomorrow. */
  dueTomorrow: number;
}

/** Phones: a two-line burger that turns into a cross and drops the page list under the bar. */
export function MenuButton({ student, links, dueTomorrow }: Props) {
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const all = [{ href: '/', label: 'Home' }, ...links];
  const openLabel = dueTomorrow > 0 ? `Open menu, ${dueTomorrow} homework ${dueTomorrow === 1 ? 'item' : 'items'} due tomorrow` : 'Open menu';

  // Close on navigation.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = [buttonRef.current, ...panelRef.current.querySelectorAll<HTMLElement>('a, button')].filter(Boolean) as HTMLElement[];
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
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
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
        className={styles.trigger}
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? 'Close menu' : openLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.burger} data-open={open} aria-hidden>
          <span />
          <span />
        </span>
        {dueTomorrow > 0 && !open && (
          <span className={`${styles.flag} tabular`} aria-hidden>
            {dueTomorrow > 9 ? '9+' : dueTomorrow}
          </span>
        )}
      </button>

      {open && (
        <div id="site-menu" ref={panelRef} className={styles.panel}>
          <ul className={styles.list}>
            {all.map((link, i) => {
              const on = link.href === '/' ? pathname === '/' : pathname === link.href || pathname.startsWith(link.href + '/');
              return (
                <li key={link.href} style={{ animationDelay: `${i * 30}ms` }}>
                  <Link
                    href={link.href}
                    className={`${styles.item} ${on ? styles.itemOn : ''}`}
                    aria-current={on ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {link.label}
                    {link.href === '/homework' && dueTomorrow > 0 && <span className={styles.due}>{dueTomorrow} due tomorrow</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className={styles.foot}>
            <p className={styles.who}>
              {student ? (
                <>
                  Signed in as {student.name} · <span className="tabular">{student.rollNo}</span>
                </>
              ) : (
                <>Not registered on this device</>
              )}
            </p>
            <div className={styles.footActions}>
              {student ? (
                <button type="button" className="btn btn--ghost btn--sm" onClick={signOut}>
                  Sign out
                </button>
              ) : (
                <Link className="btn btn--accent btn--sm" href="/register">
                  Register
                </Link>
              )}
              <Link className="btn btn--ghost btn--sm" href="/admin">
                Admin
              </Link>
            </div>
            <p className={styles.footError} role="status">
              {signOutError}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
