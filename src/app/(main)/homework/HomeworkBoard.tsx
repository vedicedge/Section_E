'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/client-api';
import type { DueBucket, DueMode, ResolvedDue } from '@/lib/homework/due';
import { dueLabel, dueSentence } from '@/lib/homework/messages';
import { addDays, formatDay } from '@/lib/time';
import { Hourglass } from '@/components/Engravings';
import { Linkified } from './Linkified';
import styles from './homework.module.css';

export interface BoardItem {
  id: string;
  subjectCode: string;
  subjectTitle: string;
  title: string;
  details: string;
  givenOn: string;
  dueMode: DueMode;
  due: ResolvedDue;
  bucket: DueBucket;
  done: boolean;
}

interface Props {
  rollNo: string;
  today: string;
  items: BoardItem[];
  /** Rendered between the header and the lists (the reminders card). */
  reminder?: ReactNode;
}

const PAST_DAYS = 14;
const pad = (n: number) => String(n).padStart(2, '0');

function daysBetween(from: string, to: string): number {
  const utc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

export function HomeworkBoard({ rollNo, today, items, reminder }: Props) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Order is decided once per visit, so ticking an item never makes the list jump under a finger.
  const [orderDone] = useState(() => new Map(items.map((i) => [i.id, i.done])));
  const chains = useRef(new Map<string, Promise<unknown>>());
  const latest = useRef(new Map<string, number>());
  const confirmed = useRef(new Map<string, boolean>());
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(refreshTimer.current), []);

  const isDone = (i: BoardItem) => overrides[i.id] ?? i.done;
  const pendingFirst = (list: BoardItem[]) => {
    const wasDone = (i: BoardItem) => orderDone.get(i.id) ?? i.done;
    return [...list.filter((i) => !wasDone(i)), ...list.filter(wasDone)];
  };

  function scheduleRefresh() {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => startTransition(() => router.refresh()), 1200);
  }

  function toggle(item: BoardItem, next: boolean) {
    const id = item.id;
    const seq = (latest.current.get(id) ?? 0) + 1;
    latest.current.set(id, seq);
    setOverrides((o) => ({ ...o, [id]: next }));
    setSaving((s) => ({ ...s, [id]: true }));
    setErrors(({ [id]: _cleared, ...rest }) => rest);

    // One request at a time per item, so a quick tick-untick reaches the server in order.
    const run = (chains.current.get(id) ?? Promise.resolve()).then(() =>
      api<{ done: boolean }>(`/api/homework/${encodeURIComponent(id)}/done`, { done: next }),
    );
    chains.current.set(id, run);
    void run.then((res) => {
      if (res.ok) confirmed.current.set(id, next);
      if (latest.current.get(id) !== seq) return;
      setSaving(({ [id]: _settled, ...rest }) => rest);
      if (res.ok) return scheduleRefresh();
      setOverrides((o) => ({ ...o, [id]: confirmed.current.get(id) ?? item.done }));
      setErrors((e) => ({ ...e, [id]: `Not saved. ${res.error}` }));
      if (res.status === 404) scheduleRefresh();
    });
  }

  const tomorrowISO = addDays(today, 1);
  const pastFrom = addDays(today, -PAST_DAYS);
  const current = items.filter((i) => i.bucket !== 'past');
  const tomorrow = pendingFirst(items.filter((i) => i.bucket === 'tomorrow'));
  const dueToday = pendingFirst(items.filter((i) => i.bucket === 'today'));
  const upcoming = items.filter((i) => i.bucket === 'upcoming');
  const undated = pendingFirst(items.filter((i) => i.bucket === 'undated'));
  const past = pendingFirst(
    items
      .filter((i) => i.bucket === 'past' && i.due.date && i.due.date >= pastFrom)
      .sort((a, b) => b.due.date!.localeCompare(a.due.date!) || a.subjectCode.localeCompare(b.subjectCode)),
  );

  const upcomingByDate: { date: string; items: BoardItem[] }[] = [];
  for (const item of upcoming) {
    const group = upcomingByDate.find((g) => g.date === item.due.date);
    if (group) group.items.push(item);
    else upcomingByDate.push({ date: item.due.date!, items: [item] });
  }

  const pending = current.filter((i) => !isDone(i)).length;
  const tomorrowPending = tomorrow.filter((i) => !isDone(i)).length;
  const nextDeadline = [...upcoming, ...undated].find((i) => !isDone(i));

  const renderList = (list: BoardItem[], headingLevel: 3 | 4 = 3) => (
    <ul className={styles.list}>
      {list.map((item) => (
        <Item
          key={item.id}
          item={item}
          today={today}
          done={isDone(item)}
          saving={Boolean(saving[item.id])}
          error={errors[item.id] ?? null}
          headingLevel={headingLevel}
          onToggle={toggle}
        />
      ))}
    </ul>
  );

  return (
    <>
      <header className={styles.head}>
        <p className="eyebrow">
          Homework · <span className="tabular">{rollNo}</span>
        </p>
        <h1 className="page-title">
          Home<em>work</em>
          <span className="count">
            <span aria-hidden>({pad(pending)})</span>
            <span className="sr-only">
              {pending} {pending === 1 ? 'task' : 'tasks'} to do
            </span>
          </span>
        </h1>
      </header>

      {reminder && <div className={styles.reminder}>{reminder}</div>}

      {current.length === 0 ? (
        <section className={styles.empty} aria-label="Nothing due">
          <Hourglass className={styles.emptyArt} />
          <div>
            <h2 className={styles.emptyTitle}>
              Nothing <em>due.</em>
            </h2>
            <p className={styles.emptyText}>Enjoy the quiet — outside the building.</p>
            <p className={styles.emptyText}>
              When homework is set it lands here, sorted by when it’s due, and the reminder arrives the evening before.
            </p>
          </div>
        </section>
      ) : (
        <div className={styles.sections}>
          {tomorrow.length > 0 ? (
            <section className={styles.tomorrow} aria-labelledby="hw-tomorrow">
              <div className={styles.tomorrowHead}>
                <p className={styles.tomorrowLabel}>
                  {tomorrowPending > 0 && <span className="dot dot--pulse" aria-hidden />}
                  {formatDay(tomorrowISO)}
                </p>
                <h2 id="hw-tomorrow" className={styles.tomorrowTitle}>
                  Due <em>tomorrow</em>
                  <span className="count">({pad(tomorrowPending)})</span>
                </h2>
                {tomorrowPending === 0 && <p className={styles.tomorrowNote}>All done for tomorrow — well played.</p>}
              </div>
              {renderList(tomorrow)}
            </section>
          ) : (
            <section className={styles.quiet} aria-labelledby="hw-tomorrow">
              <p className={styles.tomorrowLabel}>{formatDay(tomorrowISO)}</p>
              <h2 id="hw-tomorrow" className={styles.quietTitle}>
                Nothing due <em>tomorrow.</em>
              </h2>
              <p className={styles.quietText}>
                {nextDeadline
                  ? `Next deadline: ${nextDeadline.subjectCode} — ${dueLabel(nextDeadline.due, today)}.`
                  : 'A free evening. Spend it wisely, or don’t.'}
              </p>
            </section>
          )}

          {dueToday.length > 0 && (
            <section aria-labelledby="hw-today" className={styles.urgent}>
              <h2 id="hw-today" className={styles.groupTitle}>
                Due <em>today</em>
                <span className="count">({pad(dueToday.length)})</span>
              </h2>
              {renderList(dueToday)}
            </section>
          )}

          {upcomingByDate.length > 0 && (
            <section aria-labelledby="hw-upcoming">
              <h2 id="hw-upcoming" className={styles.groupTitle}>
                Coming up
                <span className="count">({pad(upcoming.length)})</span>
              </h2>
              {upcomingByDate.map((group) => {
                const inDays = daysBetween(today, group.date);
                return (
                  <div key={group.date} className={styles.dateGroup}>
                    <h3 className={styles.dateHead}>
                      {formatDay(group.date)}
                      <span className={styles.dateRel}>in {inDays} days</span>
                    </h3>
                    {renderList(pendingFirst(group.items), 4)}
                  </div>
                );
              })}
            </section>
          )}

          {undated.length > 0 && (
            <section aria-labelledby="hw-undated">
              <h2 id="hw-undated" className={styles.groupTitle}>
                Next class — <em>date to be confirmed</em>
                <span className="count">({pad(undated.length)})</span>
              </h2>
              <p className={styles.groupNote}>Due at the subject’s next class. The date appears here as soon as it’s known.</p>
              {renderList(undated)}
            </section>
          )}
        </div>
      )}

      {past.length > 0 && (
        <details className={styles.past}>
          <summary>
            <span className={styles.pastTitle}>
              Past
              <span className="count">({pad(past.length)})</span>
            </span>
            <span className={styles.pastMeta}>
              Last {PAST_DAYS} days
              <span className={styles.chev} aria-hidden>
                <svg viewBox="0 0 12 12" fill="none">
                  <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </span>
            </span>
          </summary>
          {renderList(past)}
        </details>
      )}
    </>
  );
}

