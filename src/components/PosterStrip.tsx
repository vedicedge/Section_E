import Link from 'next/link';
import type { Promotion } from '@/lib/extras';
import { formatDay } from '@/lib/time';
import styles from './Posters.module.css';

/**
 * Current event posters as a row on the home page. Each one opens the Posters page at that poster,
 * where it shows full size with its link. Nothing pops up over the page.
 */
export function PosterStrip({ posters }: { posters: Promotion[] }) {
  if (!posters.length) return null;
  return (
    <section className={styles.strip} aria-labelledby="posters-title" data-testid="poster-strip">
      <div className={styles.stripHead}>
        <h2 id="posters-title" className={styles.stripTitle}>
          Events
        </h2>
        <Link href="/posters" className={styles.seeAll}>
          See all
        </Link>
      </div>
      <ul className={styles.row}>
        {posters.map((p) => (
          <li key={p.id}>
            <Link href={`/posters#poster-${p.id}`} className={styles.thumbLink}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.thumb} src={`/api/promotions/${p.id}`} alt={p.title} loading="lazy" />
              <span className={styles.thumbTitle}>{p.title}</span>
              <span className={styles.until}>Until {formatDay(p.endsOn)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
