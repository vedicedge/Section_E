import 'server-only';
import { query } from '../db';
import type { GradeResult } from './grading';
import { phaseOf } from './repo';
import { answersVisible, selectMistakes, type Mistake, type ShowAnswers } from './mistakes';

export interface NotebookQuiz {
  id: string;
  title: string;
  subject: string | null;
}

/** This student's open mistakes, grouped with the quizzes they came from. */
export async function mistakesFor(rollNo: string): Promise<{ quizzes: NotebookQuiz[]; mistakes: Mistake[]; hidden: number }> {
  const attempts = await query<{
    quiz_id: string;
    submitted_at: Date;
    result: GradeResult | null;
    title: string;
    subject: string | null;
    status: string;
    opens_at: Date | null;
    closes_at: Date | null;
    show_answers: ShowAnswers;
  }>(
    `SELECT a.quiz_id, a.submitted_at, a.result, q.title, q.subject, q.status, q.opens_at, q.closes_at, q.show_answers
     FROM quiz_attempts a JOIN quizzes q ON q.id = a.quiz_id
     WHERE a.roll_no = $1 AND a.submitted_at IS NOT NULL AND a.result IS NOT NULL`,
    [rollNo],
  );
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
  const quizzes = new Map<string, NotebookQuiz>();
  const visible = attempts.filter((a) => {
    // Same rule as the result page (src/app/(main)/tests/result/[attemptId]/page.tsx).
    const closed = phaseOf({ status: a.status, opensAt: iso(a.opens_at), closesAt: iso(a.closes_at) }) === 'closed';
    return answersVisible(a.show_answers, closed);
  });
  const hiddenQuizzes = new Set(attempts.filter((a) => !visible.includes(a)).map((a) => a.quiz_id));
  for (const a of visible) quizzes.set(a.quiz_id, { id: a.quiz_id, title: a.title, subject: a.subject });
  if (!visible.length) return { quizzes: [], mistakes: [], hidden: hiddenQuizzes.size };

  const quizIds = [...quizzes.keys()];
  const [questions, cleared] = await Promise.all([
    query<{ id: string; quiz_id: string; position: number; prompt: string; options: { id: string; text: string }[]; correct: string[]; explanation: string }>(
      'SELECT id, quiz_id, position, prompt, options, correct, explanation FROM quiz_questions WHERE quiz_id = ANY($1::text[])',
      [quizIds],
    ),
    query<{ question_id: string }>('SELECT question_id FROM mistakes_cleared WHERE roll_no = $1', [rollNo]),
  ]);
  const mistakes = selectMistakes(
    visible.map((a) => ({ quizId: a.quiz_id, submittedAt: new Date(a.submitted_at).toISOString(), result: a.result! })),
    questions.map((q) => ({ id: q.id, quizId: q.quiz_id, position: Number(q.position), prompt: q.prompt, options: q.options, correct: q.correct, explanation: q.explanation })),
    new Set(cleared.map((c) => c.question_id)),
  );
  return { quizzes: [...quizzes.values()], mistakes, hidden: hiddenQuizzes.size };
}

export async function setCleared(rollNo: string, questionId: string, cleared: boolean) {
  if (cleared) {
    await query('INSERT INTO mistakes_cleared (roll_no, question_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [rollNo, questionId]);
  } else {
    await query('DELETE FROM mistakes_cleared WHERE roll_no = $1 AND question_id = $2', [rollNo, questionId]);
  }
}

export async function clearedCount(rollNo: string): Promise<number> {
  const [row] = await query<{ n: number }>('SELECT count(*)::int AS n FROM mistakes_cleared WHERE roll_no = $1', [rollNo]);
  return Number(row?.n ?? 0);
}

export async function resetCleared(rollNo: string) {
  await query('DELETE FROM mistakes_cleared WHERE roll_no = $1', [rollNo]);
}
