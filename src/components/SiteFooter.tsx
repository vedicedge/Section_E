import Link from 'next/link';
import styles from './SiteFooter.module.css';

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.cols}>
          <div>
            <p className="eyebrow">Navigate</p>
            <ul>
              <li>
                <Link href="/seat">My Seating Plan</Link>
              </li>
              <li>
                <Link href="/timetable">Live Timetable</Link>
              </li>
              <li>
                <Link href="/tests">OLT Mock Tests</Link>
              </li>
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
              You only ever see your own seat. Roll numbers are protected by a PIN, and nothing here is shared with other sections.
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
