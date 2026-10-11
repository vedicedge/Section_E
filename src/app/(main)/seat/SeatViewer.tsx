'use client';

import { useMemo, useState } from 'react';
import type { MySeat } from '@/lib/seating/repo';
import { formatDay } from '@/lib/time';
import { initials } from '@/lib/names';
import { SeatMap } from './SeatMap';
import styles from './seat.module.css';

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Rank of a row counted from the front (Row 1 = front, as on the official chart). */
function rowFromFront(layout: MySeat['plan']['layout'], rowIndex: number) {
  const numbered = layout.every((r) => r.number !== null);
  if (numbered) {
    const sorted = [...layout].map((r, i) => ({ n: r.number!, i })).sort((a, b) => a.n - b.n);
    return sorted.findIndex((r) => r.i === rowIndex) + 1;
  }
  return layout.length - rowIndex;
}

export function SeatViewer({ seats, initialPlanId, studentName }: { seats: MySeat[]; initialPlanId: string | null; studentName: string }) {
  const [selected, setSelected] = useState(initialPlanId ?? seats[0]?.plan.id);
  const current = seats.find((s) => s.plan.id === selected) ?? seats[0]!;
  const groups = useMemo(
    () => [
      { title: 'Classes', items: seats.filter((s) => s.plan.kind === 'class' && s.status === 'current') },
      { title: 'Exams', items: seats.filter((s) => s.plan.kind === 'exam' && s.status === 'current') },
      { title: 'Coming up', items: seats.filter((s) => s.status === 'upcoming') },
    ].filter((g) => g.items.length),
    [seats],
  );

  const seat = current.seat;
  const row = seat ? current.plan.layout[seat.rowIndex] : null;

  return (
    <div className={styles.viewer}>
      <nav className={styles.index} aria-label="Subjects">
        {groups.map((g) => (
          <div key={g.title} className={styles.group}>
            {groups.length > 1 && <p className="eyebrow">{g.title}</p>}
            <ul>
              {g.items.map((s, i) => (
                <li key={s.plan.id}>
                  <button
                    type="button"
                    className={`${styles.subject} ${s.plan.id === current.plan.id ? styles.subjectOn : ''}`}
                    aria-pressed={s.plan.id === current.plan.id}
                    onClick={() => setSelected(s.plan.id)}
                    title={s.plan.title}
                    aria-label={`${s.plan.title}: ${s.seat ? `${s.seat.rowLabel}, seat ${s.seat.seatNumber}` : 'not on this chart'}`}
                  >
                    {s.plan.code}
                    <span className="count">{s.seat ? `R${s.seat.rowNumber ?? s.seat.rowIndex + 1}·${s.seat.seatNumber}` : '—'}</span>
                  </button>
                  {i < g.items.length - 1 && (
                    <span className={styles.subjectSlash} aria-hidden>
                      /
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <section className={styles.detail} aria-live="polite" aria-label={`${current.plan.title} seat`}>
        <div className={styles.info}>
          <p className="eyebrow">
            {current.plan.kind === 'exam' ? 'Exam seating' : 'Class seating'}
            {current.status === 'upcoming' && current.plan.validFrom ? ` · from ${formatDay(current.plan.validFrom)}` : ''}
          </p>
          <h2 className={styles.subjectTitle}>{current.plan.title}</h2>
          {seat && row ? (
            <>
              <div className={styles.numerals}>
                <div>
                  <span className={styles.numLabel}>Row</span>
                  <span className={`${styles.num} tabular`}>{seat.rowNumber ?? seat.rowIndex + 1}</span>
                </div>
                <div>
                  <span className={styles.numLabel}>Seat</span>
                  <span className={`${styles.num} tabular`}>{String(seat.seatNumber).padStart(2, '0')}</span>
                </div>
              </div>
              <dl className={styles.facts}>
                <div>
                  <dt>Position</dt>
                  <dd>
                    {ordinal(rowFromFront(current.plan.layout, seat.rowIndex))} row from the front · seat {seat.position} of {row.seats.length}
                  </dd>
                </div>
                <div>
                  <dt>Room</dt>
                  <dd>{current.plan.room ?? 'Section E classroom'}</dd>
                </div>
                {(current.plan.validFrom || current.plan.validTo) && (
                  <div>
                    <dt>Valid</dt>
                    <dd>
                      {current.plan.validFrom ? formatDay(current.plan.validFrom, true) : 'Now'} – {current.plan.validTo ? formatDay(current.plan.validTo, true) : 'further notice'}
                    </dd>
                  </div>
                )}
              </dl>
              {seat.note && (
                <p className="notice notice--warn" role="note">
                  {seat.note}
                </p>
              )}
              {current.plan.notes && <p className={styles.planNote}>{current.plan.notes}</p>}
            </>
          ) : (
            <div className={styles.missing}>
              <p className={styles.missingTitle}>You’re not on this chart.</p>
              <p className="muted">
                The official {current.plan.code} seating plan doesn’t list your roll number. If you take this course, check with your
                class representative — the plan may be updated soon.
              </p>
            </div>
          )}
        </div>
        <div className={styles.mapWrap}>
          <SeatMap layout={current.plan.layout} seat={seat} label={initials(studentName)} />
        </div>
      </section>

      <section className={styles.all} aria-labelledby="all-seats">
        <h2 id="all-seats" className="eyebrow">
          All your seats
        </h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Subject</th>
              <th scope="col">Row</th>
              <th scope="col">Seat</th>
            </tr>
          </thead>
          <tbody>
            {seats.map((s) => (
              <tr key={s.plan.id} className={s.plan.id === current.plan.id ? styles.rowOn : ''}>
                <th scope="row">
                  <button type="button" onClick={() => setSelected(s.plan.id)}>
                    <span className={styles.code}>{s.plan.code}</span> {s.plan.title}
                    {s.status === 'upcoming' && <span className="pill pill--muted" style={{ marginLeft: 8 }}>Upcoming</span>}
                    {s.plan.kind === 'exam' && <span className="pill pill--warn" style={{ marginLeft: 8 }}>Exam</span>}
                  </button>
                </th>
                <td className="tabular">{s.seat ? (s.seat.rowNumber ?? s.seat.rowIndex + 1) : '—'}</td>
                <td className="tabular">{s.seat ? s.seat.seatNumber : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
