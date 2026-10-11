'use client';

import Link from 'next/link';
import { useState } from 'react';
import styles from './page.module.css';

export interface HeroFeature {
  href: string;
  label: React.ReactNode;
  plain: string;
  count: string;
  script: string;
  caption: string;
}

const HOW_MANY = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];

/**
 * The reference's index of names, reused as the feature buttons: two to a line with slashes on
 * wide screens, one per line with its caption on phones. Hover / focus turns an item bone-white
 * and swaps the giant script watermark behind the centrepiece.
 */
export function HeroFeatures({ features }: { features: HeroFeature[] }) {
  const [active, setActive] = useState<number | null>(null);
  const current = active === null ? null : features[active];
  const things = HOW_MANY[features.length] ?? String(features.length);

  return (
    <>
      <nav aria-label="Features" className={styles.features}>
        <ul>
          {features.map((f, i) => (
            <li key={f.href}>
              <span className={styles.featureLine}>
                <Link
                  href={f.href}
                  className={`${styles.feature} ${active === i ? styles.featureActive : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  aria-describedby={`feature-caption-${i}`}
                >
                  <span className={styles.featureLabel}>{f.label}</span>
                  <span className="count">({f.count})</span>
                </Link>
                {i < features.length - 1 && (
                  <span className={styles.slash} aria-hidden>
                    /
                  </span>
                )}
              </span>
              <span id={`feature-caption-${i}`} className={styles.featureCaption}>
                {f.caption}
              </span>
            </li>
          ))}
        </ul>
        <p className={styles.caption} aria-hidden>
          {current ? current.caption : `${things} things, built only for Section E — pick one.`}
        </p>
      </nav>
      <div className={styles.watermark} aria-hidden>
        {features.map((f, i) => (
          <span key={f.href} className={active === i ? styles.watermarkOn : ''}>
            {f.script}
          </span>
        ))}
        <span className={active === null ? styles.watermarkOn : ''}>Section E</span>
      </div>
    </>
  );
}
