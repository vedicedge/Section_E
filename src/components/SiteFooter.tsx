import Link from 'next/link';
import { timetableEnabled } from './SiteHeader';
import styles from './SiteFooter.module.css';

export async function SiteFooter() {
  const timetable = await timetableEnabled();
  const links = [
    { href: '/', label: 'Home' },
    { href: '/seat', label: 'My Seating Plan' },
    { href: '/homework', label: 'Homework' },
    ...(timetable ? [{ href: '/timetable', label: 'Live Timetable' }] : []),
    { href: '/tests', label: 'OLT Mock Tests' },
  ];
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.cols}>
          <div>
            <p className="eyebrow">Navigate</p>
            <ul>
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="eyebrow">The Section</p>
            <ul>
              <li>PGDM 2026–28</li>
              <li>Section E · Term II</li>
              <li>Outside the academic block</li>
            </ul>
          </div>
          <div>
            <p className="eyebrow">Privacy</p>
            <p className={styles.small}>
              You only ever see your own seat and your own homework ticks. Roll numbers are protected by a PIN, and nothing here is shared
              with other sections.
            </p>
          </div>
        </div>
        <p className={styles.mark} aria-hidden>
          Section <em>E</em>
        </p>
        <div className={styles.base}>
          <span>Made outside the building.</span>
          <Link href="/admin" className={styles.admin}>
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
