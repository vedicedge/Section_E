'use client';

import { useEffect, useRef } from 'react';
import {
  MAX_DRAWN_HEARTS,
  MAX_DRAWN_OVER,
  conditionLabel,
  conditionLine,
  formatPercent,
  heldOf,
  type SubjectRecord,
  type SubjectStanding,
} from '@/lib/attendance/calc';
import type { AttendancePatch, StudentSubjectView } from '@/lib/attendance/repo';
import { attendNote, heartLabel, heldNote, pad2, whenLabel } from './copy';
import { Editor } from './Editor';
import { HeartButton, HeartGlyph } from './Heart';
import styles from './attendance.module.css';

const ALERT = new Set(['fragile', 'spent', 'in-the-red']);

interface Props {
  index: number;
  subject: StudentSubjectView;
  record: SubjectRecord;
  standing: SubjectStanding;
  minPercent: number;
  today: string;
  /** False during hydration, so only over hearts added afterwards drop in. */
  ready: boolean;
  confirming: boolean;
  editorOpen: boolean;
  /** +1 strikes a heart, −1 restores one. */
  onBump: (delta: number) => void;
  /** The ghost heart or "+" at zero hearts left: asks once before going over. */
  onPastLimit: () => void;
  onConfirmOver: () => void;
  onCancelOver: () => void;
  onToggleEditor: () => void;
  onCloseEditor: () => void;
  onSave: (patch: Omit<AttendancePatch, 'subjectId'>) => Promise<string | null>;
  /** "Use 20": back to the class count; a refusal is shown as a toast. */
  onUseClassCount: () => void;
}

