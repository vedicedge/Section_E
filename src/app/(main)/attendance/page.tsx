import Link from 'next/link';
import type { Metadata } from 'next';
import { getStudent } from '@/lib/session';
import { attendanceFor, getAttendanceConfig } from '@/lib/attendance/repo';
import { formatPercent, standing } from '@/lib/attendance/calc';
import { Locket } from '@/components/Engravings';
import { AttendanceBoard } from './AttendanceBoard';
import { Demo } from './Demo';
import styles from './attendance.module.css';

export const metadata: Metadata = { title: 'Attendance' };
export const dynamic = 'force-dynamic';

function Head({ eyebrow, standfirst = true }: { eyebrow: string; standfirst?: boolean }) {
  return (
    <header className={styles.head}>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="page-title">
        Atten<em>dance</em>
      </h1>
      {standfirst && (
        <p className={styles.standfirst}>
          The fine art of missing class, <span className="script">gracefully</span>.
        </p>
      )}
    </header>
  );
}

export default async function AttendancePage() {
  const [student, config] = await Promise.all([getStudent(), getAttendanceConfig()]);

  if (!config.enabled) {
    return (
      <div className="container page">
        <Head eyebrow="Attendance" standfirst={false} />
        <p className="notice">Attendance tracking is switched off for now.</p>
      </div>
    );
  }

  if (!student) {
    const pct = formatPercent(config.minPercent);
    const hearts = config.subjects.reduce((sum, s) => sum + standing(s.total, null, config.minPercent).allowance, 0);
    const n = config.subjects.length;
    return (
      <div className="container page">
        <Head eyebrow="Attendance · Members only" />
        <section className={styles.empty} aria-label="Register to keep your attendance">
          <Locket className={styles.emptyArt} />
          <div>
            <h2 className={styles.emptyTitle}>
              Miss class, <em>gracefully.</em>
            </h2>
            <p className={styles.emptyText}>
              Every subject comes with a few hearts — the classes you can skip and still keep {pct}%. Strike one off whenever you
              miss one, and always know what’s left. Only you can see yours.
            </p>
            {n > 0 && (
              <p className={styles.emptyText}>
                This term: {hearts} {hearts === 1 ? 'heart' : 'hearts'} across {n} {n === 1 ? 'subject' : 'subjects'}.
              </p>
            )}
            <div className={styles.teaserActions}>
              <Link href="/register?next=/attendance" className="btn btn--accent">
                Register to start counting <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </section>
        <Demo />
      </div>
    );
  }

  if (config.subjects.length === 0) {
    return (
      <div className="container page">
        <Head eyebrow="Attendance" />
        <section className={styles.empty} aria-label="Not set up yet">
          <Locket className={styles.emptyArt} />
          <div>
            <h2 className={styles.emptyTitle}>
              The term isn’t <em>set up</em> yet.
            </h2>
            <p className={styles.emptyText}>Your CR is adding this term’s subjects and sessions. Check back soon.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="container page">
      <AttendanceBoard rollNo={student.rollNo} view={await attendanceFor(student.rollNo)} />
    </div>
  );
}
