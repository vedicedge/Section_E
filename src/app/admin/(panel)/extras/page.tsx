import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/admin-guard';
import { listMockLinks, listPromotions } from '@/lib/extras';
import { ExtrasForms } from './ExtrasForms';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Posters & links · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminExtras() {
  await requireAdminPage();
  const [promotions, links] = await Promise.all([listPromotions(), listMockLinks()]);
  return (
    <div className={styles.stack}>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Posters &amp; links</h1>
          <p className={styles.lede}>
            Event posters pop up for every visitor between their dates (once per visit, and they can close them). Mock tests made in Claude
            appear on the OLT Mock Tests page.
          </p>
        </div>
      </header>
      <ExtrasForms promotions={promotions} links={links} />
    </div>
  );
}
