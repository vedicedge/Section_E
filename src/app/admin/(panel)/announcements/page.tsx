import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/admin-guard';
import { listAnnouncementsForAdmin } from '@/lib/announcements';
import { pushConfigured, subscriptionStats } from '@/lib/push';
import { AnnouncementForms } from './AnnouncementForms';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Announcements · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminAnnouncements() {
  await requireAdminPage();
  const push = pushConfigured();
  const [{ items, students }, subs] = await Promise.all([listAnnouncementsForAdmin(), push ? subscriptionStats() : Promise.resolve(null)]);
  return (
    <div className={styles.stack}>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Announcements</h1>
          <p className={styles.lede}>
            A notice for the whole section. It is sent as a notification to every phone with reminders on
            {subs ? ` (${subs.students} of ${students} students right now)` : ''}, shown on the home page until each student has seen it, and kept
            on the Announcements page. You see how many have seen it, never who. Use “Share to WhatsApp” to post it in the class group too.
          </p>
        </div>
      </header>
      <AnnouncementForms items={items} students={students} push={push} />
    </div>
  );
}
