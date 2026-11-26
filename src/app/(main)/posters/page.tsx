import type { Metadata } from 'next';
import { activePromotions } from '@/lib/extras';
import { formatDay } from '@/lib/time';
import styles from '@/components/Posters.module.css';

export const metadata: Metadata = { title: 'Posters' };
export const dynamic = 'force-dynamic';

export default async function PostersPage() {
  const posters = await activePromotions();
  return (
    <div className="container page">
      <header className={styles.head}>
        <p className="eyebrow">Events</p>
        <h1 className="page-title">Posters</h1>
        <p className={styles.lede}>Fests, talks and other events coming up. Each poster stays here until its event is over.</p>
      </header>

      {posters.length === 0 ? (
        <p className={styles.empty}>No event posters right now. New ones will show here and on the home page.</p>
      ) : (
        <ul className={styles.grid} data-testid="posters">
          {posters.map((p) => (
            <li key={p.id} id={`poster-${p.id}`} className={styles.poster}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.full} src={`/api/promotions/${p.id}`} alt={p.title} loading="lazy" />
              <h2 className={styles.posterTitle}>{p.title}</h2>
              <div className={styles.posterMeta}>
                <span className={styles.until}>Until {formatDay(p.endsOn)}</span>
                {p.link && (
                  <a className="btn btn--accent btn--sm" href={p.link} target="_blank" rel="noopener noreferrer">
                    Details
                    <span className="sr-only"> for {p.title} (opens in a new tab)</span>
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
