'use client';

import { useEffect, useState } from 'react';
import { HEART_PATH } from '@/lib/attendance/calc';
import styles from './attendance.module.css';

export type HeartState = 'intact' | 'spent' | 'over' | 'ghost';
type Anim = 'strike' | 'mend' | 'over';

/** The crack line, shared by both halves' clip paths and the drawn seam. */
const SEAM = 'L21.2 15 L26.4 19.6 L22 26.5 L25.6 32.8 L24 42';
const ANIM_MS = 700;

/**
 * The sprite every heart references, rendered once per board. Zero-size and absolutely placed —
 * never display:none, which stops Safari resolving the patterns. Clip paths hold literal paths
 * (not <use>) for the same reason. Pattern content takes its colour from here, not from the heart
 * that uses it, so the ink hatch reads `--ink` at the sprite's place inside `.board`.
 */
export function HeartDefs() {
  return (
    <svg aria-hidden width="0" height="0" style={{ position: 'absolute' }} focusable="false" className={styles.defs}>
      <defs>
        <path id="att-shape" d={HEART_PATH} />
        <path id="att-shade" d="M46 14 C46 24 38 32 24 42 C33.5 33 40.5 25 41.4 15.5 C41.8 10.8 39.8 6.6 36.5 4.3 C42 5.2 46 9.2 46 14 Z" />
        <clipPath id="att-clip-l">
          <path d={`M0 0 H24 V9 ${SEAM} V44 H0 Z`} />
        </clipPath>
        <clipPath id="att-clip-r">
          <path d={`M48 0 H24 V9 ${SEAM} V44 H48 Z`} />
        </clipPath>
        <pattern id="att-hatch-dark" width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="2.6" stroke="#160a06" strokeWidth=".7" />
        </pattern>
        <pattern id="att-hatch-ink" width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="2.6" style={{ stroke: 'var(--ink)' }} strokeWidth=".6" />
        </pattern>
      </defs>
    </svg>
  );
}

function Half({ side }: { side: 'l' | 'r' }) {
  return (
    <g className={`${styles.half} ${side === 'l' ? styles.l : styles.r}`} clipPath={`url(#att-clip-${side})`}>
      <use className={styles.fill} href="#att-shape" />
      <use className={styles.shade} href="#att-shade" fill="url(#att-hatch-dark)" />
      <use className={styles.shadeSpent} href="#att-shade" fill="url(#att-hatch-ink)" />
      <use className={styles.outline} href="#att-shape" fill="none" />
    </g>
  );
}

/** One heart, drawn in every state; CSS (keyed on data-state) decides which layers show. */
export function HeartGlyph({ state }: { state: HeartState }) {
  return (
    <svg className={styles.glyph} viewBox="0 0 48 44" overflow="visible" aria-hidden focusable="false" data-state={state}>
      <use className={styles.base} href="#att-shape" />
      <Half side="l" />
      <Half side="r" />
      <path className={styles.glint} d="M8.5 14 C8.7 9.8 11.2 7.2 14.8 6.8" />
      <path className={styles.seam} d={`M24 9 ${SEAM}`} pathLength="1" />
      <path className={styles.strike} d="M6 39.5 C16 30.5 30 17.5 42.5 5.5 l3 .5" pathLength="1" />
      <use className={styles.ring} href="#att-shape" />
      <path className={styles.cross} d="M18.5 19.5 L29.5 30.5 M29.5 19.5 L18.5 30.5" />
      <path className={styles.plus} d="M24 15 v12 M18 21 h12" />
    </svg>
  );
}

function animFor(from: HeartState, to: HeartState): Anim | null {
  if (from === 'intact' && to === 'spent') return 'strike';
  if (from === 'spent' && to === 'intact') return 'mend';
  return null;
}

/**
 * A heart you can press. It animates its own state changes: intact → spent cracks it, spent →
 * intact mends it, and an over heart that appears after hydration drops in. `last` marks the
 * final intact heart, which beats three times; `beatKey` changing replays the beat.
 */
export function HeartButton({
  state,
  label,
  last,
  beatKey = 0,
  isNew,
  onPress,
  disabled,
}: {
  state: HeartState;
  label: string;
  last?: boolean;
  beatKey?: number;
  isNew?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  // "Adjusting state while rendering": remember the previous state and derive the animation.
  const [prev, setPrev] = useState(state);
  const [anim, setAnim] = useState<{ name: Anim; n: number } | null>(() =>
    isNew && state === 'over' ? { name: 'over', n: 0 } : null,
  );
  if (prev !== state) {
    setPrev(state);
    const name = animFor(prev, state);
    setAnim(name ? { name, n: (anim?.n ?? 0) + 1 } : null);
  }

  useEffect(() => {
    if (!anim) return;
    const t = setTimeout(() => setAnim(null), ANIM_MS);
    return () => clearTimeout(t);
  }, [anim]);

  return (
    <button
      type="button"
      className={styles.heartBtn}
      data-state={state}
      data-anim={anim?.name}
      data-last={last || undefined}
      // Two identical keyframes, alternated, restart the beat without remounting the glyph
      // (a remount would skip the crack's transitions).
      data-beat={last ? beatKey % 2 : undefined}
      aria-label={label}
      onClick={onPress}
      disabled={disabled}
    >
      <span className={styles.glyphWrap}>
        <HeartGlyph state={state} />
      </span>
      <span className={styles.shard} aria-hidden />
      <span className={styles.shard} aria-hidden />
      <span className={styles.shard} aria-hidden />
    </button>
  );
}
