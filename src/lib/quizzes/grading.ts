export interface GradableQuestion {
  id: string;
  correct: string[];
  points: number;
}

export interface QuestionResult {
  questionId: string;
  chosen: string[];
  correct: string[];
  outcome: 'correct' | 'wrong' | 'skipped';
  awarded: number;
  points: number;
}

export interface GradeResult {
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  skipped: number;
  questions: QuestionResult[];
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * All-or-nothing per question (multi-answer questions need the exact set).
 * Wrong answers lose `negativeMarking × points` (e.g. 0.25 for quarter-mark negative marking).
 */
export function grade(questions: GradableQuestion[], answers: Record<string, string[]>, negativeMarking = 0): GradeResult {
  let score = 0;
  let maxScore = 0;
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  const results: QuestionResult[] = [];

  for (const q of questions) {
    const chosen = [...new Set(answers[q.id] ?? [])].sort();
    const key = [...new Set(q.correct)].sort();
    maxScore += q.points;
    let outcome: QuestionResult['outcome'];
    let awarded = 0;
    if (chosen.length === 0) {
      outcome = 'skipped';
      skipped++;
    } else if (chosen.length === key.length && chosen.every((c, i) => c === key[i])) {
      outcome = 'correct';
      awarded = q.points;
      correct++;
    } else {
      outcome = 'wrong';
      awarded = -negativeMarking * q.points;
      wrong++;
    }
    score += awarded;
    results.push({ questionId: q.id, chosen, correct: key, outcome, awarded: round(awarded), points: q.points });
  }
  return { score: round(score), maxScore: round(maxScore), correct, wrong, skipped, questions: results };
}

/** Fisher–Yates with an injectable RNG (crypto in production, seeded in tests). */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
