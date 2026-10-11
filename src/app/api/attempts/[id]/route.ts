import { z } from 'zod';
import { HttpError, ok, readJson, requireStudent, route } from '@/lib/http';
import { getAttempt, saveProgress } from '@/lib/quizzes/repo';
import { answersSchema, flaggedSchema } from '@/lib/quizzes/schema';

const body = z.object({ answers: answersSchema, flagged: flaggedSchema.default([]) });

/** Autosave: called every few seconds while a student answers. */
export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const student = await requireStudent();
  const { id } = await params;
  const attempt = await getAttempt(id);
  if (!attempt || attempt.rollNo !== student.rollNo) throw new HttpError(404, 'Attempt not found.', 'not_found');
  const { answers, flagged } = await readJson(req, body);
  await saveProgress(attempt, answers, flagged);
  return ok({ savedAt: new Date().toISOString(), serverNow: Date.now(), deadlineAt: attempt.deadlineAt });
});
