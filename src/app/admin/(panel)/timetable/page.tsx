import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/session';
import { getTimetableDiagnostics } from '@/lib/timetable/service';
import { TimetableSettings } from './TimetableSettings';
import styles from '../../admin.module.css';
import css from './timetable-admin.module.css';

export const metadata: Metadata = { title: 'Timetable · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminTimetable() {
  // The layout's check does not re-run on client-side navigation, and this page carries the sheet link.
  if (!(await isAdmin())) redirect('/admin/login');
  const diagnostics = await getTimetableDiagnostics();
  return (
    <div className={`${styles.stack} ${css.page}`}>
      <header className={styles.pageHead}>
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className={styles.title}>Timetable source</h1>
          <p className={styles.lede}>
            Choose where the official timetable comes from. Whatever the source, every student sees the same copy, Section {diagnostics.config.section}’s
            classes are picked out of it, and anything that changed in the last three days is highlighted.
          </p>
        </div>
      </header>
      <TimetableSettings initial={diagnostics} serverNow={Date.now()} />
    </div>
  );
}
