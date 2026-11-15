import type { GradeResult } from './grading';

/**
 * The mistakes notebook: questions a student got wrong (or left blank) in mock tests, for revision.
 * Pure rules here; the database part is in mistakes-repo.ts.
 */

export type ShowAnswers = 'after_each' | 'after_submit' | 'after_close' | 'never';

/** Same rule as the result page: the notebook only shows answers the student is allowed to see. */
export function answersVisible(showAnswers: ShowAnswers, closed: boolean): boolean {
  return showAnswers === 'after_each' || showAnswers === 'after_submit' || (showAnswers === 'after_close' && closed);
}

export interface AttemptForNotebook {
  quizId: string;
  submittedAt: string;
  result: GradeResult;
}

export interface QuestionForNotebook {
  id: string;
  quizId: string;
  position: number;
  prompt: string;
  options: { id: string; text: string }[];
  correct: string[];
  explanation: string;
}

export interface Mistake {
  questionId: string;
  quizId: string;
  position: number;
  prompt: string;
  options: { id: string; text: string }[];
  correct: string[];
  chosen: string[];
  outcome: 'wrong' | 'skipped';
  explanation: string;
  submittedAt: string;
}

/**
 * Uses each quiz's most recent submitted attempt, so a question answered right on a later try
 * drops out. Questions since removed from the quiz, or ticked "Got it", are left out.
 */
export function selectMistakes(attempts: AttemptForNotebook[], questions: QuestionForNotebook[], cleared: Set<string>): Mistake[] {
  const latest = new Map<string, AttemptForNotebook>();
  for (const a of attempts) {
    const cur = latest.get(a.quizId);
    if (!cur || a.submittedAt > cur.submittedAt) latest.set(a.quizId, a);
  }
  const byId = new Map(questions.map((q) => [q.id, q]));
  const out: Mistake[] = [];
  for (const a of latest.values()) {
    for (const r of a.result.questions) {
      if (r.outcome === 'correct' || cleared.has(r.questionId)) continue;
      const q = byId.get(r.questionId);
      if (!q || q.quizId !== a.quizId) continue;
      out.push({
        questionId: q.id,
        quizId: q.quizId,
        position: q.position,
        prompt: q.prompt,
        options: q.options,
        correct: q.correct,
        chosen: r.chosen,
        outcome: r.outcome,
        explanation: q.explanation,
        submittedAt: a.submittedAt,
      });
    }
  }
  return out.sort((x, y) => y.submittedAt.localeCompare(x.submittedAt) || x.position - y.position);
}
