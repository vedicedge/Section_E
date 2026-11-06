import Link from 'next/link';
import { attendanceEnabled, timetableEnabled } from './SiteHeader';
import { navLinks } from './nav';
import styles from './SiteFooter.module.css';

export async function SiteFooter() {
  const [timetable, attendance] = await Promise.all([timetableEnabled(), attendanceEnabled()]);
  const links = [{ href: '/', label: 'Home' }, ...navLinks(timetable, attendance)];
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <p className={styles.small}>
          You only ever see your own seat, your own homework ticks and your own leaves. Roll numbers are protected by a PIN, and nothing
          here is shared with other sections. Times follow the college’s official timetable.
        </p>
        <nav aria-label="Footer" className={styles.links}>
          {links.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className={styles.base}>
          <span>PGDM 2026–28 · Section E. Made outside the building.</span>
          <Link href="/admin" className={styles.admin}>
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
