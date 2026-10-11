import Link from 'next/link';
import { formatClock } from '@/lib/time';
import styles from './SessionList.module.css';

export interface SessionView {
  id: string;
  start: string | null;
  end: string | null;
  slotLabel: string;
  text: string;
  subject: string | null;
  faculty: string | null;
  room: string | null;
  status: 'scheduled' | 'cancelled' | 'rescheduled' | 'extra' | 'exam';
  planCode: string | null;
  planTitle: string | null;
  seat?: { rowLabel: string; seatNumber: number } | null;
  changed?: { before: string | null } | null;
  isNow?: boolean;
}

const STATUS_LABEL: Record<SessionView['status'], string | null> = {
  scheduled: null,
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
  extra: 'Extra class',
  exam: 'Test / exam',
};

export function SessionList({ sessions, showSeats = true }: { sessions: SessionView[]; showSeats?: boolean }) {
  return (
    <ol className={styles.list}>
      {sessions.map((s) => {
        const title = s.planTitle ?? s.subject ?? s.text;
        const status = STATUS_LABEL[s.status];
        const details = [s.planCode && s.planTitle ? s.planCode : null, s.faculty, s.room].filter(Boolean);
        return (
          <li key={s.id} className={`${styles.row} ${s.status === 'cancelled' ? styles.cancelled : ''} ${s.isNow ? styles.now : ''}`}>
            <div className={`${styles.time} tabular`}>
              {s.start ? (
                <>
                  <span>{formatClock(s.start)}</span>
                  {s.end && <span className={styles.end}>– {formatClock(s.end)}</span>}
                </>
              ) : (
                <span>{s.slotLabel}</span>
              )}
            </div>
            <div className={styles.body}>
              <p className={styles.title}>
                {title}
                {s.isNow && <span className="pill pill--live" style={{ marginLeft: 12, verticalAlign: '0.3em' }}><span className="dot dot--pulse" />Now</span>}
              </p>
              {(details.length > 0 || status || s.changed) && (
                <p className={styles.meta}>
                  {status && <span className={`pill ${s.status === 'cancelled' ? 'pill--muted' : 'pill--warn'}`}>{status}</span>}
                  {s.changed && (
                    <span className="pill pill--warn" title={s.changed.before ? `Was: ${s.changed.before}` : 'New'}>
                      {s.changed.before ? 'Changed' : 'New'}
                    </span>
                  )}
                  {details.length > 0 && <span>{details.join(' · ')}</span>}
                </p>
              )}
              {s.planTitle && !s.faculty && !s.room && s.text !== title && s.text.length < 140 && (
                <p className={styles.raw}>“{s.text.replace(/\n/g, ' · ')}”</p>
              )}
              {s.changed?.before && <p className={styles.raw}>Previously: {s.changed.before.replace(/\n/g, ' · ')}</p>}
            </div>
            {showSeats && (
              <div className={styles.seat}>
                {s.seat ? (
                  <Link href={`/seat?subject=${encodeURIComponent(s.planCode ?? '')}`} className={styles.seatChip}>
                    <span className={styles.seatLabel}>Your seat</span>
                    <span className="tabular">
                      {s.seat.rowLabel} · Seat {s.seat.seatNumber}
                    </span>
                  </Link>
                ) : null}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
