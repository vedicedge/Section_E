import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/admin-guard';
import { listKeyDatesForAdmin } from '@/lib/key-dates';
import { DateForms } from './DateForms';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Dates & exams · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminDates() {
  await requireAdminPage();
  const dates = await listKeyDatesForAdmin();
  return (
    <div className={styles.stack}>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Dates &amp; exams</h1>
          <p className={styles.lede}>
            Exams, TOD presentations, class quizzes and events. Students see the next two weeks in “Coming up” on the home page, next to their
            own homework and mock tests. Exams also drive the countdown card.
          </p>
        </div>
      </header>
      <DateForms dates={dates} />
    </div>
  );
}
