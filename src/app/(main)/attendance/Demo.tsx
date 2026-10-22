'use client';

import { useState } from 'react';
import { conditionLabel, conditionLine, standing } from '@/lib/attendance/calc';
import { heartLabel, pad2 } from './copy';
import { HeartButton, HeartDefs } from './Heart';
import styles from './attendance.module.css';

const CODE = 'DMA';
const TOTAL = 20;
const MIN_PERCENT = 80;

/** The teaser's one-subject demo: real hearts, local state only, nothing saved. */
export function Demo() {
  const [missed, setMissed] = useState(0);
  const s = standing(TOTAL, { totalOverride: null, held: null, heldOn: null, missed }, MIN_PERCENT);
  const n = s.allowance;
  const bump = (d: number) => setMissed((m) => Math.min(n, Math.max(0, m + d)));

  return (
    <section className={`${styles.board} ${styles.demo}`} aria-labelledby="att-demo-t">
      <HeartDefs />
      <div className={styles.demoHead}>
        <p className={styles.meta}>
          {CODE} · {n} hearts
        </p>
        <h2 id="att-demo-t" className={styles.demoTitle}>
          Try it
          <span className="count">
            <span key={s.left} className={styles.roll} aria-hidden>
              ({pad2(s.left)})
            </span>
          </span>
        </h2>
      </div>
      <div className={styles.demoBody}>
        <div
          className={styles.hearts}
          role="group"
          aria-label={`${CODE} hearts: ${s.left} of ${n} left`}
          aria-describedby="att-demo-c"
        >
          {Array.from({ length: n }, (_, i) => {
            const state = i < s.left ? 'intact' : 'spent';
            return (
              <HeartButton
                key={i}
                state={state}
                label={heartLabel(CODE, state, i + 1, n)}
                last={s.left === 1 && i === 0}
                beatKey={missed}
                onPress={() => bump(state === 'intact' ? 1 : -1)}
              />
            );
          })}
        </div>
        <div className={styles.condition}>
          <p className={styles.condLabel} data-alert={s.left <= 1 || undefined}>
            Condition · {conditionLabel(s.condition)}
          </p>
          <p id="att-demo-c" key={s.condition} className={styles.condLine}>
            {conditionLine(CODE, s, MIN_PERCENT)}
          </p>
        </div>
      </div>
      <p className={styles.demoNote}>That one’s a demo. Register to keep your own count.</p>
    </section>
  );
}
