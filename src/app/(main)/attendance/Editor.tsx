'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { MAX_SESSIONS, heldOf, standing, validateRecord, type EditField, type SubjectRecord } from '@/lib/attendance/calc';
import type { AttendancePatch } from '@/lib/attendance/repo';
import { previewCopy } from './copy';
import styles from './attendance.module.css';

type Patch = Omit<AttendancePatch, 'subjectId'>;

interface Props {
  id: string;
  code: string;
  defaultTotal: number;
  minPercent: number;
  record: SubjectRecord;
  /** Resolves to an error message, or null once saved. */
  onSave: (patch: Patch) => Promise<string | null>;
  onClose: () => void;
}

/** Stepper names — kept clear of the field labels, so getByLabel('Sessions this term') finds only the input. */
const SHORT: Record<EditField, string> = { total: 'sessions', missed: 'leaves', held: 'classes held' };

const asText = (n: number | null) => (n === null ? '' : String(n));
/** '' → null; anything that isn't a whole number → NaN. */
function parse(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  return /^\d{1,3}$/.test(t) ? Number(t) : NaN;
}

export function Editor({ id, code, defaultTotal, minPercent, record, onSave, onClose }: Props) {
  const uid = useId();
  const liveTotal = record.totalOverride ?? defaultTotal;
  const liveHeld = heldOf(record);
  const [total, setTotal] = useState(String(liveTotal));
  const [missed, setMissed] = useState(String(record.missed));
  const [held, setHeld] = useState(asText(liveHeld));
  const [edited, setEdited] = useState<EditField | undefined>(undefined);
  // Fields the student has changed. Only these are saved; the others keep following the board, so a
  // heart tapped while the editor is open isn't undone by Save.
  const [touched, setTouched] = useState<ReadonlySet<EditField>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<{ field: EditField | null; message: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const resetYes = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    first.current?.focus();
  }, []);
  useEffect(() => {
    if (confirmReset) resetYes.current?.focus();
  }, [confirmReset]);
  useEffect(() => {
    if (!touched.has('total')) setTotal(String(liveTotal));
    if (!touched.has('missed')) setMissed(String(record.missed));
    if (!touched.has('held')) setHeld(asText(liveHeld));
  }, [liveTotal, record.missed, liveHeld, touched]);

  const nTotal = parse(total);
  const nMissed = parse(missed);
  const nHeld = parse(held);

  let fieldError: { field: EditField; message: string } | null = null;
  if (nTotal === null || Number.isNaN(nTotal) || nTotal < 1 || nTotal > MAX_SESSIONS) {
    fieldError = { field: 'total', message: `Sessions must be a whole number from 1 to ${MAX_SESSIONS}.` };
  } else if (nMissed === null || Number.isNaN(nMissed)) {
    fieldError = { field: 'missed', message: 'Leaves must be a whole number (0 or more).' };
  } else if (nHeld !== null && Number.isNaN(nHeld)) {
    fieldError = { field: 'held', message: 'Held so far must be a whole number, or empty.' };
  } else {
    fieldError = validateRecord(code, { total: nTotal, held: nHeld, missed: nMissed }, edited);
  }
  const error = fieldError ?? (serverError?.field ? { field: serverError.field, message: serverError.message } : null);

  const changed: Patch = {};
  if (!fieldError) {
    if (touched.has('total') && nTotal !== liveTotal) changed.total = nTotal === defaultTotal ? null : nTotal!;
    if (touched.has('missed') && nMissed !== record.missed) changed.missed = nMissed!;
    if (touched.has('held') && nHeld !== liveHeld) changed.held = nHeld;
  }
  const dirty = Object.keys(changed).length > 0;

  const preview =
    nTotal !== null && !Number.isNaN(nTotal) && nTotal >= 1 && nTotal <= MAX_SESSIONS
      ? previewCopy(
          standing(defaultTotal, { totalOverride: nTotal, held: null, heldOn: null, missed: nMissed !== null && !Number.isNaN(nMissed) ? nMissed : 0 }, minPercent),
        )
      : null;
  const resetHearts = standing(defaultTotal, null, minPercent).allowance;

  function set(field: EditField, value: string) {
    setEdited(field);
    setTouched((t) => (t.has(field) ? t : new Set(t).add(field)));
    setServerError(null);
    if (field === 'total') setTotal(value);
    else if (field === 'missed') setMissed(value);
    else setHeld(value);
  }
  function step(field: EditField, by: number) {
    const current = field === 'total' ? nTotal : field === 'missed' ? nMissed : nHeld;
    const base = current === null || Number.isNaN(current) ? (field === 'total' ? defaultTotal : 0) : current;
    const lo = field === 'total' ? 1 : 0;
    set(field, String(Math.min(MAX_SESSIONS, Math.max(lo, base + by))));
  }

  async function save(patch: Patch) {
    setBusy(true);
    setServerError(null);
    const err = await onSave(patch);
    setBusy(false);
    if (err) setServerError({ field: null, message: err });
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (confirmReset) setConfirmReset(false);
      else onClose();
    }
  }

  const row = (
    field: EditField,
    label: string,
    value: string,
    hint: ReactNode,
    opts: { min: number; ref?: Ref<HTMLInputElement> },
  ) => {
    const inputId = `${uid}-${field}`;
    const hintId = `${inputId}-hint`;
    const errId = `${inputId}-err`;
    const hasErr = error?.field === field;
    const n = parse(value);
    return (
      <div className={styles.field} data-invalid={hasErr || undefined}>
        <div className={styles.fieldText}>
          <label htmlFor={inputId} className={styles.fieldLabel}>
            {label}
          </label>
          <p id={hintId} className={styles.fieldHint}>
            {hint}
          </p>
        </div>
        <div className={styles.stepper}>
          <button
            type="button"
            className={styles.stepBtn}
            onClick={() => step(field, -1)}
            disabled={busy || (n !== null && !Number.isNaN(n) && n <= opts.min)}
            aria-label={`Decrease ${SHORT[field]}`}
          >
            <span aria-hidden>−</span>
          </button>
          <input
            ref={opts.ref}
            id={inputId}
            className={styles.stepInput}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={value}
            onChange={(e) => set(field, e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
            onFocus={(e) => e.currentTarget.select()}
            aria-invalid={hasErr || undefined}
            aria-describedby={hasErr ? `${errId} ${hintId}` : hintId}
          />
          <button
            type="button"
            className={styles.stepBtn}
            onClick={() => step(field, 1)}
            disabled={busy || (n !== null && !Number.isNaN(n) && n >= MAX_SESSIONS)}
            aria-label={`Increase ${SHORT[field]}`}
          >
            <span aria-hidden>+</span>
          </button>
        </div>
        {hasErr && (
          <p id={errId} className={styles.fieldError}>
            {error!.message}
          </p>
        )}
      </div>
    );
  };

  const overridden = nTotal !== null && !Number.isNaN(nTotal) && nTotal !== defaultTotal;

  return (
    <div className={styles.editor} onKeyDown={onKeyDown} role="group" aria-label={`Adjust ${code} numbers`}>
      {row(
        'total',
        'Sessions this term',
        total,
        overridden ? (
          <>
            Your count: {nTotal} · class count {defaultTotal} ·{' '}
            <button type="button" className={styles.textBtn} onClick={() => set('total', String(defaultTotal))}>
              Use {defaultTotal}
            </button>
          </>
        ) : (
          `The class count is ${defaultTotal}. Change it only if yours differs.`
        ),
        { min: 1, ref: first },
      )}
      {row('missed', 'Leaves taken', missed, 'The hearts above, as a number — fastest way to enter leaves you’ve already taken.', { min: 0 })}
      {row(
        'held',
        'Classes held so far (optional)',
        held,
        <>
          From the attendance portal — gives your percentage so far.
          {held !== '' && (
            <>
              {' '}
              <button type="button" className={styles.textBtn} onClick={() => set('held', '')}>
                Clear
              </button>
            </>
          )}
        </>,
        { min: 0 },
      )}

      <p className={styles.preview} aria-live="polite">
        {preview}
      </p>
      {serverError && !serverError.field && (
        <p className={styles.fieldError} role="alert">
          {serverError.message}
        </p>
      )}

      <div className={styles.editorActions}>
        <button type="button" className="btn btn--accent btn--sm" disabled={busy || !dirty || Boolean(error)} onClick={() => void save(changed)}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        {!confirmReset && (
          <button type="button" className={`${styles.textBtn} ${styles.startOver}`} onClick={() => setConfirmReset(true)} disabled={busy}>
            Start {code} over
          </button>
        )}
      </div>

      {confirmReset && (
        <div className={styles.confirm} role="group" aria-labelledby={`att-${id}-reset`}>
          <p id={`att-${id}-reset`} className={styles.confirmText}>
            Restore all {resetHearts} {resetHearts === 1 ? 'heart' : 'hearts'} and clear your numbers?
          </p>
          <div className={styles.confirmActions}>
            <button
              ref={resetYes}
              type="button"
              className="btn btn--accent btn--sm"
              disabled={busy}
              onClick={() => void save({ total: null, held: null, missed: 0 })}
            >
              Yes, start over
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmReset(false)} disabled={busy}>
              Keep
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
