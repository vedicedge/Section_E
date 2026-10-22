'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { api, type ApiResult } from '@/lib/client-api';
import {
  DEBOUNCE_MS,
  EMPTY_RECORD,
  UNDO_MS,
  applyDelta,
  boardOf,
  formatPercent,
  heldOf,
  standing,
  type HeartsResponse,
  type PatchResponse,
  type SubjectRecord,
} from '@/lib/attendance/calc';
import type { AttendancePatch, AttendanceView } from '@/lib/attendance/repo';
import { errorCopy, liveCopy, methodCopy, pad2, plateCopy, toastCopy } from './copy';
import { Entry } from './Entry';
import { HeartDefs } from './Heart';
import styles from './attendance.module.css';

interface Props {
  rollNo: string;
  view: AttendanceView;
}

type Records = Record<string, SubjectRecord>;
interface Toast {
  key: number;
  id: string | null;
  text: string;
  undo?: { id: string; delta: number };
  signIn?: boolean;
}

const REFRESH_AFTER_MS = 60_000;

/**
 * `api()` for strikes, with `keepalive` so a tap made just before the tab closes or hides still
 * reaches the server (the debounce would otherwise hold it back).
 */
async function postHearts(body: { subjectId: string; delta: number }): Promise<ApiResult<HeartsResponse>> {
  try {
    const res = await fetch('/api/attendance/hearts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      keepalive: true,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, status: res.status, code: json?.error?.code ?? 'error', error: json?.error?.message ?? `Request failed (${res.status}).` };
    }
    return { ok: true, data: json as HeartsResponse };
  } catch {
    return { ok: false, status: 0, code: 'network', error: 'You seem to be offline. Check your connection and try again.' };
  }
}

