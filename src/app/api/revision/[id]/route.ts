import { z } from 'zod';
import { HttpError, ok, readJson, requireStudent, route } from '@/lib/http';
import { isAdmin } from '@/lib/session';
import { MAX_DRAFT_CHARS, MAX_KEY_POINTS } from '@/lib/revision/model';
import { getRevisionQuestion, revisionOpenNow, saveProgress } from '@/lib/revision/repo';

const body = z
  .object({
    draft: z.string().max(MAX_DRAFT_CHARS, 'Your answer is too long to save.').optional(),
    covered: z.array(z.number().int().min(0).max(MAX_KEY_POINTS - 1)).max(MAX_KEY_POINTS).optional(),
    revealed: z.literal(true).optional(),
    nailed: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to save.');

/** Saves the signed-in student's own draft, ticked key points, "revealed" and "nailed it" on a question. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const student = await requireStudent();
  // Hidden until it opens (the admin may try it out early while signed in as a student too).
  if (!(await revisionOpenNow()) && !(await isAdmin())) throw new HttpError(404, 'Revision mode isn’t open yet.', 'not_open');
  const question = await getRevisionQuestion((await params).id);
  if (!question) throw new HttpError(404, 'That question was removed.', 'not_found');
  const progress = await saveProgress(student.rollNo, question, await readJson(req, body));
  // The model answer is only sent once the student has chosen to check their answer.
  const answer = progress.revealedAt ? { modelAnswer: question.modelAnswer, keyPoints: question.keyPoints } : null;
  return ok({ progress, answer });
});
