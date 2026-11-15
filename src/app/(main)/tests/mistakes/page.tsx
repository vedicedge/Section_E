import Link from 'next/link';
import type { Metadata } from 'next';
import { getStudent } from '@/lib/session';
import { clearedCount, mistakesFor } from '@/lib/quizzes/mistakes-repo';
import { MistakesList } from './MistakesList';
import styles from '@/components/Board.module.css';

export const metadata: Metadata = { title: 'Mistakes notebook' };
export const dynamic = 'force-dynamic';

export default async function MistakesPage() {
  const student = await getStudent();
  if (!student) {
    return (
      <div className="container page">
        <header className={styles.head}>
          <p className="eyebrow">Mock tests · Members only</p>
          <h1 className="page-title">Mistakes notebook</h1>
          <p className={styles.lede}>Every question you got wrong in a mock test, in one place to revise. Register with your roll number to see yours.</p>
        </header>
        <Link href="/register?next=/tests/mistakes" className="btn btn--accent">
          Register to see it
        </Link>
      </div>
    );
  }

  const [{ quizzes, mistakes, hidden }, cleared] = await Promise.all([mistakesFor(student.rollNo), clearedCount(student.rollNo)]);
  return (
    <div className="container page">
      <header className={styles.head}>
        <p className="eyebrow">
          <Link href="/tests">Mock tests</Link> · only you see this
        </p>
        <h1 className="page-title">Mistakes notebook</h1>
        <p className={styles.lede}>
          Questions you got wrong or skipped, from your latest try at each test, with the right answer. Tap “Got it” once you’ve learnt one.
        </p>
      </header>
      <MistakesList quizzes={quizzes} mistakes={mistakes} cleared={cleared} />
      {hidden > 0 && (
        <p className={styles.meta} style={{ marginTop: 24 }}>
          {hidden === 1 ? 'One test keeps' : `${hidden} tests keep`} its answers hidden until it closes, so {hidden === 1 ? 'it isn’t' : 'they aren’t'} here
          yet.
        </p>
      )}
    </div>
  );
}
