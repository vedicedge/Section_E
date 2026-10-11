import type { Metadata } from 'next';
import { getTimetableDiagnostics } from '@/lib/timetable/service';
import { TimetableSettings } from './TimetableSettings';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Timetable · Admin' };

export default async function AdminTimetable() {
  const diagnostics = await getTimetableDiagnostics();
  return (
    <div className={styles.stack}>
      <header className={styles.pageHead}>
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className={styles.title}>Timetable source</h1>
          <p className={styles.lede}>
            Paste the official timetable’s share link. The site downloads it directly from the source (at most every {diagnostics.ttlSeconds}s, or when someone
            presses Refresh), so edits to the sheet show up without touching this website.
          </p>
        </div>
      </header>
      <TimetableSettings initial={diagnostics} />
    </div>
  );
}
