import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/admin-guard';
import { isRevisionOpen } from '@/lib/revision/model';
import { getRevisionSettings, listRevisionQuestions, revisionActivity } from '@/lib/revision/repo';
import { todayISO } from '@/lib/time';
import { RevisionAdmin } from './RevisionAdmin';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Revision · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminRevision() {
  await requireAdminPage();
  const [settings, questions, activity] = await Promise.all([getRevisionSettings(), listRevisionQuestions(), revisionActivity()]);
  return (
    <div className={styles.stack}>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>Revision</h1>
          <p className={styles.lede}>
            Practice questions for the end-term exams. Students write an answer against the clock, then open the model answer and tick the key
            points they covered. Their answers are private: you only see how many started and how many nailed each question.
          </p>
        </div>
      </header>
      <RevisionAdmin settings={settings} openNow={isRevisionOpen(settings, todayISO())} questions={questions} activity={activity} />
    </div>
  );
}
