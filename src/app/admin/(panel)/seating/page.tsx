import type { Metadata } from 'next';
import { listPlans } from '@/lib/seating/repo';
import { SeatingUpload } from './SeatingUpload';
import { PlanTable } from './PlanTable';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Seating plans · Admin' };

export default async function AdminSeating() {
  const plans = await listPlans();
  return (
    <div className={styles.stack}>
      <header className={styles.pageHead}>
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className={styles.title}>Seating plans</h1>
          <p className={styles.lede}>
            Upload the official workbook (one sheet per subject with “Seat No.”, “Roll No.” and “Name” rows). Students only ever see their own seat;
            the room map they get contains no names.
          </p>
        </div>
      </header>
      <SeatingUpload hasPlans={plans.length > 0} />
      <PlanTable plans={plans} />
    </div>
  );
}
