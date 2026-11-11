import Link from 'next/link';
import type { Metadata } from 'next';
import { getStudent } from '@/lib/session';
import { listStudyMaterials, type StudyMaterial } from '@/lib/study';
import { studySource, youtubeId } from '@/lib/study-links';
import { formatDay, todayISO } from '@/lib/time';
import styles from './study.module.css';

export const metadata: Metadata = { title: 'Study material' };
export const dynamic = 'force-dynamic';

function DocIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 36 36" aria-hidden>
      <path d="M10 4h11l7 7v19a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M21 4v7h7M13 18h10M13 24h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Item({ m }: { m: StudyMaterial }) {
  const video = youtubeId(m.url);
  const meta = `${studySource(m.url)} · added ${formatDay(todayISO(new Date(m.addedAt)))}`;
  return (
    <li>
      <a href={m.url} target="_blank" rel="noopener noreferrer" className={`${styles.item} ${video ? styles.video : ''}`}>
        {video ? (
          <span className={styles.thumb}>
            {/* A still from YouTube, not an embedded player: nothing loads from YouTube until the student taps. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://i.ytimg.com/vi/${video}/hqdefault.jpg`} alt="" loading="lazy" />
            <span className={styles.play} aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24">
                <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
              </svg>
            </span>
          </span>
        ) : (
          <span className={styles.docIcon}>
            <DocIcon />
          </span>
        )}
        <span className={styles.body}>
          <span className={styles.kind}>{video ? 'Video' : 'Notes'}</span>
          <span className={styles.title}>{m.title}</span>
          <span className={styles.meta}>{meta}</span>
        </span>
        <span className={styles.open}>
          {video ? 'Watch' : 'Open'}
          <span className="sr-only"> (opens in a new tab)</span>
          <svg width="8" height="13" viewBox="0 0 8 13" aria-hidden>
            <path d="M1.5 1.5 6.5 6.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </a>
    </li>
  );
}

export default async function StudyPage() {
  const student = await getStudent();

  if (!student) {
    return (
      <div className="container page">
        <header className={styles.head}>
          <p className="eyebrow">Study material · Members only</p>
          <h1 className="page-title">Study material</h1>
          <p className={styles.lede}>Notes and videos shared for Section E, in one place. Register with your roll number to open them.</p>
        </header>
        <Link href="/register?next=/study" className="btn btn--accent">
          Register to see it
        </Link>
      </div>
    );
  }

  const materials = await listStudyMaterials();
  // Group by subject; general material (no subject) goes last.
  const groups = new Map<string, StudyMaterial[]>();
  for (const m of materials) {
    const key = m.subject ?? '';
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));

  return (
    <div className="container page">
      <header className={styles.head}>
        <p className="eyebrow">For Section E</p>
        <h1 className="page-title">Study material</h1>
        <p className={styles.lede}>Notes and videos shared for the section. Each one opens in a new tab.</p>
      </header>

      {ordered.length === 0 ? (
        <p className={styles.empty}>Nothing has been shared yet. New notes and videos will appear here.</p>
      ) : (
        <div className={styles.groups}>
          {ordered.map(([subject, items]) => (
            <section key={subject || 'general'} aria-labelledby={`study-${subject || 'general'}`}>
              <h2 id={`study-${subject || 'general'}`} className={styles.groupTitle}>
                {subject || 'General'}
                <span className="count tabular">({items.length})</span>
              </h2>
              <ul className={styles.list}>
                {items.map((m) => (
                  <Item key={m.id} m={m} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
