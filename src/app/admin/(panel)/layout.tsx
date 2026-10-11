import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/session';
import { AdminNav } from './AdminNav';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect('/admin/login');
  return (
    <div className={styles.shell}>
      <AdminNav />
      <main id="main" className={styles.main}>
        {children}
      </main>
    </div>
  );
}
