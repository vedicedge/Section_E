import Link from 'next/link';
import type { Metadata } from 'next';
import { getStudent } from '@/lib/session';
import { liveAnnouncements } from '@/lib/announcements';
import { query } from '@/lib/db';
import { formatDateTime } from '@/lib/time';
import { MarkSeen } from '@/components/MarkSeen';
import styles from '@/components/Board.module.css';

export const metadata: Metadata = { title: 'Announcements' };
export const dynamic = 'force-dynamic';

export default async function AnnouncementsPage() {
  const student = await getStudent();
  if (!student) {
    return (
      <div className="container page">
        <header className={styles.head}>
          <p className="eyebrow">Announcements · Members only</p>
          <h1 className="page-title">Announcements</h1>
          <p className={styles.lede}>Notices for Section E. Register with your roll number to read them.</p>
        </header>
        <Link href="/register?next=/announcements" className="btn btn--accent">
          Register to see them
        </Link>
      </div>
    );
  }

  const items = await liveAnnouncements();
  const seenRows = items.length
    ? await query<{ announcement_id: string }>('SELECT announcement_id FROM announcement_seen WHERE roll_no = $1 AND announcement_id = ANY($2::text[])', [
        student.rollNo,
        items.map((a) => a.id),
      ])
    : [];
  const seen = new Set(seenRows.map((r) => r.announcement_id));

  return (
    <div className="container page">
      <header className={styles.head}>
        <p className="eyebrow">For Section E</p>
        <h1 className="page-title">Announcements</h1>
        <p className={styles.lede}>Notices from the class admin, newest first. Turn on reminders on the Homework page to get them as notifications.</p>
      </header>
      {items.length === 0 ? (
        <p className={styles.empty}>No announcements right now.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((a) => (
            <li key={a.id} className={styles.card} data-testid="announcement">
              <h2 className={styles.cardTitle}>
                {!seen.has(a.id) && <span className={styles.new}>New</span>}
                {a.title}
              </h2>
              {a.body && <p className={styles.cardBody}>{a.body}</p>}
              {a.link && (
                <a href={a.link} target="_blank" rel="noopener noreferrer" className="arrow-link">
                  Open the link<span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
              <span className={styles.meta}>Posted {formatDateTime(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
      <MarkSeen ids={items.filter((a) => !seen.has(a.id)).map((a) => a.id)} />
    </div>
  );
}