function Item({
  item,
  today,
  done,
  saving,
  error,
  headingLevel,
  onToggle,
}: {
  item: BoardItem;
  today: string;
  done: boolean;
  saving: boolean;
  error: string | null;
  headingLevel: 3 | 4;
  onToggle: (item: BoardItem, next: boolean) => void;
}) {
  const Title = headingLevel === 4 ? 'h4' : 'h3';
  const errorId = `hw-err-${item.id}`;
  return (
    <li className={styles.item} data-done={done || undefined} aria-busy={saving || undefined}>
      <label className={styles.tick}>
        <input
          type="checkbox"
          className={styles.tickInput}
          checked={done}
          onChange={(e) => onToggle(item, e.target.checked)}
          aria-describedby={error ? errorId : undefined}
        />
        <span className={styles.tickMark} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M6 12.5l4 4 8-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className={styles.tickWord} aria-hidden>
          Done
        </span>
        <span className="sr-only">
          Done: {item.subjectCode} — {item.title}
        </span>
      </label>

      <div className={styles.main}>
        <p className={styles.subject}>
          <span className={styles.code}>{item.subjectCode}</span>
          {item.subjectTitle && item.subjectTitle !== item.subjectCode && <span className={styles.subjectTitle}>{item.subjectTitle}</span>}
        </p>
        <Title className={styles.title}>{item.title}</Title>
        {item.details.trim() && (
          <p className={styles.details}>
            <Linkified text={item.details.trim()} className={styles.link} />
          </p>
        )}
        {error && (
          <p id={errorId} className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>

      <div className={styles.side}>
        <p className={styles.due}>{dueSentence(item, today)}</p>
        {item.due.source === 'snapshot' && <p className={styles.hint}>Based on the last known timetable</p>}
        <p className={styles.given}>Given {formatDay(item.givenOn)}</p>
      </div>
    </li>
  );
}
