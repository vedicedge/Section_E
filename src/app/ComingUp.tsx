import Link from 'next/link';
import { comingUp, countdownLabel, examCountdown, type UpcomingItem } from '@/lib/coming-up';
import { upcomingKeyDates } from '@/lib/key-dates';
import { homeworkForStudent } from '@/lib/homework/repo';
import { placementsFor } from '@/lib/placements/repo';
import { pptSummary } from '@/lib/placements/format';
import { listPublishedQuizzes } from '@/lib/quizzes/repo';
import { addDays, formatClock, formatDay, todayISO, weekdayOf } from '@/lib/time';
import styles from '@/components/Board.module.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function whenWord(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return weekdayOf(date);
}

function Row({ item, today }: { item: UpcomingItem; today: string }) {
  const [, m, d] = item.date.split('-').map(Number);
  const meta = [whenWord(item.date, today), item.time ? formatClock(item.time) : null, item.subject].filter(Boolean).join(' · ');
  const body = (
    <>
      <span className={styles.when} aria-hidden>
        <span className={`${styles.whenDay} tabular`}>{d}</span>
        <span className={styles.whenMonth}>{MONTHS[m! - 1]}</span>
      </span>
      <span>
        <span className={styles.rowTitle}>
          <span className={`${styles.tag} ${item.kind === 'exam' ? styles.tagExam : ''}`}>{item.label}</span>
          {item.title}
        </span>
        <br />
        <span className={styles.rowMeta}>
          <span className="sr-only">{formatDay(item.date)} · </span>
          {meta}
        </span>
      </span>
    </>
  );
  return (
    <li>
      {item.href ? (
        <Link href={item.href} className={styles.row} style={{ color: 'inherit' }}>
          {body}
        </Link>
      ) : (
        <div className={styles.row}>{body}</div>
      )}
    </li>
  );
}

/**
 * The next two weeks for this student (admin dates + their unfinished homework + mock tests),
 * and a countdown to the first exam. Everyone sees the exam countdown; the list needs a sign-in.
 */
export async function ComingUp({ rollNo }: { rollNo: string | null }) {
  const today = todayISO();
  const [dates, homework, quizzes, placements] = await Promise.all([
    upcomingKeyDates(today),
    rollNo ? homeworkForStudent(rollNo).catch(() => []) : Promise.resolve([]),
    rollNo ? listPublishedQuizzes().catch(() => []) : Promise.resolve([]),
    rollNo ? placementsFor(rollNo, today).catch(() => []) : Promise.resolve([]),
  ]);
  const items = rollNo ? comingUp({ dates, homework, quizzes }, { today, days: 14, limit: 8 }, placements) : [];
  const nextPpt = placements[0];
  const countdown = examCountdown(dates, today);
  if (!items.length && !countdown && !rollNo) return null;

  return (
    <div className={styles.upGrid}>
      {rollNo && nextPpt && (
        <section className={styles.card} style={{ gridColumn: '1 / -1' }} aria-label="Pre-Placement Talk" data-testid="ppt-notice">
          <p className={styles.rowTitle}>You&apos;re on the attendee list for {pptSummary(nextPpt)}</p>
          {nextPpt.notes && <p className={styles.meta}>{nextPpt.notes}</p>}
        </section>
      )}
      {rollNo && (
        <section className={styles.card} aria-labelledby="up-title" data-testid="coming-up">
          <h2 id="up-title" className={styles.panelTitle}>
            Coming up
          </h2>
          {items.length ? (
            <ul className={styles.list} style={{ gap: 0 }}>
              {items.map((it) => (
                <Row key={it.key} item={it} today={today} />
              ))}
            </ul>
          ) : (
            <p className={styles.meta}>Nothing in the next two weeks. Exams, presentations and deadlines will show here.</p>
          )}
        </section>
      )}
      {countdown && (
        <section className={`${styles.card} ${styles.countdown}`} aria-labelledby="countdown-title" data-testid="exam-countdown">
          <h2 id="countdown-title" className={styles.panelTitle} style={{ marginBottom: 4 }}>
            Exams
          </h2>
          {countdown.days > 0 && <span className={`${styles.bigNumber} tabular`}>{countdown.days}</span>}
          <span className={styles.bigLabel}>
            {countdownLabel(countdown.days)}
            {countdown.days > 0 ? ` (${countdown.first.subject ?? countdown.first.title}, ${formatDay(countdown.first.onDate)})` : ''}
          </span>
          <ul className={styles.examList}>
            {countdown.remaining.slice(0, 8).map((e) => (
              <li key={e.id}>
                <span>
                  {e.subject ? `${e.subject} · ` : ''}
                  {e.title}
                </span>
                <span className="tabular">
                  {formatDay(e.onDate)}
                  {e.atTime ? `, ${formatClock(e.atTime)}` : ''}
                </span>
              </li>
            ))}
            {countdown.remaining.length > 8 && <li className={styles.meta}>and {countdown.remaining.length - 8} more</li>}
          </ul>
          {countdown.first.kind === 'exam' && countdown.first.details && <span className={styles.meta}>{countdown.first.details}</span>}
        </section>
      )}
    </div>
  );
}
