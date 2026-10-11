import type { MySeat } from '@/lib/seating/repo';
import styles from './seat.module.css';

/**
 * The room drawn from seat counts only — every other seat is an anonymous shape, so the map
 * shows where you sit without revealing who sits anywhere else. Orientation matches the
 * official sheet (highest row at the top, Row 1 at the front).
 */
export function SeatMap({ layout, seat, label }: { layout: MySeat['plan']['layout']; seat: MySeat['seat']; label: string }) {
  const max = Math.max(...layout.map((r) => r.seats.length));
  return (
    <figure className={styles.map} aria-label={seat ? `Room map: your seat is ${seat.rowLabel}, seat ${seat.seatNumber}` : 'Room map'}>
      <div className={styles.mapRows} style={{ ['--cols' as string]: max }}>
        {layout.map((row, ri) => (
          <div key={`${row.label}-${ri}`} className={`${styles.mapRow} ${seat?.rowIndex === ri ? styles.mapRowOn : ''}`}>
            <span className={styles.mapRowLabel}>{row.number ?? row.label}</span>
            <div className={styles.mapSeats}>
              {row.seats.map((s, si) => {
                const mine = seat?.rowIndex === ri && seat.position === si + 1;
                return (
                  <span
                    key={si}
                    className={`${styles.mapSeat} ${mine ? styles.mapSeatMine : ''} ${s.vacant ? styles.mapSeatVacant : ''}`}
                    aria-hidden={!mine}
                    aria-label={mine ? `Your seat, ${s.n}` : undefined}
                  >
                    {mine ? label || '★' : s.n}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <figcaption className={styles.front}>
        <span>Front of the room · Row 1</span>
      </figcaption>
    </figure>
  );
}
