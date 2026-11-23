import Link from 'next/link';
import type { Metadata } from 'next';
import { getStudent } from '@/lib/session';
import { statusOf, type RevisionStatus } from '@/lib/revision/model';
import { listRevisionQuestions, progressFor, type RevisionQuestion } from '@/lib/revision/repo';
import { revisionGate } from './gate';
import board from '@/components/Board.module.css';
import styles from './revision.module.css';

export const metadata: Metadata = { title: 'Revision' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<RevisionStatus, string> = { new: 'Not started', drafted: 'Draft saved', checked: 'Checked', nailed: 'Nailed it' };

function PreviewNote({ preview }: { preview: boolean }) {
  if (!preview) return null;
  return (
    <p className="notice notice--warn" role="status">
      Admin preview: students can’t see Revision yet. Change when it opens in Admin → Revision.
    </p>
  );
}

function Row({ q, status }: { q: RevisionQuestion; status: RevisionStatus }) {
  return (
    <li>
      <Link href={`/revision/${q.id}`} className={`${board.card} ${styles.row}`} data-testid="revision-item">
        <span className={board.meta}>
          {q.subject} · {q.minutes} min{q.marks ? ` · ${q.marks} marks` : ''}
        </span>
        <span className={board.cardTitle}>{q.title}</span>
        <span className={`pill ${status === 'nailed' ? 'pill--ok' : status === 'new' ? 'pill--muted' : 'pill--warn'} ${styles.status}`}>
          {STATUS_LABEL[status]}
        </span>
      </Link>
    </li>
  );
}

export default async function RevisionPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { preview } = await revisionGate();
  const student = await getStudent();

  if (!student) {
    return (
      <div className="container page">
        <header className={board.head}>
          <p className="eyebrow">Revision · Members only</p>
          <h1 className="page-title">Revision</h1>
          <p className={board.lede}>Exam-style questions to practise writing answers against the clock. Register with your roll number to start.</p>
        </header>
        <Link href="/register?next=/revision" className="btn btn--accent">
          Register to start
        </Link>
      </div>
    );
  }

  const [questions, progress, { s }] = await Promise.all([listRevisionQuestions(), progressFor(student.rollNo), searchParams]);
  const subjects = [...new Set(questions.map((q) => q.subject))];
  const filter = s && subjects.includes(s) ? s : null;
  const shown = questions.filter((q) => !filter || q.subject === filter);
  const withStatus = shown.map((q) => ({ q, status: statusOf(progress.get(q.id)) }));
  const toRevise = withStatus.filter((x) => x.status !== 'nailed');
  const nailed = withStatus.filter((x) => x.status === 'nailed');

  return (
    <div className="container page">
      <PreviewNote preview={preview} />
      <header className={board.head}>
        <p className="eyebrow">End-term practice · only you see your answers</p>
        <h1 className="page-title">Revision</h1>
        <p className={board.lede}>
          Pick a question, write your answer in the time you’d have in the exam, then open the model answer and tick the key points you covered.
        </p>
      </header>

      {subjects.length > 1 && (
        <nav className={board.filters} aria-label="Filter by subject">
          <Link href="/revision" className={`btn btn--sm ${filter ? 'btn--ghost' : 'btn--accent'}`} aria-current={filter ? undefined : 'page'}>
            All ({questions.length})
          </Link>
          {subjects.map((subject) => (
            <Link
              key={subject}
              href={`/revision?s=${encodeURIComponent(subject)}`}
              className={`btn btn--sm ${filter === subject ? 'btn--accent' : 'btn--ghost'}`}
              aria-current={filter === subject ? 'page' : undefined}
            >
              {subject}
            </Link>
          ))}
        </nav>
      )}

      {questions.length === 0 ? (
        <p className={board.empty}>No practice questions yet. They’ll appear here as they’re added.</p>
      ) : (
        <>
          <section aria-labelledby="to-revise">
            <h2 id="to-revise" className={styles.sectionTitle}>
              To revise <span className="count tabular">({toRevise.length})</span>
            </h2>
            {toRevise.length === 0 ? (
              <p className={board.empty}>All nailed. Well done.</p>
            ) : (
              <ul className={styles.list}>
                {toRevise.map(({ q, status }) => (
                  <Row key={q.id} q={q} status={status} />
                ))}
              </ul>
            )}
          </section>
          {nailed.length > 0 && (
            <details className={styles.nailed}>
              <summary className={styles.sectionTitle}>
                Nailed <span className="count tabular">({nailed.length})</span>
              </summary>
              <ul className={styles.list}>
                {nailed.map(({ q, status }) => (
                  <Row key={q.id} q={q} status={status} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
