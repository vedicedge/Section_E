import Link from 'next/link';
import type { Metadata } from 'next';
import { getStudent } from '@/lib/session';
import { homeworkForStudent } from '@/lib/homework/repo';
import { pushConfigured } from '@/lib/push';
import { todayISO } from '@/lib/time';
import { Hourglass } from '@/components/Engravings';
import { ReminderToggle } from '@/components/ReminderToggle';
import { HomeworkBoard, type BoardItem } from './HomeworkBoard';
import styles from './homework.module.css';

export const metadata: Metadata = { title: 'Homework' };
export const dynamic = 'force-dynamic';

export default async function HomeworkPage() {
  const student = await getStudent();

  if (!student) {
    return (
      <div className="container page">
        <header className={styles.head}>
          <p className="eyebrow">Homework · Members only</p>
          <h1 className="page-title">
            Home<em>work</em>
          </h1>
        </header>
        <section className={styles.empty} aria-label="Register to see homework">
          <Hourglass className={styles.emptyArt} />
          <div>
            <h2 className={styles.emptyTitle}>
              Due tomorrow, <em>sorted.</em>
            </h2>
            <p className={styles.emptyText}>
              Every assignment for Section E, sorted by when it’s due — with a reminder the evening before, so nothing sneaks up on you.
            </p>
            <div className={styles.teaserActions}>
              <Link href="/register?next=/homework" className="btn btn--accent">
                Register to see it <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const today = todayISO();
  const items: BoardItem[] = (await homeworkForStudent(student.rollNo)).map((h) => ({
    id: h.id,
    subjectCode: h.subjectCode,
    subjectTitle: h.subjectTitle,
    title: h.title,
    details: h.details,
    givenOn: h.givenOn,
    dueMode: h.dueMode,
    due: h.due,
    bucket: h.bucket,
    done: h.done,
  }));

  return (
    <div className="container page">
      <HomeworkBoard
        rollNo={student.rollNo}
        today={today}
        items={items}
        reminder={<ReminderToggle rollNo={student.rollNo} configured={pushConfigured()} />}
      />
    </div>
  );
}
