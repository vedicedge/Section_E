import { z } from 'zod';
import { HttpError, ok, readJson, requireStudent, route } from '@/lib/http';
import { finalizeAttempt, getAttempt } from '@/lib/quizzes/repo';
import { answersSchema, flaggedSchema } from '@/lib/quizzes/schema';

const body = z.object({ answers: answersSchema, flagged: flaggedSchema.default([]), auto: z.boolean().default(false) });

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const student = await requireStudent();
  const { id } = await params;
  const attempt = await getAttempt(id);
  if (!attempt || attempt.rollNo !== student.rollNo) throw new HttpError(404, 'Attempt not found.', 'not_found');
  const { answers, flagged, auto } = await readJson(req, body);
  // Only keep answers for questions/options that belong to this attempt.
  const allowed = new Map(attempt.questionOrder.map((q) => [q.id, new Set(q.options)]));
  const clean: Record<string, string[]> = {};
  for (const [qid, picked] of Object.entries(answers)) {
    const valid = allowed.get(qid);
    if (valid) clean[qid] = picked.filter((o) => valid.has(o));
  }
  const done = await finalizeAttempt(id, { answers: clean, flagged: flagged.filter((f) => allowed.has(f)), auto });
  return ok({ resultUrl: `/tests/result/${done.id}`, score: done.score, maxScore: done.maxScore });
});
