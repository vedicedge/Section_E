'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import styles from '../admin.module.css';

const LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/tests', label: 'Mock tests' },
  { href: '/admin/homework', label: 'Homework' },
  { href: '/admin/seating', label: 'Seating plans' },
  { href: '/admin/students', label: 'Students' },
  { href: '/admin/timetable', label: 'Timetable' },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <nav className={styles.nav} aria-label="Admin">
      <Link href="/" className={styles.navBrand}>
        <span className="script">Section</span> <em>E</em>
        <span className={styles.navBadge}>Admin</span>
      </Link>
      <ul>
        {LINKS.map((l) => {
          const on = l.href === '/admin' ? pathname === '/admin' : pathname.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link href={l.href} className={on ? styles.navOn : undefined} aria-current={on ? 'page' : undefined}>
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className={styles.navOut}
        onClick={async () => {
          await fetch('/api/admin/logout', { method: 'POST' });
          router.replace('/admin/login');
          router.refresh();
        }}
      >
        Sign out
      </button>
    </nav>
  );
}
