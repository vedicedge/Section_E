import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStudent } from '@/lib/session';
import { getRevisionQuestion, listRevisionQuestions, progressFor, progressOn } from '@/lib/revision/repo';
import { revisionGate } from '../gate';
import { Writer } from './Writer';
import board from '@/components/Board.module.css';
import styles from '../revision.module.css';

export const metadata: Metadata = { title: 'Revision' };
export const dynamic = 'force-dynamic';

export default async function RevisionQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { preview } = await revisionGate();
  const { id } = await params;
  const student = await getStudent();
  if (!student) {
    return (
      <div className="container page">
        <header className={board.head}>
          <p className="eyebrow">Revision · Members only</p>
          <h1 className="page-title">Revision</h1>
        </header>
        <Link href={`/register?next=/revision/${encodeURIComponent(id)}`} className="btn btn--accent">
          Register to start
        </Link>
      </div>
    );
  }

  const question = await getRevisionQuestion(id);
  if (!question) notFound();
  const [progress, all, mine] = await Promise.all([progressOn(student.rollNo, question), listRevisionQuestions(), progressFor(student.rollNo)]);

  // "Next question": the next one in this subject you haven't nailed, wrapping round.
  const same = all.filter((q) => q.subject === question.subject);
  const at = same.findIndex((q) => q.id === question.id);
  const next = [...same.slice(at + 1), ...same.slice(0, at)].find((q) => !mine.get(q.id)?.nailedAt) ?? null;
  const revealed = Boolean(progress?.revealedAt);

  return (
    <div className="container page">
      {preview && (
        <p className="notice notice--warn" role="status">
          Admin preview: students can’t see Revision yet.
        </p>
      )}
      <header className={board.head}>
        <p className="eyebrow">
          <Link href="/revision">Revision</Link> · {question.subject}
        </p>
        <h1 className="page-title">{question.title}</h1>
        <p className={board.meta}>
          {question.minutes} minutes{question.marks ? ` · ${question.marks} marks` : ''} · {question.keyPoints.length} key{' '}
          {question.keyPoints.length === 1 ? 'point' : 'points'} to cover
        </p>
      </header>

      <section className={`${board.card} ${styles.prompt}`} aria-label="Question">
        {question.prompt}
      </section>

      <Writer
        questionId={question.id}
        minutes={question.minutes}
        keyPointCount={question.keyPoints.length}
        initial={{
          draft: progress?.draft ?? '',
          covered: progress?.covered ?? [],
          nailed: Boolean(progress?.nailedAt),
          answer: revealed ? { modelAnswer: question.modelAnswer, keyPoints: question.keyPoints } : null,
        }}
        next={next ? { id: next.id, title: next.title } : null}
      />
    </div>
  );
}
