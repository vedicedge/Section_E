import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/admin-guard';
import { listPlacements } from '@/lib/placements/repo';
import { pushConfigured } from '@/lib/push';
import { PlacementCard } from './PlacementCard';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Placements · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminPlacements() {
  await requireAdminPage();
  const all = await listPlacements();
  const pending = all.filter((p) => p.status === 'pending');
  const approved = all.filter((p) => p.status === 'approved');
  const dismissed = all.filter((p) => p.status === 'dismissed');
  const push = pushConfigured();
  return (
    <div className={styles.stack}>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Placements</h1>
          <p className={styles.lede}>
            Pre-Placement Talks found in the placement emails. Check the details, then approve: the students on the attendee list are told
            and the calendar invite is created by the inbox script.
            {push ? '' : ' Notifications are not set up (VAPID keys missing), so approving will not notify anyone.'}
          </p>
        </div>
      </header>

      <section className={styles.stack} aria-labelledby="ppt-pending">
        <h2 id="ppt-pending" className={styles.panelTitle}>
          Waiting for you
        </h2>
        {pending.length === 0 && <p className={styles.dim}>Nothing to review right now.</p>}
        {pending.map((p) => (
          <PlacementCard key={p.id} p={p} />
        ))}
      </section>

      {approved.length > 0 && (
        <section className={styles.stack} aria-labelledby="ppt-approved">
          <h2 id="ppt-approved" className={styles.panelTitle}>
            Approved
          </h2>
          {approved.map((p) => (
            <PlacementCard key={p.id} p={p} />
          ))}
        </section>
      )}

      {dismissed.length > 0 && (
        <section className={styles.stack} aria-labelledby="ppt-dismissed">
          <h2 id="ppt-dismissed" className={styles.panelTitle}>
            Dismissed
          </h2>
          {dismissed.map((p) => (
            <PlacementCard key={p.id} p={p} />
          ))}
        </section>
      )}
    </div>
  );
}