const seed = (view: AttendanceView): Records => Object.fromEntries(view.subjects.map((s) => [s.id, s.record]));
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function AttendanceBoard({ rollNo, view }: Props) {
  const router = useRouter();
  const { minPercent, today } = view;
  const pct = formatPercent(minPercent);

  const [records, setRecords] = useState<Records>(() => seed(view));
  const [toast, setToast] = useState<Toast | null>(null);
  const [announce, setAnnounce] = useState('');
  const [openEditor, setOpenEditor] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [overAsked, setOverAsked] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);

  // The latest optimistic records, readable synchronously between renders (rapid taps).
  const live = useRef<Records>(records);
  const confirmed = useRef(new Map(view.subjects.map((s) => [s.id, s.record])));
  const pending = useRef(new Map<string, number>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const chains = useRef(new Map<string, Promise<unknown>>());
  const inflight = useRef(new Map<string, number>());
  const seq = useRef(new Map<string, number>());
  // Bumped when a request fails: strikes queued behind it are dropped (the board already rolled back).
  const generation = useRef(new Map<string, number>());
  // When each subject's last save settled, and when we last asked the server for a fresh view.
  const settledAt = useRef(new Map<string, number>());
  const refreshAt = useRef(0);
  const toastKey = useRef(0);
  const lastRefresh = useRef(0);
  const firstView = useRef(view);

  const dismissToast = useCallback(() => setToast(null), []);
  const subjectOf = useCallback((id: string) => view.subjects.find((s) => s.id === id), [view]);

  function setRecord(id: string, record: SubjectRecord) {
    live.current = { ...live.current, [id]: record };
    setRecords(live.current);
  }

  function showToast(t: Omit<Toast, 'key'>) {
    toastKey.current += 1;
    setToast({ ...t, key: toastKey.current });
  }

  /* ------------------------------------------------------------- saving */

  function refresh() {
    refreshAt.current = Date.now();
    lastRefresh.current = refreshAt.current;
    startTransition(() => router.refresh());
  }

  /**
   * Sends a subject's netted taps. Normally queued behind its previous request so the server sees
   * them in order; `now` (tab hiding or closing) sends at once with keepalive, since a queued
   * request would never leave a frozen page.
   */
  function flush(id: string, now = false): Promise<unknown> {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    const d = pending.current.get(id) ?? 0;
    pending.current.set(id, 0);
    if (d === 0) {
      // Tap and undo inside the debounce: nothing to send, so show exactly what the server has.
      if (!(inflight.current.get(id) ?? 0)) setRecord(id, confirmed.current.get(id) ?? EMPTY_RECORD);
      return chains.current.get(id) ?? Promise.resolve();
    }
    const s = (seq.current.get(id) ?? 0) + 1;
    seq.current.set(id, s);
    inflight.current.set(id, (inflight.current.get(id) ?? 0) + 1);
    const gen = generation.current.get(id) ?? 0;
    const early = now ? postHearts({ subjectId: id, delta: d }) : null;

    const run = (chains.current.get(id) ?? Promise.resolve())
      .then(() => {
        // An earlier request failed after this one was queued: drop it, the board rolled back.
        if (!early && (generation.current.get(id) ?? 0) !== gen) return null;
        return early ?? postHearts({ subjectId: id, delta: d });
      })
      .then((res) => {
        inflight.current.set(id, (inflight.current.get(id) ?? 1) - 1);
        if (!res) return;
        settledAt.current.set(id, Date.now());
        const code = subjectOf(id)?.code ?? id;
        if (res.ok) {
          confirmed.current.set(id, res.data.record);
          // Snap to the server's count (another device may have moved it) unless more taps are waiting.
          if (seq.current.get(id) === s && !pending.current.get(id)) setRecord(id, res.data.record);
          const held = heldOf(res.data.record);
          if (res.data.heldRaised && held !== null) {
            const extra = toastCopy('held', code, standing(0, null, minPercent), held);
            setToast((t) => (t && t.id === id && !t.text.includes('Held so far') ? { ...t, text: t.text + extra } : t));
          }
          return;
        }
        generation.current.set(id, gen + 1);
        pending.current.set(id, 0);
        clearTimeout(timers.current.get(id));
        timers.current.delete(id);
        setRecord(id, confirmed.current.get(id) ?? EMPTY_RECORD);
        showToast({ id, text: errorCopy(res.status, res.error), signIn: res.status === 401 });
        if (res.status === 404) refresh();
      });
    chains.current.set(id, run);
    return run;
  }

  function bump(id: string, delta: number) {
    const subject = subjectOf(id);
    if (!subject) return;
    const before = live.current[id] ?? EMPTY_RECORD;
    const result = applyDelta(before, delta, subject.defaultTotal);
    const applied = result.record.missed - before.missed;
    if (applied === 0) {
      if (delta > 0) showToast({ id, text: toastCopy('full', subject.code, standing(subject.defaultTotal, before, minPercent)) });
      return;
    }
    setRecord(id, result.record);
    setConfirming(null);

    pending.current.set(id, (pending.current.get(id) ?? 0) + applied);
    clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      setTimeout(() => void flush(id), DEBOUNCE_MS),
    );

    const was = standing(subject.defaultTotal, before, minPercent);
    const now = standing(subject.defaultTotal, result.record, minPercent);
    let kind: Parameters<typeof toastCopy>[0];
    if (applied > 0) kind = now.over > was.over ? 'over' : 'strike';
    else kind = was.over > 0 ? 'unover' : 'mend';
    showToast({ id, text: toastCopy(kind, subject.code, now, minPercent), undo: { id, delta: -applied } });
    setAnnounce(liveCopy(subject.code, now));
    if (applied > 0 && !reducedMotion()) navigator.vibrate?.(12);
  }

  async function saveNumbers(id: string, patch: Omit<AttendancePatch, 'subjectId'>): Promise<string | null> {
    const subject = subjectOf(id);
    if (!subject) return 'That subject is no longer on the attendance list.';
    await flush(id);
    const run = (chains.current.get(id) ?? Promise.resolve()).then(() =>
      api<PatchResponse>('/api/attendance', { subjectId: id, ...patch }, 'PATCH'),
    );
    chains.current.set(id, run);
    const res = await run;
    settledAt.current.set(id, Date.now());
    if (!res.ok) {
      if (res.status === 404) refresh();
      if (res.status === 401) showToast({ id, text: errorCopy(401, res.error), signIn: true });
      return res.status === 422 ? res.error : errorCopy(res.status, res.error).replace(' Your hearts are back as they were.', '');
    }
    confirmed.current.set(id, res.data.record);
    setRecord(id, res.data.record);
    // Only close this subject's editor — another one may be open with unsaved edits.
    setOpenEditor((open) => (open === id ? null : open));
    showToast({ id, text: toastCopy('saved', subject.code, standing(subject.defaultTotal, res.data.record, minPercent)) });
    setAnnounce(liveCopy(subject.code, standing(subject.defaultTotal, res.data.record, minPercent)));
    requestAnimationFrame(() => document.getElementById(`att-${id}-adj`)?.focus());
    return null;
  }

  function pastLimit(id: string) {
    if (overAsked.has(id)) bump(id, 1);
    else setConfirming(id);
  }
  function confirmOver(id: string) {
    setOverAsked((s) => new Set(s).add(id));
    setConfirming(null);
    bump(id, 1);
  }

  /* --------------------------------------------------------- lifecycle */

  useEffect(() => {
    setReady(true);
    lastRefresh.current = Date.now();
    const pendingMap = pending.current;
    const timerMap = timers.current;
    return () => {
      // Leaving the page: send whatever is still waiting on the debounce, straight away.
      for (const [id, d] of pendingMap) {
        if (!d) continue;
        clearTimeout(timerMap.get(id));
        pendingMap.set(id, 0);
        void postHearts({ subjectId: id, delta: d });
      }
    };
  }, []);

  // A fresh server view (router.refresh) re-seeds subjects that have no work in flight — and none
  // saved since that view was requested, which would make it older than what we already know.
  useEffect(() => {
    if (view === firstView.current) return;
    firstView.current = view;
    lastRefresh.current = Date.now();
    let next = live.current;
    for (const s of view.subjects) {
      const busy = (pending.current.get(s.id) ?? 0) !== 0 || timers.current.has(s.id) || (inflight.current.get(s.id) ?? 0) > 0;
      const settled = settledAt.current.get(s.id);
      if (busy || (settled !== undefined && settled >= refreshAt.current)) continue;
      confirmed.current.set(s.id, s.record);
      next = { ...next, [s.id]: s.record };
    }
    live.current = next;
    setRecords(next);
  }, [view]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'hidden') {
        for (const id of [...pending.current.keys()]) void flush(id, true);
        return;
      }
      if (Date.now() - lastRefresh.current > REFRESH_AFTER_MS) refresh();
    };
    const onHide = () => {
      for (const id of [...pending.current.keys()]) void flush(id, true);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onHide);
    };
  });

  /* ------------------------------------------------------------- render */

  const rows = view.subjects.map((s) => {
    const record = records[s.id] ?? EMPTY_RECORD;
    return { subject: s, record, standing: standing(s.defaultTotal, record, minPercent) };
  });
  const board = boardOf(rows.map((r) => ({ id: r.subject.id, standing: r.standing })));
  const hasAnyRecord =
    view.hasAnyRecord || rows.some((r) => r.record.missed > 0 || r.record.held !== null || r.record.totalOverride !== null);
  const plate = plateCopy({
    subjects: rows.map((r) => ({ id: r.subject.id, code: r.subject.code, standing: r.standing, nextClass: r.subject.nextClass })),
    board,
    hasAnyRecord,
    minPercent,
    today,
  });
  const n = view.subjects.length;

  function jump(e: MouseEvent<HTMLAnchorElement>, id: string) {
    const target = document.getElementById(`att-${id}`);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    document.getElementById(`att-${id}-t`)?.focus({ preventScroll: true });
    history.replaceState(null, '', `#att-${id}`);
  }

  return (
    <div className={styles.board}>
      <HeartDefs />

      <header className={styles.head}>
        <p className="eyebrow">
          Attendance · <span className="tabular">{rollNo}</span>
          {view.termLabel && <> · {view.termLabel}</>}
        </p>
        <h1 className="page-title">
          Atten<em>dance</em>
          <span className="count">
            <span key={board.left} className={styles.roll} aria-hidden>
              ({pad2(board.left)})
            </span>
            <span className="sr-only">
              {board.left} {board.left === 1 ? 'heart' : 'hearts'} left across {n} {n === 1 ? 'subject' : 'subjects'}
            </span>
          </span>
        </h1>
        <p className={styles.standfirst}>
          The fine art of missing class, <span className="script">gracefully</span>.
        </p>
        <p className={styles.sub}>
          Each heart is a class you can miss and still keep {pct}%. Strike one off when you take it.
        </p>
      </header>

      <div className={styles.plateSlot}>
        {plate.tone === 'red' ? (
          <section className={styles.plateRed} aria-labelledby="att-plate">
            <div className={styles.plateHead}>
              <p className={styles.plateLabel}>
                <span className="dot dot--pulse" aria-hidden />
                {plate.label}
              </p>
              <h2 id="att-plate" className={styles.plateTitle}>
                {plate.title[0]}
                <em>{plate.title[1]}</em>
                {plate.title[2]}
              </h2>
              {plate.text && <p className={styles.plateText}>{plate.text}</p>}
            </div>
            {plate.rows.length > 0 && (
              <ul className={styles.plateRows}>
                {plate.rows.map((r) => (
                  <li key={r.id}>
                    <a href={`#att-${r.id}`} className={styles.plateRow} onClick={(e) => jump(e, r.id)}>
                      <span className={styles.plateCode}>{r.code}</span>
                      <span className={styles.plateSentence}>{r.sentence}</span>
                      <span className={styles.plateArrow} aria-hidden>
                        →
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className={styles.plateQuiet} aria-labelledby="att-plate">
            <p className={styles.plateLabel}>{plate.label}</p>
            <h2 id="att-plate" className={styles.quietTitle}>
              {plate.title[0]}
              <em>{plate.title[1]}</em>
              {plate.title[2]}
            </h2>
            {plate.text && <p className={styles.quietText}>{plate.text}</p>}
          </section>
        )}
      </div>

      <nav className={styles.index} aria-label="Subjects at a glance">
        <p className={styles.indexLabel}>
          The term at a glance · {board.left} of {board.hearts} hearts in hand
        </p>
        <ul className={styles.indexList}>
          {rows.map(({ subject, standing: s }, i) => (
            <li key={subject.id}>
              <a
                href={`#att-${subject.id}`}
                className={styles.indexLink}
                data-spent={(s.left === 0 && s.over === 0) || undefined}
                data-over={s.over > 0 || undefined}
                aria-label={s.over > 0 ? `${subject.code}: over the limit` : `${subject.code}: ${s.left} of ${s.allowance} hearts left`}
                onClick={(e) => jump(e, subject.id)}
              >
                {subject.code}
                <span className="count">
                  <span key={s.over > 0 ? 'over' : s.left} className={styles.roll}>
                    ({s.over > 0 ? 'over' : pad2(s.left)})
                  </span>
                </span>
              </a>
              {i < rows.length - 1 && (
                <span className={styles.slash} aria-hidden>
                  /
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <ol className={styles.entries}>
        {rows.map(({ subject, record, standing: s }, i) => (
          <Entry
            key={subject.id}
            index={i}
            subject={subject}
            record={record}
            standing={s}
            minPercent={minPercent}
            today={today}
            ready={ready}
            confirming={confirming === subject.id}
            editorOpen={openEditor === subject.id}
            onBump={(d) => bump(subject.id, d)}
            onPastLimit={() => pastLimit(subject.id)}
            onConfirmOver={() => confirmOver(subject.id)}
            onCancelOver={() => setConfirming(null)}
            onToggleEditor={() => setOpenEditor((o) => (o === subject.id ? null : subject.id))}
            onCloseEditor={() => {
              setOpenEditor(null);
              requestAnimationFrame(() => document.getElementById(`att-${subject.id}-adj`)?.focus());
            }}
            onSave={(patch) => saveNumbers(subject.id, patch)}
            onUseClassCount={() =>
              void saveNumbers(subject.id, { total: null }).then((err) => err && showToast({ id: subject.id, text: err }))
            }
          />
        ))}
      </ol>

      <section className={styles.method} aria-labelledby="att-method">
        <h2 id="att-method" className={styles.methodTitle}>
          A note on <em>method</em>
        </h2>
        <div className={styles.methodBody}>
          <p className="caps">{methodCopy(minPercent)}</p>
          <p className="caps">
            Your count is private — no classmate, and no admin, can see it. It isn’t the college register: when the two
            disagree, the register wins.
          </p>
        </div>
        <p className={styles.signoff}>Spend them wisely.</p>
      </section>

      <ToastView toast={toast} onDone={dismissToast} onUndo={(u) => bump(u.id, u.delta)} />
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}

function ToastView({
  toast,
  onDone,
  onUndo,
}: {
  toast: Toast | null;
  onDone: () => void;
  onUndo: (u: { id: string; delta: number }) => void;
}) {
  const [paused, setPaused] = useState(false);
  // A new toast starts its own timer: focus inside an Undo button that has since gone never blurs.
  const key = toast?.key;
  useEffect(() => setPaused(false), [key]);
  useEffect(() => {
    if (!toast || paused) return;
    const t = setTimeout(onDone, UNDO_MS);
    return () => clearTimeout(t);
  }, [toast, paused, onDone]);

  return (
    <div
      className={styles.toastRegion}
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      {toast && (
        <div key={toast.key} className={styles.toast}>
          <p className={styles.toastText}>
            {toast.text}
            {toast.signIn && (
              <>
                {' '}
                <Link href="/register?next=/attendance" className={styles.toastLink}>
                  Register again <span aria-hidden>→</span>
                </Link>
              </>
            )}
          </p>
          {toast.undo && (
            <button
              type="button"
              className={styles.undo}
              onClick={() => {
                const u = toast.undo!;
                onDone();
                onUndo(u);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
