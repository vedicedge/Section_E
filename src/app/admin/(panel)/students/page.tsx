import type { Metadata } from 'next';
import { listRoster } from '@/lib/students';
import { Roster } from './Roster';
import styles from '../../admin.module.css';
import { requireAdminPage } from '@/lib/admin-guard';

export const metadata: Metadata = { title: 'Students · Admin' };

export default async function AdminStudents() {
  await requireAdminPage();
  const roster = await listRoster();
  const registered = roster.filter((r) => r.registered).length;
  return (
    <div className={styles.stack}>
      <header className={styles.pageHead}>
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className={styles.title}>Students</h1>
          <p className={styles.lede}>
            The roster comes from the seating-plan upload; add anyone missing here. {registered} of {roster.length} have registered. “Reset” clears a
            forgotten PIN and signs that student out everywhere.
          </p>
        </div>
      </header>
      <Roster roster={roster} />
    </div>
  );
}
