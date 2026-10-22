import Link from 'next/link';
import { cache } from 'react';
import { getStudent } from '@/lib/session';
import { isAttendanceEnabled } from '@/lib/attendance/repo';
import { pendingDueCount } from '@/lib/homework/repo';
import { isTimetableEnabled } from '@/lib/timetable/service';
import { addDays, todayISO } from '@/lib/time';
import { Logo } from './Logo';
import { MenuButton } from './Menu';
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

/** Header shared by every student page: "+" menu · script logotype · identity link. */
export async function SiteHeader({ tone = 'paper' }: { tone?: 'paper' | 'red' }) {
  const [student, timetable, attendance] = await Promise.all([getStudent(), timetableEnabled(), attendanceEnabled()]);
  const dueTomorrow = student ? await dueTomorrowFor(student.rollNo) : 0;
  return (
    <header className={`${styles.header} ${tone === 'red' ? styles.red : ''}`}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.left}>
          <MenuButton
            student={student ? { rollNo: student.rollNo, name: student.name } : null}
            timetable={timetable}
            attendance={attendance}
            dueTomorrow={dueTomorrow}
            tone={tone}
          />
        </div>
        <Logo className={styles.logo} />
        <div className={styles.right}>
          {student ? (
            <Link href="/seat" className={styles.cta} title={`Signed in as ${student.name}`}>
              <span className={styles.ctaLong}>{student.rollNo}</span>
              <span className={styles.ctaShort}>My seat</span>
            </Link>
          ) : (
            <Link href="/register" className={styles.cta}>
              Register
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
