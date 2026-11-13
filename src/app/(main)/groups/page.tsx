import Link from 'next/link';
import type { Metadata } from 'next';
import { getStudent } from '@/lib/session';
import { myGroups } from '@/lib/groups/repo';
import styles from './groups.module.css';

export const metadata: Metadata = { title: 'My groups' };
export const dynamic = 'force-dynamic';

export default async function GroupsPage() {
  const student = await getStudent();

  if (!student) {
    return (
      <div className="container page">
        <header className={styles.head}>
          <p className="eyebrow">My groups · Members only</p>
          <h1 className="page-title">My groups</h1>
          <p className={styles.lede}>Your group in each subject, with your group-mates. Register with your roll number to see yours.</p>
        </header>
        <Link href="/register?next=/groups" className="btn btn--accent">
          Register to see it
        </Link>
      </div>
    );
  }

  const groups = await myGroups(student.rollNo);

  return (
    <div className="container page">
      <header className={styles.head}>
        <p className="eyebrow">Only you see this</p>
        <h1 className="page-title">My groups</h1>
        <p className={styles.lede}>Your group in each subject and who’s in it with you. Nobody else’s groups are shown here.</p>
      </header>

      {groups.length === 0 ? (
        <p className={styles.empty}>No group lists include you yet. When one is uploaded for a subject, your group shows up here.</p>
      ) : (
        <div className={styles.grid}>
          {groups.map((g) => (
            <section key={g.setId} className={styles.card} aria-labelledby={`group-${g.setId}`}>
              <div>
                <p className={styles.subject}>
                  {g.subject}
                  {g.title !== 'Groups' && ` · ${g.title}`}
                </p>
                <h2 id={`group-${g.setId}`} className={styles.group}>
                  {g.group}
                </h2>
              </div>
              {g.topic && (
                <div>
                  <p className={styles.topicLabel}>Topic</p>
                  <p className={styles.topic}>{g.topic}</p>
                </div>
              )}
              <ul className={styles.members} aria-label={`Members of ${g.group}`}>
                {g.members.map((m) => (
                  <li key={m.rollNo} className={m.me ? styles.me : undefined}>
                    <span>
                      {m.name}
                      {m.me && <span className={styles.you}>You</span>}
                    </span>
                    <span className={`${styles.roll} tabular`}>{m.rollNo}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
