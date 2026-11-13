import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/admin-guard';
import { listGroupSets } from '@/lib/groups/repo';
import { GroupsForm } from './GroupsForm';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Groups · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminGroups() {
  await requireAdminPage();
  const sets = await listGroupSets();
  return (
    <div className={styles.stack}>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Groups</h1>
          <p className={styles.lede}>
            Upload each subject’s group list. Every student sees only their own group (with its topic, if the list has one) on the
            My groups page, and nobody else’s. Names come from the roster, not from the file.
          </p>
        </div>
      </header>
      <GroupsForm sets={sets} />
    </div>
  );
}
