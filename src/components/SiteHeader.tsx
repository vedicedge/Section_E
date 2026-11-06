import Link from 'next/link';
import { cache } from 'react';
import { getStudent } from '@/lib/session';
import { isAttendanceEnabled } from '@/lib/attendance/repo';
import { pendingDueCount } from '@/lib/homework/repo';
import { isTimetableEnabled } from '@/lib/timetable/service';
import { addDays, todayISO } from '@/lib/time';
import { initials } from '@/lib/names';
import { Logo } from './Logo';
import { MenuButton } from './Menu';
import { NavLinks } from './NavLinks';
import { ThemeToggle } from './ThemeToggle';
import { navLinks } from './nav';
import styles from './SiteHeader.module.css';

/** The timetable switch, read once per request (the header, footer and landing page all ask). */
export const timetableEnabled = cache(isTimetableEnabled);
/** The Attendance tab switch, read once per request (header, footer and landing page). Never throws. */
export const attendanceEnabled = cache(isAttendanceEnabled);

async function dueTomorrowFor(rollNo: string): Promise<number> {
  try {
    return await pendingDueCount(rollNo, addDays(todayISO(), 1));
  } catch (err) {
    // A badge is not worth failing every page over.
    console.error('[section-e] homework badge unavailable:', err instanceof Error ? err.message : err);
    return 0;
  }
}

/** The translucent bar on every student page: logo · page links · theme · account (menu on phones). */
export async function SiteHeader() {
  const [student, timetable, attendance] = await Promise.all([getStudent(), timetableEnabled(), attendanceEnabled()]);
  const dueTomorrow = student ? await dueTomorrowFor(student.rollNo) : 0;
  const links = navLinks(timetable, attendance);
  return (
    <header className={styles.header}>
      <nav className={styles.inner} aria-label="Main">
        <Logo />
        <NavLinks links={links} dueTomorrow={dueTomorrow} />
        <div className={styles.right}>
          <ThemeToggle />
          {student ? (
            <Link href="/register?next=/" className={styles.avatar} aria-label={`Your account, ${student.name}`} title={`${student.name} · ${student.rollNo}`}>
              {initials(student.name)}
            </Link>
          ) : (
            <Link href="/register" className={`btn btn--accent btn--sm ${styles.register}`}>
              Register
            </Link>
          )}
          <MenuButton student={student ? { rollNo: student.rollNo, name: student.name } : null} links={links} dueTomorrow={dueTomorrow} />
        </div>
      </nav>
    </header>
  );
}
