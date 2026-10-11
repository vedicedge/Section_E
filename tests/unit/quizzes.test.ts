import { describe, expect, it } from 'vitest';
import { grade, shuffle } from '@/lib/quizzes/grading';
import { parseBulkQuestions } from '@/lib/quizzes/bulk';
import { quizInputSchema } from '@/lib/quizzes/schema';

describe('grade', () => {
  const qs = [
    { id: 'q1', correct: ['b'], points: 1 },
    { id: 'q2', correct: ['a', 'c'], points: 2 },
    { id: 'q3', correct: ['d'], points: 1 },
    { id: 'q4', correct: ['a'], points: 1 },
  ];
  it('scores correct, wrong, multi-answer and skipped questions', () => {
    const res = grade(qs, { q1: ['b'], q2: ['c', 'a'], q3: ['a'] }, 0.25);
    expect(res).toMatchObject({ score: 2.75, maxScore: 5, correct: 2, wrong: 1, skipped: 1 });
    expect(res.questions[2]).toMatchObject({ outcome: 'wrong', awarded: -0.25 });
  });
  it('requires the exact set for multi-answer questions', () => {
    expect(grade(qs, { q2: ['a'] }).questions[1]!.outcome).toBe('wrong');
  });
});

describe('shuffle', () => {
  it('keeps every element', () => {
    const out = shuffle([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('parseBulkQuestions', () => {
  it('parses numbered questions with starred answers', () => {
    const { questions, errors } = parseBulkQuestions(`
1. Which ratio measures liquidity?
a) Debt-equity
b) Current ratio *
c) ROE
Explanation: Current assets / current liabilities.

2) Pick the fixed costs
(a) Rent *
(b) Raw material
(c) Insurance *
Points: 2

Q3. Porter's model has how many forces?
A. Three
B. Five
Answer: B
`);
    expect(errors).toEqual([]);
    expect(questions).toHaveLength(3);
    expect(questions[0]).toMatchObject({ prompt: 'Which ratio measures liquidity?', correct: ['b'], multiple: false, explanation: 'Current assets / current liabilities.' });
    expect(questions[1]).toMatchObject({ correct: ['a', 'c'], multiple: true, points: 2 });
    expect(questions[2]!.correct).toEqual(['b']);
  });
  it('reports missing answers', () => {
    const { errors } = parseBulkQuestions('1. Question?\na) One\nb) Two');
    expect(errors[0]).toMatch(/no correct answer/);
  });
});

describe('quizInputSchema', () => {
  it('rejects a correct answer that is not an option', () => {
    const res = quizInputSchema.safeParse({
      title: 'Mock 1',
      questions: [{ prompt: 'Q', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: ['z'] }],
    });
    expect(res.success).toBe(false);
  });
  it('rejects a window that closes before it opens', () => {
    const res = quizInputSchema.safeParse({
      title: 'Mock 1',
      opensAt: '2026-10-12T10:00:00.000Z',
      closesAt: '2026-10-12T09:00:00.000Z',
      questions: [],
    });
    expect(res.success).toBe(false);
  });
});
