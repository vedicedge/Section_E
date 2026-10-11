import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getStudent } from '@/lib/session';
import { seatsForStudent } from '@/lib/seating/repo';
import { nextSession, upcomingSchedule } from '@/lib/schedule';
import { firstName } from '@/lib/names';
import { formatClock, formatDay, todayISO } from '@/lib/time';
import { Pavilion } from '@/components/Engravings';
import { SeatViewer } from './SeatViewer';
import styles from './seat.module.css';

export const metadata: Metadata = { title: 'My Seating Plan' };
export const dynamic = 'force-dynamic';

export default async function SeatPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const student = await getStudent();
  if (!student) redirect('/register?next=/seat');
  const params = await searchParams;
  const [seats, schedule] = await Promise.all([
    seatsForStudent(student.rollNo),
    upcomingSchedule(7).catch(() => ({ state: null, days: [] })),
  ]);

  const visible = seats.filter((s) => s.status !== 'expired');
  const next = nextSession(schedule.days);
  const nextSeat = next?.session.planId ? visible.find((s) => s.plan.id === next.session.planId) : null;
  const requested = typeof params.subject === 'string' ? params.subject : null;
  const initial =
    visible.find((s) => requested && s.plan.code.toLowerCase() === requested.toLowerCase())?.plan.id ??
    nextSeat?.plan.id ??
    visible.find((s) => s.seat && s.status === 'current')?.plan.id ??
    visible[0]?.plan.id ??
    null;
  const placed = visible.filter((s) => s.seat).length;

  return (
    <div className="container page">
      <header className={styles.head}>
        <p className="eyebrow">
          My seating plan · <span className="tabular">{student.rollNo}</span>
        </p>
        <h1 className="page-title">
          Your seats, <em>{firstName(student.name)}</em>
          <span className="count">({String(placed).padStart(2, '0')})</span>
        </h1>
      </header>

      {next && nextSeat?.seat && (
        <Link href={`/seat?subject=${encodeURIComponent(nextSeat.plan.code)}`} className={styles.next}>
          <span className={styles.nextLabel}>
            <span className="dot dot--pulse" /> Next class · {next.date === todayISO() ? 'Today' : formatDay(next.date)}
            {next.session.start ? ` · ${formatClock(next.session.start)}` : ''}
          </span>
          <span className={styles.nextBody}>
            <span className={styles.nextSubject}>{nextSeat.plan.title}</span>
            <span className={`${styles.nextSeat} tabular`}>
              {nextSeat.seat.rowLabel} · Seat {nextSeat.seat.seatNumber}
            </span>
          </span>
        </Link>
      )}

      {visible.length === 0 ? (
        <div className={styles.empty}>
          <Pavilion className={styles.emptyArt} />
          <h2 className={styles.emptyTitle}>
            No seating plans <em>yet.</em>
          </h2>
          <p className="muted">
            As soon as the admin uploads this term’s seating chart, your seat for every subject appears here — and only yours.
          </p>
        </div>
      ) : (
        <SeatViewer seats={visible} initialPlanId={initial} studentName={student.name} />
      )}
    </div>
  );
}