export function Entry({
  index,
  subject,
  record,
  standing: s,
  minPercent,
  today,
  ready,
  confirming,
  editorOpen,
  onBump,
  onPastLimit,
  onConfirmOver,
  onCancelOver,
  onToggleEditor,
  onCloseEditor,
  onUseClassCount,
  onSave,
}: Props) {
  const { id, code } = subject;
  const pct = formatPercent(minPercent);
  const markIt = useRef<HTMLButtonElement>(null);
  const titleId = `att-${id}-t`;
  const condId = `att-${id}-c`;
  const n = s.allowance;
  const drawHearts = n <= MAX_DRAWN_HEARTS;
  const showLine = s.left === 0;
  const showGhost = s.left === 0 && s.missed < s.total;
  const drawnOver = Math.min(s.over, MAX_DRAWN_OVER);
  const override = record.totalOverride !== null && record.totalOverride !== subject.defaultTotal;
  const held = heldNote(heldOf(record), record.heldOn, s);

  useEffect(() => {
    if (confirming) markIt.current?.focus();
  }, [confirming]);

  const groupLabel = `${code} hearts: ${s.left} of ${n} left${s.over > 0 ? `, ${s.over} over the limit` : ''}`;
  const plus = () => (s.left === 0 ? onPastLimit() : onBump(1));

  return (
    <li id={`att-${id}`} className={styles.entryItem}>
      <article className={styles.entry} aria-labelledby={titleId} data-condition={s.condition}>
        <span className={styles.num} aria-hidden>
          {pad2(index + 1)}
        </span>

        <div className={styles.lead}>
          <p className={styles.meta}>
            {code} · {s.total} sessions
          </p>
          <h2 id={titleId} className={styles.entryTitle} tabIndex={-1}>
            {subject.title || code}
            <span className="count">
              <span key={s.left} className={styles.roll} aria-hidden>
                ({pad2(s.left)})
              </span>
              <span className="sr-only">
                {' '}
                {s.left} of {n} {n === 1 ? 'heart' : 'hearts'} left
              </span>
            </span>
          </h2>
          <div className={styles.condition}>
            <p className={styles.condLabel} data-alert={ALERT.has(s.condition) || undefined}>
              Condition · {conditionLabel(s.condition)}
            </p>
            <p id={condId} key={s.condition} className={styles.condLine}>
              {conditionLine(code, s, minPercent)}
            </p>
          </div>
        </div>

        <div className={styles.side}>
          <div className={styles.hearts} role="group" aria-label={groupLabel} aria-describedby={condId}>
            {drawHearts ? (
              Array.from({ length: n }, (_, i) => {
                const state = i < s.left ? 'intact' : 'spent';
                return (
                  <HeartButton
                    key={`h${i}`}
                    state={state}
                    label={heartLabel(code, state, i + 1, n)}
                    last={s.left === 1 && i === 0}
                    beatKey={s.missed}
                    onPress={() => onBump(state === 'intact' ? 1 : -1)}
                  />
                );
              })
            ) : (
              <span className={styles.bigCount}>
                <span className={styles.bigGlyph}>
                  <HeartGlyph state={s.left > 0 ? 'intact' : 'spent'} />
                </span>
                {s.left} of {n} left
              </span>
            )}
            {showLine && (
              <span className={styles.line} aria-hidden>
                <span className={styles.lineLabel}>{pct}%</span>
              </span>
            )}
            {Array.from({ length: drawnOver }, (_, k) => (
              <HeartButton
                key={`o${k}`}
                state="over"
                isNew={ready}
                label={heartLabel(code, 'over', k + 1, n)}
                onPress={() => onBump(-1)}
              />
            ))}
            {s.over > drawnOver && (
              <span className={styles.more} aria-hidden>
                +{s.over - drawnOver}
              </span>
            )}
            {showGhost && <HeartButton key="ghost" state="ghost" label={heartLabel(code, 'ghost', 0, n)} onPress={onPastLimit} />}
          </div>

          {confirming && (
            <div className={styles.confirm} role="group" aria-labelledby={`att-${id}-oc`}>
              <p id={`att-${id}-oc`} className={styles.confirmText}>
                {n === 0
                  ? `${code} allows no leave at ${pct}%. Mark this one anyway?`
                  : `That’s past your ${n}. It puts ${code} below ${pct}%. Mark it anyway?`}
              </p>
              <div className={styles.confirmActions}>
                <button ref={markIt} type="button" className="btn btn--accent btn--sm" onClick={onConfirmOver}>
                  Mark it
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={onCancelOver}>
                  Not now
                </button>
              </div>
            </div>
          )}

          <div className={styles.notes}>
            <p>{attendNote(s)}</p>
            {subject.nextClass && <p>Next class: {whenLabel(subject.nextClass.date, subject.nextClass.time, today)}</p>}
            {held && <p>{held}</p>}
            {override && (
              <p>
                Your count: {record.totalOverride} sessions · class count {subject.defaultTotal} ·{' '}
                <button type="button" className={styles.textBtn} onClick={onUseClassCount}>
                  Use {subject.defaultTotal}
                </button>
              </p>
            )}
            {s.inconsistent && (
              <p className={styles.alertNote}>
                You’ve logged {s.missed} leaves but {code} now has {s.total} sessions — adjust your numbers to fix this.
              </p>
            )}
          </div>

          <div className={styles.actions}>
            <div className={styles.steps}>
              <button type="button" className={styles.stepMinus} onClick={() => onBump(-1)} disabled={s.missed === 0} aria-label={`Undo a ${code} leave`}>
                <span aria-hidden>−</span>
              </button>
              <button type="button" className={styles.stepPlus} onClick={plus} aria-label={`Took a ${code} leave`}>
                <span aria-hidden>+</span> Took a leave
              </button>
            </div>
            <button
              type="button"
              id={`att-${id}-adj`}
              className={styles.adjust}
              aria-expanded={editorOpen}
              aria-controls={`att-${id}-ed`}
              onClick={onToggleEditor}
            >
              Adjust numbers
              <span className={styles.chev} aria-hidden>
                <svg viewBox="0 0 12 12" fill="none">
                  <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </span>
            </button>
          </div>
        </div>

        <div id={`att-${id}-ed`} className={styles.edWrap} data-open={editorOpen || undefined}>
          <div className={styles.edInner}>
            {editorOpen && (
              <Editor
                id={id}
                code={code}
                defaultTotal={subject.defaultTotal}
                minPercent={minPercent}
                record={record}
                onSave={onSave}
                onClose={onCloseEditor}
              />
            )}
          </div>
        </div>
      </article>
    </li>
  );
}
