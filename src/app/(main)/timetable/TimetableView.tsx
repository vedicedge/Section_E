'use client';

import { useEffect, useMemo, useState } from 'react';
import { SessionList, type SessionView } from '@/components/SessionList';
import type { Grid } from '@/lib/grid';
import { WEEKDAYS, addDays, formatClock, formatDay, minutesNow, startOfWeek, toMinutes, weekdayOf } from '@/lib/time';
import { OriginalSheet } from './OriginalSheet';
import styles from './timetable.module.css';

export interface TimetableSession extends SessionView {
  key: string;
  date: string | null;
  day: (typeof WEEKDAYS)[number] | null;
  sheet: string;
  cell: string;
}

interface Change {
  key: string;
  date: string | null;
  day: string | null;
  start: string | null;
  before: string | null;
  after: string | null;
  detectedAt: string;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function TimetableView({
  sessions,
  sheets,
  detected,
  summary,
  changes,
  today,
  showSeats,
  fileName,
}: {
  sessions: TimetableSession[];
  sheets: Grid[];
  detected: boolean;
  summary: string;
  changes: Change[];
  today: string;
  showSeats: boolean;
  fileName: string | null;
}) {
  const [tab, setTab] = useState<'schedule' | 'sheet'>(detected ? 'schedule' : 'sheet');
  const dated = sessions.some((s) => s.date);

  // Dated timetables: navigate week by week. Weekly (undated) timetables: Mon–Sat tabs.
  const dates = useMemo(() => [...new Set(sessions.map((s) => s.date).filter(Boolean) as string[])].sort(), [sessions]);
  const weeks = useMemo(() => [...new Set(dates.map(startOfWeek))].sort(), [dates]);
  const defaultDate = dates.find((d) => d >= today) ?? dates[dates.length - 1] ?? today;
  const [selected, setSelected] = useState<string>(dated ? defaultDate : weekdayOf(today) === 'Sun' ? 'Mon' : weekdayOf(today));
  const [week, setWeek] = useState(() => startOfWeek(dated ? defaultDate : today));
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(minutesNow());
    const t = setInterval(() => setNow(minutesNow()), 60_000);
    return () => clearInterval(t);
  }, []);

  const daySessions = sessions.filter((s) => (dated ? s.date === selected : s.day === selected));
  const isToday = dated ? selected === today : selected === weekdayOf(today);
  const withNow: SessionView[] = daySessions.map((s) => ({
    ...s,
    isNow: Boolean(isToday && now !== null && (toMinutes(s.start) ?? Infinity) <= now && now < (toMinutes(s.end) ?? -1)),
  }));

  const weekIdx = weeks.indexOf(week);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(week, i)).filter((d) => weekdayOf(d) !== 'Sun' || dates.includes(d));
  const recent = changes.filter((c) => c.after || c.before).slice(0, 6);

  return (
    <div>
      <div className={styles.tabs} role="tablist" aria-label="Timetable views">
        <button role="tab" aria-selected={tab === 'schedule'} className={styles.tab} onClick={() => setTab('schedule')} disabled={!detected}>
          Section E schedule
        </button>
        <button role="tab" aria-selected={tab === 'sheet'} className={styles.tab} onClick={() => setTab('sheet')}>
          Official sheet
        </button>
      </div>

      {!detected && (
        <p className="notice" style={{ margin: '20px 0' }}>
          {summary} Section E cells are not highlighted because the layout could not be read automatically.
        </p>
      )}

      {tab === 'schedule' && detected && (
        <div role="tabpanel">
          {recent.length > 0 && (
            <section className={styles.changes} aria-label="Recent changes">
              <p className={styles.changesTitle}>
                <span className="dot" /> {recent.length} change{recent.length === 1 ? '' : 's'} in the last few days
              </p>
              <ul>
                {recent.map((c) => (
                  <li key={c.key + c.detectedAt}>
                    <span className="tabular">
                      {c.date ? formatDay(c.date) : c.day} {c.start ? formatClock(c.start) : ''}
                    </span>
                    {c.before && c.after ? (
                      <>
                        <s>{c.before.split('\n')[0]}</s> → <strong>{c.after.split('\n')[0]}</strong>
                      </>
                    ) : c.after ? (
                      <>
                        Added <strong>{c.after.split('\n')[0]}</strong>
                      </>
                    ) : (
                      <>
                        Removed <s>{c.before!.split('\n')[0]}</s>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {dated ? (
            <div className={styles.weekNav}>
              <button
                type="button"
                className={styles.weekArrow}
                onClick={() => setWeek(weeks[weekIdx - 1] ?? addDays(week, -7))}
                disabled={weekIdx <= 0 && week <= (weeks[0] ?? week)}
                aria-label="Previous week"
              >
                ←
              </button>
              <p className={styles.weekLabel}>
                Week of {Number(week.slice(8))} {SHORT_MONTHS[Number(week.slice(5, 7)) - 1]}
              </p>
              <button
                type="button"
                className={styles.weekArrow}
                onClick={() => setWeek(weeks[weekIdx + 1] ?? addDays(week, 7))}
                disabled={week >= (weeks[weeks.length - 1] ?? week)}
                aria-label="Next week"
              >
                →
              </button>
            </div>
          ) : null}

          <div className={styles.days} role="group" aria-label="Day">
            {(dated ? weekDays : WEEKDAYS.filter((d) => d !== 'Sun' || sessions.some((s) => s.day === 'Sun'))).map((d) => {
              const count = sessions.filter((s) => (dated ? s.date === d : s.day === d)).length;
              const label = dated ? weekdayOf(d) : d;
              const isTodayTab = dated ? d === today : d === weekdayOf(today);
              return (
                <button
                  key={d}
                  type="button"
                  className={`${styles.day} ${selected === d ? styles.dayOn : ''} ${isTodayTab ? styles.dayToday : ''}`}
                  onClick={() => setSelected(d)}
                  aria-pressed={selected === d}
                  disabled={count === 0}
                >
                  <span className={styles.dayName}>{label}</span>
                  {dated && <span className={`${styles.dayNum} tabular`}>{Number(d.slice(8))}</span>}
                  <span className={styles.dayCount}>{count ? `${count} session${count === 1 ? '' : 's'}` : '—'}</span>
                </button>
              );
            })}
          </div>

          <h2 className={styles.dayTitle}>
            {dated ? formatDay(selected, true) : selected}
            {isToday && <em> — today</em>}
          </h2>
          {withNow.length ? (
            <SessionList sessions={withNow} showSeats={showSeats} />
          ) : (
            <p className={styles.none}>No classes on the timetable for this day.</p>
          )}
          <p className={styles.footnote}>{summary}</p>
        </div>
      )}

      {tab === 'sheet' && (
        <div role="tabpanel">
          <OriginalSheet sheets={sheets} highlight={sessions.map((s) => `${s.sheet}!${s.cell}`)} fileName={fileName} />
        </div>
      )}
    </div>
  );
}
