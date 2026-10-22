import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/admin-guard';
import { attendanceSummary, getAttendanceSettings } from '@/lib/attendance/repo';
import { homeworkSubjects, type SubjectOption } from '@/lib/homework/repo';
import { AttendanceSettings, NewTermPanel } from './AttendanceSettings';
import styles from '../../admin.module.css';
import css from './attendance.module.css';

export const metadata: Metadata = { title: 'Attendance · Admin' };
export const dynamic = 'force-dynamic';

const HIDDEN = 'Fewer than 5 students — hidden for privacy';

/** A per-subject count, or a dash when too few students count it to show safely. */
function Cell({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className={styles.dim} title={HIDDEN}>
        —<span className="sr-only"> ({HIDDEN})</span>
      </span>
    );
  }
  return <span className={styles.mono}>{value}</span>;
}

export default async function AdminAttendance() {
  // The panel layout isn't re-run on client navigation, so guard the data here too.
  await requireAdminPage();
  const [{ config, updatedAt }, summary, plans] = await Promise.all([
    getAttendanceSettings(),
    attendanceSummary(),
    homeworkSubjects().catch(() => [] as SubjectOption[]),
  ]);

  return (
    <div className={`${styles.stack} ${css.page}`}>
      <header className={styles.pageHead}>
        <div>
          <p className="eyebrow">Section E · attendance</p>
          <h1 className={styles.title}>Attendance</h1>
          <p className={styles.lede}>
            Students keep a private count of the classes they miss. You set the rule and each subject’s sessions — changes reach everyone straight away, no
            redeploy. You see totals only, never names or roll numbers.
          </p>
        </div>
      </header>

      <AttendanceSettings initial={config} updatedAt={updatedAt} plans={plans} />

      <section className={styles.panel} aria-labelledby="att-counting">
        <h2 id="att-counting" className={styles.panelTitle}>
          Who’s counting
        </h2>
        <div className={styles.cards}>
          <div className={styles.card}>
            <span className={styles.cardLabel}>Tracking</span>
            <span className={`${styles.cardValue} tabular`}>{summary.tracking}</span>
            <span className={styles.cardNote}>of {summary.registered} registered students</span>
          </div>
        </div>
        {summary.subjects.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${css.countTable}`}>
              <caption className="sr-only">Students counting, by subject</caption>
              <thead>
                <tr>
                  <th scope="col">Subject</th>
                  <th scope="col">Counting</th>
                  <th scope="col">Out of hearts</th>
                  <th scope="col">Over the limit</th>
                </tr>
              </thead>
              <tbody>
                {summary.subjects.map((s) => (
                  <tr key={s.id}>
                    <th scope="row">{s.code}</th>
                    <td>
                      <Cell value={s.tracking} />
                    </td>
                    <td>
                      <Cell value={s.spent} />
                    </td>
                    <td>
                      <Cell value={s.over} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">
          Counts are private to each student; this page shows totals only, with no names or roll numbers. Subjects with fewer than 5 students counting
          are hidden.
        </p>
      </section>

      <NewTermPanel />
    </div>
  );
}
